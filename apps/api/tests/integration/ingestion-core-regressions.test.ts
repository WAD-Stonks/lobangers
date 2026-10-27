import { execFile } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parseConfig } from '@api/config'
import type { IngestionRuntime } from '@api/modules/ingestion/runtime'
import { parseSourcePost } from '@api/modules/ingestion/source-post'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const origin = 'http://localhost:5173'
const sources = [
  {
    kind: 'moneydigest',
    provider: 'WORDPRESS',
    externalId: 'moneydigest.sg',
    name: 'Synthetic MoneyDigest',
    url: 'https://www.moneydigest.sg/',
  },
  {
    kind: 'scoobify',
    provider: 'WORDPRESS',
    externalId: 'scoobifydaily.wordpress.com',
    name: 'Synthetic Scoobify',
    url: 'https://scoobifydaily.wordpress.com/',
  },
] as const
const body =
  'Singapore pizza 25% off. Valid from 1 October 2026 until 31 December 2026. All outlets. No membership required.'
const post = (index: number, contentHtml = body) => ({
  externalId: '101',
  url: `${sources[index]?.url}synthetic-101/`,
  publishedAt: '2026-10-01T12:00:00Z',
  sourceUpdatedAt: null,
  title: 'Synthetic Acme Pizza',
  contentHtml,
  excerptHtml: '',
  images: [],
})
let clock = new Date('2026-10-20T00:00:00Z')
const tick = () => {
  clock = new Date(clock.getTime() + 31_000)
}
const lists = sources.map(() => vi.fn().mockResolvedValue({ posts: [], nextCursor: null }))
const runtime: IngestionRuntime = {
  enabled: true,
  reuseApproved: true,
  now: () => clock,
  listPosts: async () => [],
  sources: sources.map((source, i) => ({ source, reuseApproved: true, listPosts: lists[i] })),
}
let mongo: MongoMemoryReplSet
let db: typeof import('@broke-oclock/db').db
let server: Server
let baseURL = ''
let cookie = ''
const request = (path = '/api/ingestion/runs', options: RequestInit = {}) =>
  fetch(`${baseURL}${path}`, {
    method: 'POST',
    headers: { Origin: origin, Cookie: cookie },
    ...options,
  })
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const databaseUrl = mongo.getUri(`core_regressions_${randomUUID().replaceAll('-', '')}`)
  expect(databaseUrl).toMatch(/^mongodb:\/\/127\.0\.0\.1:/u)
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  await promisify(execFile)(
    'pnpm',
    ['--dir', 'packages/db', 'exec', 'prisma', 'db', 'push', '--skip-generate'],
    {
      cwd: root,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      timeout: 60_000,
    },
  )
  db = (await import('@broke-oclock/db')).db
  const { createApp } = await import('@api/app')
  server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No fixture server')
  baseURL = `http://127.0.0.1:${address.port}`
  server.on(
    'request',
    createApp(
      parseConfig({
        DATABASE_URL: databaseUrl,
        BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
        BETTER_AUTH_URL: baseURL,
        WEB_ORIGIN: origin,
      }),
      { ingestion: runtime },
    ),
  )
  const signup = await fetch(`${baseURL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      name: 'Synthetic admin',
      email: `${randomUUID()}@example.test`,
      password: randomBytes(24).toString('base64url'),
    }),
  })
  expect(signup.status).toBe(200)
  cookie = signup.headers
    .getSetCookie()
    .map((v) => v.split(';')[0])
    .join('; ')
  const user = (await signup.json()).user
  await db.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } })
}, 180_000)
beforeEach(async () => {
  tick()
  delete runtime.fetchImage
  delete runtime.imageStorage
  for (const [i, source] of sources.entries()) {
    const { kind: _, ...identity } = source
    await db.importSource.upsert({
      where: { provider_externalId: { provider: source.provider, externalId: source.externalId } },
      create: { ...identity, enabled: true },
      update: { enabled: true },
    })
    lists[i]?.mockReset().mockResolvedValue({ posts: [], nextCursor: null })
  }
  await db.dealSourceImage.deleteMany()
  await db.importedImage.deleteMany()
  await db.promotionIdentity.deleteMany()
  await db.dealSource.deleteMany()
  await db.deal.deleteMany()
  await db.importedPost.deleteMany()
  await db.ingestionRun.deleteMany()
})
afterAll(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
  await db?.$disconnect()
  await mongo?.stop()
  vi.unstubAllEnvs()
})

it.each([
  [
    'coupon password',
    'Coupon passwords are case-sensitive. Use AbCd at checkout.',
    'Coupon passwords are case-sensitive. Use abcd at checkout.',
  ],
  [
    'redemption URL path',
    'Redeem at https://acme.example/AbCd',
    'Redeem at https://acme.example/abcd',
  ],
])(
  'R1 preserves distinct case-sensitive %s evidence through HTTP ingestion',
  async (_, first, second) => {
    lists[0]?.mockResolvedValue({ posts: [post(0, `${body} ${first}`)], nextCursor: null })
    lists[1]?.mockResolvedValue({ posts: [post(1, `${body} ${second}`)], nextCursor: null })
    const response = await request()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'SUCCEEDED', failedCount: 0 })
    expect(await db.deal.count()).toBe(2)
    expect(await db.promotionIdentity.count()).toBe(2)
    const citations = await db.dealSource.findMany({ include: { deal: true } })
    expect(citations).toHaveLength(2)
    expect(new Set(citations.map((citation) => citation.dealId)).size).toBe(2)
    expect(citations.map((citation) => citation.sourceContentSnapshot)).toEqual(
      expect.arrayContaining([expect.stringContaining(first), expect.stringContaining(second)]),
    )
  },
)

it.each(
  (['PENDING', 'REJECTED', 'APPROVED', 'HIDDEN'] as const).flatMap((status) =>
    (['metadata', 'image'] as const).map((refresh) => [status, refresh] as const),
  ),
)(
  'R2 preserves the %s canonical decision on %s refresh followed by a different-source import',
  async (reviewStatus, refreshKind) => {
    lists[0]?.mockResolvedValue({ posts: [post(0)], nextCursor: null })
    expect((await request()).status).toBe(200)
    const original = await db.deal.findFirstOrThrow()
    await db.deal.update({
      where: { id: original.id },
      data: {
        reviewStatus,
        reviewNote: reviewStatus === 'PENDING' ? null : 'Synthetic deliberate moderation',
        reviewedVersion: reviewStatus === 'PENDING' ? null : original.contentVersion,
        publishedAt: reviewStatus === 'APPROVED' ? clock : null,
      },
    })
    const frozen = await db.deal.findUniqueOrThrow({
      where: { id: original.id },
      include: { sources: { include: { images: true } } },
    })
    const imported = await db.importedPost.findFirstOrThrow()
    // Each transport-only change must preserve the same immutable citation and canonical row.
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

    runtime.fetchImage = vi.fn().mockImplementation(async (url: string) => ({
      bytes,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      mimeType: 'image/jpeg',
      byteLength: bytes.length,
      url,
      finalUrl: url,
    }))
    runtime.imageStorage = {
      upload: vi.fn().mockResolvedValue({
        key: 'synthetic-core-key',
        url: 'https://synthetic.ufs.sh/f/synthetic-core-key',
      }),
      resolve: vi.fn().mockResolvedValue(null),
    }
    const refresh =
      refreshKind === 'metadata'
        ? {
            ...post(0),
            sourceUpdatedAt: '2026-10-20T01:00:00Z',
            publishedAt: '2026-10-02T12:00:00Z',
          }
        : { ...post(0), images: [{ url: 'https://www.moneydigest.sg/synthetic-new-poster.jpg' }] }
    tick()
    lists[0]?.mockResolvedValue({ posts: [refresh], nextCursor: null })
    const refreshed = await request()
    expect(refreshed.status).toBe(200)
    expect(await refreshed.json()).toMatchObject({
      status: 'SUCCEEDED',
      createdCount: 0,
      updatedCount: 0,
      failedCount: 0,
    })
    expect(await db.deal.count()).toBe(1)
    expect(
      await db.deal.findUniqueOrThrow({
        where: { id: original.id },
        include: { sources: { include: { images: true } } },
      }),
    ).toEqual(frozen)
    expect(await db.importedPost.findUniqueOrThrow({ where: { id: imported.id } })).toMatchObject({
      contentHash: imported.contentHash,
      errorCode: null,
      processedContentHash: createHash('sha256')
        .update(JSON.stringify(parseSourcePost(refresh, sources[0]).snapshot))
        .digest('hex'),
      processedAt: clock,
      fetchedAt: clock,
    })
    expect(await db.promotionIdentity.findFirstOrThrow()).toMatchObject({ dealId: original.id })
    lists[0]?.mockResolvedValue({ posts: [], nextCursor: null })
    lists[1]?.mockResolvedValue({ posts: [post(1)], nextCursor: null })
    tick()
    expect((await request()).status).toBe(200)
    expect(await db.deal.count()).toBe(1)
    const { sources: frozenCitations, ...frozenDeal } = frozen
    expect(await db.deal.findUniqueOrThrow({ where: { id: original.id } })).toEqual(frozenDeal)
    expect(await db.dealSource.count({ where: { dealId: original.id } })).toBe(2)
    expect(
      await db.dealSource.findUniqueOrThrow({
        where: { id: frozenCitations[0]?.id },
        include: { images: true },
      }),
    ).toEqual(frozenCitations[0])
    expect(await db.promotionIdentity.findFirstOrThrow()).toMatchObject({ dealId: original.id })
  },
)

it('R2 control creates a new pending promotion identity after an approved metadata refresh', async () => {
  lists[0]?.mockResolvedValue({ posts: [post(0)], nextCursor: null })
  expect((await request()).status).toBe(200)
  const original = await db.deal.findFirstOrThrow()
  await db.deal.update({
    where: { id: original.id },
    data: {
      reviewStatus: 'APPROVED',
      reviewedVersion: original.contentVersion,
      publishedAt: clock,
    },
  })
  const frozen = await db.deal.findUniqueOrThrow({
    where: { id: original.id },
    include: { sources: true },
  })
  lists[0]?.mockResolvedValue({
    posts: [{ ...post(0), sourceUpdatedAt: '2026-10-20T01:00:00Z' }],
    nextCursor: null,
  })
  tick()
  expect((await request()).status).toBe(200)
  const changed = body.replace('25% off', '30% off')
  lists[0]?.mockResolvedValue({ posts: [post(0, changed)], nextCursor: null })
  tick()
  const response = await request()
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ createdCount: 1, failedCount: 0 })
  const revision = await db.deal.findFirstOrThrow({ where: { reviewStatus: 'PENDING' } })
  expect(revision).toMatchObject({ discountPercent: 30, reviewedVersion: null, publishedAt: null })
  expect(revision.id).not.toBe(original.id)
  expect(await db.promotionIdentity.count()).toBe(2)
  expect(await db.promotionIdentity.count({ where: { dealId: revision.id } })).toBe(1)
  lists[0]?.mockResolvedValue({ posts: [], nextCursor: null })
  lists[1]?.mockResolvedValue({ posts: [post(1, changed)], nextCursor: null })
  tick()
  expect((await request()).status).toBe(200)
  expect(await db.deal.count()).toBe(2)
  expect(await db.dealSource.count({ where: { dealId: revision.id } })).toBe(2)
  expect(
    await db.deal.findUniqueOrThrow({ where: { id: original.id }, include: { sources: true } }),
  ).toEqual(frozen)
})

it.each(['stale', 'failed'] as const)(
  'R3 blocks queue readiness when the first citation is clean but a later citation is %s',
  async (failure) => {
    for (const [i, list] of lists.entries())
      list.mockResolvedValue({ posts: [post(i)], nextCursor: null })
    expect((await request()).status).toBe(200)
    const original = await db.deal.findFirstOrThrow()
    expect(await db.deal.count()).toBe(1)
    expect(await db.dealSource.count()).toBe(2)
    const cleanQueue = await request('/api/ingestion/drafts', { method: 'GET' })
    expect((await cleanQueue.json()).items).toEqual([
      expect.objectContaining({ id: original.id, reviewReady: true }),
    ])
    const pinned = await db.dealSource.findMany({
      where: { dealId: original.id },
      orderBy: { id: 'asc' },
    })
    lists[0]?.mockResolvedValue({ posts: [], nextCursor: null })
    lists[1]?.mockResolvedValue({
      posts: [
        post(1, failure === 'stale' ? body.replace('25% off', '30% off') : 'x'.repeat(100_001)),
      ],
      nextCursor: null,
    })
    tick()
    expect((await request()).status).toBe(200)
    const evidence = await db.dealSource.findMany({
      where: { dealId: original.id },
      orderBy: { id: 'asc' },
      include: { importedPost: true },
    })
    expect(evidence[0]?.importedPost.contentHash).toBe(evidence[0]?.sourceContentHash)
    expect(evidence[0]?.importedPost.errorCode).toBeNull()
    expect(evidence[1]?.importedPost.errorCode).toBe(
      failure === 'stale' ? 'SOURCE_CHANGED' : 'MALFORMED_POST',
    )
    if (failure === 'stale')
      expect(evidence[1]?.importedPost.contentHash).not.toBe(evidence[1]?.sourceContentHash)
    const queued = await request('/api/ingestion/drafts', { method: 'GET' })
    const item = (await queued.json()).items.find((row: { id: string }) => row.id === original.id)
    expect(item).toMatchObject({ sourceUrl: pinned[0]?.sourceUrl, reviewReady: false })
    expect(item.images.length).toBeLessThanOrEqual(5)
    const review = await request(`/api/ingestion/drafts/${original.id}/review`, {
      headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'APPROVE',
        expectedContentVersion: original.contentVersion,
        note: 'Synthetic complete evidence regression',
      }),
    })
    expect(review.status).toBe(412)
    expect(await db.deal.findUniqueOrThrow({ where: { id: original.id } })).toEqual(original)
    expect(
      await db.dealSource.findMany({ where: { dealId: original.id }, orderBy: { id: 'asc' } }),
    ).toEqual(pinned)
  },
)
