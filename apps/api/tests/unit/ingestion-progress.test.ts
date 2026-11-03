import type { IngestionRuntime } from '@api/modules/ingestion/runtime'
import { runIngestion } from '@api/modules/ingestion/service'
import { expect, it, vi } from 'vitest'

// Exercise the real parser and ingestion loop against synthetic persistence.
// Gates expose the durable history projection before the request completes.
const source = {
  kind: 'telegram' as const,
  id: '0123456789abcdef01234567',
  provider: 'TELEGRAM' as const,
  externalId: 'syntheticfood',
  name: 'Synthetic food',
  url: 'https://t.me/s/syntheticfood',
  enabled: true,
  cursor: null,
}
const post = (id: string) => ({
  externalId: id,
  url: `https://t.me/syntheticfood/${id}`,
  publishedAt: '2026-10-01T12:00:00Z',
  sourceUpdatedAt: null,
  title: `Synthetic pizza ${id}`,
  contentHtml: 'Singapore pizza 25% off. Valid until 31 December 2026.',
  excerptHtml: '',
  images: [],
})
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}
const fixture = (
  posts: unknown[],
  progress: (data: Record<string, unknown>) => Promise<void> = async () => {},
) => {
  const row: Record<string, unknown> = {
    id: '1123456789abcdef01234567',
    status: 'RUNNING',
    fetchedCount: 0,
    createdCount: 0,
    updatedCount: 0,
    failedCount: 0,
    finishedAt: null,
  }
  let enabled = true
  const database = {
    importSource: {
      upsert: vi.fn(async () => ({ ...source, enabled })),
      findUniqueOrThrow: vi.fn(async () => ({ ...source, enabled })),
      updateMany: vi.fn(async ({ where }: { where: { enabled?: boolean } }) => ({
        count: where.enabled && !enabled ? 0 : 1,
      })),
    },
    ingestionRun: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({ ...row })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        await progress(data)
        Object.assign(row, data)
        return { ...row }
      }),
    },
    importedPost: {
      findUnique: vi.fn(
        async (_input: { where: { sourceId_externalId: { externalId: string } } }) => null,
      ),
      upsert: vi.fn(
        async (_input: { create?: { status?: string }; update?: { status?: string } }) => ({
          id: '2123456789abcdef01234567',
        }),
      ),
    },
    promotionIdentity: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
    },
    deal: { create: vi.fn(async () => ({ id: '3123456789abcdef01234567' })) },
    $transaction: async <T>(work: (tx: unknown) => Promise<T>): Promise<T> => work(database),
  }
  const runtime: IngestionRuntime = {
    enabled: true,
    reuseApproved: true,
    now: () => new Date('2026-10-20T00:00:00Z'),
    listPosts: async () => [],
    sources: [
      {
        source,
        reuseApproved: true,
        listPosts: async () => ({ posts, nextCursor: null }),
      },
    ],
  }
  const run = () => runIngestion(database as unknown as Parameters<typeof runIngestion>[0], runtime)
  return {
    database,
    row,
    run,
    runtime,
    disable: () => {
      enabled = false
    },
  }
}

it('publishes fetched and completed post counts while the source is still running', async () => {
  const reachedSecondPost = deferred()
  const continueSecondPost = deferred()
  const { database, row, run } = fixture([post('101'), post('102')])
  database.importedPost.findUnique.mockImplementation(
    async ({ where }: { where: { sourceId_externalId: { externalId: string } } }) => {
      if (where.sourceId_externalId.externalId === '102') {
        reachedSecondPost.resolve()
        await continueSecondPost.promise
      }
      return null
    },
  )
  const result = run()
  await reachedSecondPost.promise
  expect(row).toMatchObject({
    status: 'RUNNING',
    fetchedCount: 2,
    createdCount: 1,
    failedCount: 0,
    finishedAt: null,
  })
  expect(database.deal.create).toHaveBeenCalledTimes(1)
  continueSecondPost.resolve()
  await expect(result).resolves.toMatchObject({
    status: 'SUCCEEDED',
    fetchedCount: 2,
    createdCount: 2,
    failedCount: 0,
  })
  expect(row).toMatchObject({
    status: 'SUCCEEDED',
    fetchedCount: 2,
    createdCount: 2,
    failedCount: 0,
    finishedAt: expect.any(Date),
  })
})

it('publishes failed post counts before finalizing the source outcome', async () => {
  const failurePublished = deferred()
  const continueRun = deferred()
  const { database, row, run } = fixture([post('101'), { ...post('102'), title: 42 }])
  const update = database.ingestionRun.update.getMockImplementation()
  if (!update) throw new Error('Missing synthetic persistence')
  database.ingestionRun.update.mockImplementation(async (input) => {
    if (input.data.status === 'PARTIAL') {
      failurePublished.resolve()
      await continueRun.promise
    }
    return update(input)
  })
  const result = run()
  await failurePublished.promise
  expect(row).toMatchObject({
    status: 'RUNNING',
    fetchedCount: 2,
    createdCount: 1,
    failedCount: 1,
    errorCode: 'MALFORMED_POST',
    finishedAt: null,
  })
  continueRun.resolve()
  await expect(result).resolves.toMatchObject({
    status: 'PARTIAL',
    createdCount: 1,
    failedCount: 1,
  })
  expect(row).toMatchObject({
    status: 'PARTIAL',
    createdCount: 1,
    failedCount: 1,
    errorCode: 'MALFORMED_POST',
  })
})

it('refuses progress and post writes after source admission is revoked during fetch', async () => {
  const { database, row, run, runtime, disable } = fixture([post('101')])
  const provider = runtime.sources?.[0]
  if (!provider) throw new Error('Missing synthetic provider')
  provider.listPosts = async () => {
    disable()
    return { posts: [post('101')], nextCursor: null }
  }
  await expect(run()).resolves.toMatchObject({ status: 'FAILED', fetchedCount: 1, createdCount: 0 })
  expect(database.deal.create).not.toHaveBeenCalled()
  expect(database.importedPost.upsert).not.toHaveBeenCalled()
  expect(
    database.ingestionRun.update.mock.calls.some(
      ([call]) => call.data.fetchedCount === 1 && call.data.status === undefined,
    ),
  ).toBe(false)
  expect(row).toMatchObject({
    status: 'FAILED',
    errorCode: 'CONFLICT',
    finishedAt: expect.any(Date),
  })
})

it('does not mark committed content as failed when publishing progress fails', async () => {
  const { database, row, run } = fixture([post('101')], async (data) => {
    if (data.createdCount === 1 && data.status === undefined)
      throw new Error('Synthetic storage failure')
  })
  await expect(run()).resolves.toMatchObject({ status: 'FAILED', createdCount: 1, failedCount: 0 })
  expect(database.deal.create).toHaveBeenCalledTimes(1)
  expect(
    database.importedPost.upsert.mock.calls.some(
      ([call]) => call.create?.status === 'FAILED' || call.update?.status === 'FAILED',
    ),
  ).toBe(false)
  expect(row).toMatchObject({ status: 'FAILED', createdCount: 1, failedCount: 0 })
})
