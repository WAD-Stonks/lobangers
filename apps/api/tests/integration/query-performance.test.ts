import { randomBytes, randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseConfig } from '@api/config'
import { findIngestionDrafts, ingestionDraftSelect } from '@api/modules/ingestion/draft-queries'
import { importedDealScope } from '@api/modules/ingestion/review-policy'
import type { IngestionRuntime } from '@api/modules/ingestion/runtime'
import { pushDisposableSchema } from '@api-tests/fixtures/disposable-schema'
import { ingestionDraftsResponseSchema } from '@broke-oclock/contracts/ingestion'
import type { Prisma } from '@broke-oclock/db/constructor'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

// Entirely synthetic, disposable loopback Mongo + production HTTP/auth/Prisma.
const origin = 'http://localhost:5173'
const now = new Date('2026-11-01T00:00:00Z')
const objectId = (index: number) => index.toString(16).padStart(24, '0')
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let db: typeof import('@broke-oclock/db').db
let baseURL = ''
let cookie = ''
let actorId = ''
const listPosts = vi
  .fn<IngestionRuntime['listPosts']>()
  .mockRejectedValue(new Error('No provider I/O'))
const runtime: IngestionRuntime = {
  enabled: false,
  reuseApproved: false,
  now: () => now,
  listPosts,
}
const request = (path: string, options: RequestInit = {}) =>
  fetch(`${baseURL}${path}`, { headers: { Cookie: cookie, Origin: origin }, ...options })
const readDrafts = async (query: string) => {
  const response = await request(`/api/ingestion/drafts?${query}`)
  expect(response.status).toBe(200)
  return ingestionDraftsResponseSchema.parse(await response.json())
}
const canonicalIds = async (status: 'PENDING' | 'APPROVED' | 'REJECTED') =>
  (
    await db.deal.findMany({
      where: { ...importedDealScope, reviewStatus: status },
      orderBy: { id: 'asc' },
      select: { id: true },
    })
  ).map((row) => row.id)

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const databaseUrl = mongo.getUri(`query_performance_${randomUUID().replaceAll('-', '')}`)
  if (!/^mongodb:\/\/127\.0\.0\.1:\d+\//.test(databaseUrl))
    throw new Error('Disposable loopback database required')
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  await pushDisposableSchema(databaseUrl)
  db = (await import('@broke-oclock/db')).db
  const { createApp } = await import('@api/app')
  server = createServer()
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing owned HTTP server')
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
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Synthetic query admin',
      email: `${randomUUID()}@example.test`,
      password: randomBytes(24).toString('base64url'),
    }),
  })
  expect(signup.status).toBe(200)
  cookie = signup.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
  actorId = (await signup.json()).user.id
  await db.user.update({ where: { id: actorId }, data: { role: 'ADMIN' } })
  const sources = await Promise.all(
    [
      {
        provider: 'WORDPRESS' as const,
        externalId: 'unsupported.test',
        url: 'https://unsupported.test/',
      },
      {
        provider: 'WORDPRESS' as const,
        externalId: 'moneydigest.sg',
        url: 'https://www.moneydigest.sg/',
      },
      {
        provider: 'TELEGRAM' as const,
        externalId: 'SyntheticDisabled',
        url: 'https://t.me/s/SyntheticDisabled',
      },
      {
        provider: 'WORDPRESS' as const,
        externalId: 'ThisCounted',
        url: 'https://unsupported.test/',
      },
    ].map((source) =>
      db.importSource.create({ data: { ...source, name: source.externalId, enabled: false } }),
    ),
  )
  const posts = await Promise.all(
    sources.map((source) =>
      db.importedPost.create({
        data: {
          sourceId: source.id,
          externalId: 'synthetic',
          url: source.url,
          rawContent: 'synthetic',
          contentHash: 'current',
          status: 'NEEDS_REVIEW',
        },
      }),
    ),
  )
  const unsupported = posts[0]
  const supported = posts[1]
  const telegram = posts[2]
  const collision = posts[3]
  if (!unsupported || !supported || !telegram || !collision)
    throw new Error('Missing synthetic posts')
  const rows: Prisma.DealCreateManyInput[] = Array.from({ length: 206 }, (_, index) => ({
    id: objectId(index + 1),
    title: `Synthetic queue ${index}`,
    description: 'Synthetic evidence only',
    category: 'FOOD',
    offerType: 'OTHER',
    applicability: 'NO_FIXED_LOCATION',
    origin: 'IMPORTED',
    reviewStatus: 'PENDING',
    validFrom: new Date('2026-10-01T00:00:00Z'),
    validUntil: new Date('2026-12-31T00:00:00Z'),
    ...(index === 203 ? { deletedAt: null } : {}),
  }))
  rows.push(
    {
      ...rows[0],
      id: objectId(207),
      title: 'Deleted',
      description: 'Synthetic',
      category: 'FOOD',
      offerType: 'OTHER',
      applicability: 'NO_FIXED_LOCATION',
      origin: 'IMPORTED',
      deletedAt: now,
    },
    {
      ...rows[0],
      id: objectId(208),
      title: 'User submitted',
      description: 'Synthetic',
      category: 'FOOD',
      offerType: 'OTHER',
      applicability: 'NO_FIXED_LOCATION',
      origin: 'USER_SUBMITTED',
    },
    {
      ...rows[0],
      id: objectId(209),
      title: 'Provider collision',
      description: 'Synthetic',
      category: 'FOOD',
      offerType: 'OTHER',
      applicability: 'NO_FIXED_LOCATION',
      origin: 'IMPORTED',
    },
    {
      ...rows[0],
      id: objectId(210),
      title: 'Approved',
      description: 'Synthetic',
      category: 'FOOD',
      offerType: 'OTHER',
      applicability: 'NO_FIXED_LOCATION',
      origin: 'IMPORTED',
      reviewStatus: 'APPROVED',
    },
    {
      ...rows[0],
      id: objectId(211),
      title: 'Rejected',
      description: 'Synthetic',
      category: 'FOOD',
      offerType: 'OTHER',
      applicability: 'NO_FIXED_LOCATION',
      origin: 'IMPORTED',
      reviewStatus: 'REJECTED',
    },
  )
  await db.deal.createMany({ data: rows })
  await db.dealSource.createMany({
    data: rows.map((row, index) => ({
      dealId: row.id ?? '',
      importedPostId:
        index < 200
          ? unsupported.id
          : index === 208
            ? collision.id
            : index === 201
              ? telegram.id
              : supported.id,
      sourceContentHash: 'current',
      sourceContentSnapshot: 'synthetic',
      sourceUrl: 'https://example.test/citation',
    })),
  })
  // A second, stale unsupported citation must still participate in readiness.
  await db.dealSource.create({
    data: {
      dealId: objectId(203),
      importedPostId: unsupported.id,
      sourceContentHash: 'stale',
      sourceContentSnapshot: 'synthetic',
      sourceUrl: unsupported.url,
    },
  })
}, 180_000)

afterAll(async () => {
  vi.restoreAllMocks()
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  await db?.$disconnect()
  await mongo?.stop()
  expect(server?.listening ?? false).toBe(false)
  expect(mongo?.state).toBe('stopped')
  vi.unstubAllEnvs()
})

it('scans past multiple rejected windows with ID-only bounded candidates and fully scoped rich reads', async () => {
  const expected = await canonicalIds('PENDING')
  expect(expected).toEqual([201, 202, 203, 204, 205, 206].map(objectId))
  const findMany = vi.spyOn(db.deal, 'findMany')
  try {
    const first = await readDrafts('limit=2')
    expect(first.items.map((row) => row.id)).toEqual(expected.slice(0, 2))
    expect(first.nextCursor).toBe(objectId(202))
    const calls = findMany.mock.calls.map(([args]) => args)
    expect(calls[0]).toEqual({
      where: { origin: 'IMPORTED', OR: importedDealScope.OR, reviewStatus: 'PENDING' },
      orderBy: { id: 'asc' },
      take: 64,
      select: { id: true },
    })
    const candidateCalls = calls.filter((args) => args?.take === 64)
    expect(candidateCalls).toHaveLength(4)
    expect(candidateCalls.map((args) => args?.where?.id)).toEqual([
      undefined,
      { gt: objectId(64) },
      { gt: objectId(128) },
      { gt: objectId(192) },
    ])
    const richCalls = calls.filter((args) => args?.select?.sources)
    expect(richCalls).toHaveLength(4)
    for (const args of richCalls) {
      expect(args?.where).toMatchObject(importedDealScope)
      expect(args?.where?.id).toHaveProperty('in')
      expect(args?.take).toBeLessThanOrEqual(3)
    }
    const second = await readDrafts(`limit=2&cursor=${first.nextCursor}`)
    expect(second.items.map((row) => row.id)).toEqual(expected.slice(2, 4))
    expect(second.nextCursor).toBe(objectId(204))
    const third = await readDrafts(`limit=2&cursor=${second.nextCursor}`)
    expect(third.items.map((row) => row.id)).toEqual(expected.slice(4))
    expect(third.nextCursor).toBeNull()
    expect(await readDrafts(`limit=2&cursor=${objectId(999)}`)).toEqual({
      items: [],
      nextCursor: null,
    })
  } finally {
    findMany.mockRestore()
  }
})

it('preserves status membership, disabled supported sources, and every citation for readiness', async () => {
  for (const status of ['PENDING', 'APPROVED', 'REJECTED'] as const) {
    const page = await readDrafts(`limit=50&status=${status}`)
    expect(page.items.map((row) => row.id)).toEqual(await canonicalIds(status))
    expect(page.nextCursor).toBeNull()
  }
  const page = await readDrafts('limit=50')
  expect(page.items.find((row) => row.id === objectId(201))).toMatchObject({
    reviewReady: true,
    approvalReady: true,
    scopeStatus: 'UNCONFIRMED',
    physicalEligibilityReady: false,
  })
  expect(page.items.find((row) => row.id === objectId(202))).toMatchObject({
    sourceName: 'SyntheticDisabled',
    reviewReady: true,
  })
  expect(page.items.find((row) => row.id === objectId(203))).toMatchObject({
    reviewReady: false,
    approvalReady: false,
  })
})

it.each(['/api/ingestion/dashboard', '/api/admin/overview'])(
  'resolves the complete canonical source IDs once per %s read without filtering disabled sources',
  async (path) => {
    const supported = await db.importSource.findMany({
      where: importedDealScope.sources.some.importedPost.source,
      select: { id: true },
    })
    expect(supported).toHaveLength(2)
    const sourceReads = vi.spyOn(db.importSource, 'findMany')
    const counts = vi.spyOn(db.deal, 'count')
    try {
      sourceReads.mockClear()
      counts.mockClear()
      const response = await request(path)
      expect(response.status).toBe(200)
      expect(sourceReads).toHaveBeenCalledExactlyOnceWith({
        where: importedDealScope.sources.some.importedPost.source,
        select: { id: true },
      })
      const scope = {
        origin: 'IMPORTED',
        OR: importedDealScope.OR,
        sources: { some: { importedPost: { sourceId: { in: supported.map((row) => row.id) } } } },
      }
      for (const [args] of counts.mock.calls) expect(args?.where).toMatchObject(scope)
      expect(counts).toHaveBeenCalledTimes(path.endsWith('dashboard') ? 3 : 1)
      const body = await response.json()
      expect(
        path.endsWith('dashboard') ? body.counts.pending : body.counts.pendingImportedDrafts,
      ).toBe(6)
    } finally {
      sourceReads.mockRestore()
      counts.mockRestore()
    }
  },
)

it('returns zero for an empty supported source set and observes restored sources on the next request', async () => {
  const sources = await db.importSource.findMany({
    where: importedDealScope.sources.some.importedPost.source,
  })
  try {
    for (const source of sources)
      await db.importSource.update({
        where: { id: source.id },
        data: {
          provider: 'WORDPRESS',
          externalId: `unsupported-${source.id}`,
          url: 'https://unsupported.test/',
        },
      })
    expect(await canonicalIds('PENDING')).toEqual([])
    expect(await readDrafts('limit=50')).toEqual({ items: [], nextCursor: null })
    const dashboard = await request('/api/ingestion/dashboard')
    expect(await dashboard.json()).toMatchObject({
      counts: { pending: 0, approved: 0, rejected: 0, failed: 0 },
    })
    const overview = await request('/api/admin/overview')
    expect(await overview.json()).toMatchObject({ counts: { pendingImportedDrafts: 0 } })
  } finally {
    for (const source of sources)
      await db.importSource.update({
        where: { id: source.id },
        data: { provider: source.provider, externalId: source.externalId, url: source.url },
      })
  }
  expect((await readDrafts('limit=50')).items).toHaveLength(6)
})

it('preserves dashboard canonical counts and failed-post policy with no provider I/O', async () => {
  const expected = await Promise.all(
    (['PENDING', 'APPROVED', 'REJECTED'] as const).map((reviewStatus) =>
      db.deal.count({
        where: {
          ...importedDealScope,
          reviewStatus,
        },
      }),
    ),
  )
  const response = await request('/api/ingestion/dashboard')
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    source: { enabled: false, reuseApproved: false },
    counts: { pending: expected[0], approved: expected[1], rejected: expected[2], failed: 0 },
  })
  expect(listPosts).not.toHaveBeenCalled()
})

it('keeps GET/HEAD read-only and rejects anonymous, demoted and malformed requests', async () => {
  const snapshot = async () =>
    Promise.all([
      db.deal.findMany({ orderBy: { id: 'asc' } }),
      db.dealSource.findMany({ orderBy: { id: 'asc' } }),
      db.importedPost.findMany({ orderBy: { id: 'asc' } }),
      db.importSource.findMany({ orderBy: { id: 'asc' } }),
      db.ingestionRun.findMany({ orderBy: { id: 'asc' } }),
    ])
  const before = await snapshot()
  for (const path of ['/api/ingestion/drafts', '/api/ingestion/dashboard']) {
    expect((await request(path)).status).toBe(200)
    const head = await request(path, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
    expect((await request(path, { headers: {} })).status).toBe(401)
    expect((await request(path, { method: 'PUT' })).status).toBe(405)
  }
  for (const query of ['limit=0', 'limit=51', 'cursor=bad', 'status=NEW'])
    expect((await request(`/api/ingestion/drafts?${query}`)).status).toBe(400)
  for (const role of ['USER', 'MODERATOR', 'MERCHANT'] as const) {
    await db.user.update({ where: { id: actorId }, data: { role } })
    for (const path of ['/api/ingestion/drafts', '/api/ingestion/dashboard'])
      expect((await request(path)).status).toBe(403)
  }
  await db.user.update({ where: { id: actorId }, data: { role: 'ADMIN' } })
  expect(await snapshot()).toEqual(before)
  expect(listPosts).not.toHaveBeenCalled()
})

it.runIf(process.env.QUERY_PERFORMANCE_BENCHMARK === '1')(
  'benchmarks synthetic dense and sparse draft pages with exact rich-row parity',
  async () => {
    const supported = await db.importedPost.findFirstOrThrow({
      where: { source: importedDealScope.sources.some.importedPost.source },
    })
    const unsupported = await db.importedPost.findFirstOrThrow({
      where: { source: { externalId: 'unsupported.test' } },
    })
    const results = []
    for (const fixture of [
      { name: 'dense', start: 10000, count: 1000, rejected: 0 },
      { name: 'sparse', start: 20000, count: 2000, rejected: 1800 },
    ]) {
      const rows: Prisma.DealCreateManyInput[] = Array.from(
        { length: fixture.count },
        (_, index) => ({
          id: objectId(fixture.start + index + 1),
          title: 'Synthetic benchmark',
          description: 'Synthetic only',
          category: 'FOOD',
          offerType: 'OTHER',
          applicability: 'NO_FIXED_LOCATION',
          origin: 'IMPORTED',
          reviewStatus: 'PENDING',
        }),
      )
      await db.deal.createMany({ data: rows })
      await db.dealSource.createMany({
        data: rows.map((row, index) => ({
          dealId: row.id ?? '',
          importedPostId: index < fixture.rejected ? unsupported.id : supported.id,
          sourceContentHash: 'current',
          sourceContentSnapshot: 'synthetic',
          sourceUrl: supported.url,
        })),
      })
      const input = { status: 'PENDING' as const, limit: 20, cursor: objectId(fixture.start) }
      const original = () =>
        db.deal.findMany({
          where: { ...importedDealScope, reviewStatus: input.status, id: { gt: input.cursor } },
          orderBy: { id: 'asc' },
          take: input.limit + 1,
          select: ingestionDraftSelect,
        })
      const optimized = () => findIngestionDrafts(db, input)
      expect(await optimized()).toEqual(await original())
      const originalMs: number[] = []
      const optimizedMs: number[] = []
      for (let sample = 0; sample < 9; sample++) {
        const measure = async (read: () => Promise<unknown>, values: number[]) => {
          const start = performance.now()
          await read()
          values.push(performance.now() - start)
        }
        if (sample % 2) {
          await measure(optimized, optimizedMs)
          await measure(original, originalMs)
        } else {
          await measure(original, originalMs)
          await measure(optimized, optimizedMs)
        }
      }
      const median = (values: number[]) =>
        [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
      results.push({
        fixture,
        originalMs,
        optimizedMs,
        originalMedianMs: median(originalMs),
        optimizedMedianMs: median(optimizedMs),
      })
    }
    console.info(
      'SYNTHETIC draft performance; local warmed Prisma reads, not production latency',
      results,
    )
    await writeFile(
      join(tmpdir(), 'ingestion-draft-query-benchmark.json'),
      JSON.stringify(results, null, 2),
    )
  },
)
