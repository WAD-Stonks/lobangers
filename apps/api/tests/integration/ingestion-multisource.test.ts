import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { copyFile, mkdtemp } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parseConfig } from '@api/config'
import type { IngestionRuntime } from '@api/modules/ingestion/runtime'
import axios from 'axios'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const origin = 'http://localhost:5173'
const sources = [
  {
    kind: 'moneydigest',
    provider: 'WORDPRESS',
    externalId: 'moneydigest.sg',
    name: 'MoneyDigest',
    url: 'https://www.moneydigest.sg/',
  },
  {
    kind: 'scoobify',
    provider: 'WORDPRESS',
    externalId: 'scoobifydaily.wordpress.com',
    name: 'Scoobify Daily',
    url: 'https://scoobifydaily.wordpress.com/',
  },
  {
    kind: 'telegram',
    provider: 'TELEGRAM',
    externalId: 'ThisCounted',
    name: 'ThisCounted',
    url: 'https://t.me/s/ThisCounted',
  },
] as const
const post = (
  index: number,
  title = `Synthetic Pizza ${['Alpha', 'Beta', 'Gamma'][index]}`,
  body = 'Singapore pizza 25% off. Valid from 1 October 2026 until 31 December 2026. All outlets. No membership required.',
) => ({
  externalId: '101',
  url: index === 2 ? 'https://t.me/ThisCounted/101' : `${sources[index]?.url}synthetic-101/`,
  publishedAt: '2026-10-01T12:00:00Z',
  sourceUpdatedAt: null,
  title,
  contentHtml: body,
  excerptHtml: '',
  images: [],
})
let clock = new Date('2026-10-20T00:00:00Z')
const lists = sources.map((_, i) =>
  vi.fn().mockImplementation(async () => ({ posts: [post(i)], nextCursor: null })),
)
const runtime: IngestionRuntime = {
  enabled: true,
  reuseApproved: true,
  now: () => clock,
  listPosts: vi.fn().mockResolvedValue([]),
  sources: sources.map((source, i) => ({ source, reuseApproved: true, listPosts: lists[i] })),
}
let mongo: MongoMemoryReplSet
let db: typeof import('@broke-oclock/db').db
let server: Server
let baseURL = ''
let cookie = ''
let sessionReads = () => 0
const snapshotIngestion = () =>
  Promise.all([
    db.importSource.findMany({ orderBy: { id: 'asc' } }),
    db.ingestionRun.findMany({ orderBy: { id: 'asc' } }),
    db.importedPost.findMany({ orderBy: { id: 'asc' } }),
    db.deal.findMany({ orderBy: { id: 'asc' } }),
    db.dealSource.findMany({ orderBy: { id: 'asc' } }),
    db.importedImage.findMany({ orderBy: { id: 'asc' } }),
    db.dealSourceImage.findMany({ orderBy: { id: 'asc' } }),
    db.promotionIdentity.findMany({ orderBy: { id: 'asc' } }),
  ])
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
  const databaseUrl = mongo.getUri(`ingestion_multisource_${randomUUID().replaceAll('-', '')}`)
  expect(new URL(databaseUrl).hostname).toBe('127.0.0.1')
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  // Keep Prisma dotenv discovery and generated output away from the worktree.
  const schemaRoot = await mkdtemp(join(tmpdir(), 'ingestion_multisource_'))
  const schemaPath = join(schemaRoot, 'schema.prisma')
  await copyFile(join(root, 'packages/db/prisma/schema.prisma'), schemaPath)
  await promisify(execFile)(
    process.execPath,
    [
      join(root, 'packages/db/node_modules/prisma/build/index.js'),
      'db',
      'push',
      '--skip-generate',
      '--schema',
      schemaPath,
    ],
    {
      cwd: schemaRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      timeout: 60_000,
    },
  )
  db = (await import('@broke-oclock/db')).db
  const authModule = await import('@api/auth')
  const authFactory = vi.spyOn(authModule, 'createAuth')
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
        CRON_SECRET: 's'.repeat(48),
      }),
      { ingestion: runtime },
    ),
  )
  const nativeAuth = authFactory.mock.results[0]?.value
  if (!nativeAuth) throw new Error('Missing native auth instance')
  const getSession = vi.spyOn(nativeAuth.api, 'getSession')
  sessionReads = () => getSession.mock.calls.length
  authFactory.mockRestore()
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
  expect((await request('/api/ingestion/runs', { method: 'GET' })).status).toBe(200)
  expect(sessionReads()).toBeGreaterThan(0)
}, 180_000)
beforeEach(async () => {
  clock = new Date(clock.getTime() + 31_000)
  for (const [i, source] of sources.entries()) {
    const { kind: _, ...identity } = source
    await db.importSource.upsert({
      where: { provider_externalId: { provider: source.provider, externalId: source.externalId } },
      create: { ...identity, enabled: true },
      update: { enabled: true },
    })
    lists[i]?.mockReset().mockResolvedValue({ posts: [post(i)], nextCursor: null })
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
  expect(server?.listening ?? false).toBe(false)
  expect(mongo?.state).toBe('stopped')
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})
it('does not create a second canonical deal when an identical promotion was already rejected', async () => {
  lists[0]?.mockResolvedValue({ posts: [post(0, 'Acme Pizza')], nextCursor: null })
  lists[1]?.mockResolvedValue({ posts: [], nextCursor: null })
  lists[2]?.mockResolvedValue({ posts: [], nextCursor: null })
  expect((await request()).status).toBe(200)
  const original = await db.deal.findFirstOrThrow()
  await db.deal.update({ where: { id: original.id }, data: { reviewStatus: 'REJECTED' } })
  lists[0]?.mockResolvedValue({ posts: [], nextCursor: null })
  lists[1]?.mockResolvedValue({ posts: [post(1, 'Acme Pizza')], nextCursor: null })
  clock = new Date(clock.getTime() + 31_000)
  expect((await request()).status).toBe(200)
  expect(await db.deal.count()).toBe(1)
  expect(await db.dealSource.count()).toBe(2)
  expect(await db.deal.findUniqueOrThrow({ where: { id: original.id } })).toMatchObject({
    reviewStatus: 'REJECTED',
  })
})
it('stops admitting further sources when the shared request budget is exhausted', async () => {
  const source = await db.importSource.findUniqueOrThrow({
    where: { provider_externalId: { provider: 'WORDPRESS', externalId: 'moneydigest.sg' } },
  })
  await db.importSource.update({ where: { id: source.id }, data: { cursor: null } })
  lists[0]?.mockResolvedValue({ posts: [], nextCursor: '2' })
  const completedAt = clock
  const update = db.ingestionRun.update.bind(db.ingestionRun)
  let completedRunId: string | undefined
  const spy = vi.spyOn(db.ingestionRun, 'update').mockImplementation((args) => {
    const query = update(args)
    // Retain the real lazy Prisma client; observe only its committed resolution.
    const observe: typeof query.then = (onfulfilled, onrejected) =>
      query
        .then(async (result) => {
          if (args.data.status === 'SUCCEEDED') {
            // Advance only after the real cursor transaction and terminal run write
            // have committed, before runIngestion considers the next source.
            expect(
              await db.ingestionRun.findUniqueOrThrow({ where: { id: result.id } }),
            ).toMatchObject({
              sourceId: source.id,
              status: 'SUCCEEDED',
              finishedAt: completedAt,
            })
            expect(
              await db.importSource.findUniqueOrThrow({ where: { id: source.id } }),
            ).toMatchObject({
              cursor: '2',
              leaseToken: null,
              leaseExpiresAt: null,
            })
            completedRunId = result.id
            clock = new Date(clock.getTime() + 90_000)
          }
          return result
        })
        .then(onfulfilled, onrejected)
    return new Proxy(query, {
      get(target, property, receiver) {
        if (property === 'then') return observe
        return Reflect.get(target, property, receiver)
      },
    })
  })
  try {
    const response = await request()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'PARTIAL' })
    expect(lists[0]).toHaveBeenCalledTimes(1)
    expect(lists[1]).not.toHaveBeenCalled()
    expect(lists[2]).not.toHaveBeenCalled()
    expect(completedRunId).toBeDefined()
    expect(await db.ingestionRun.findMany()).toEqual([
      expect.objectContaining({
        id: completedRunId,
        sourceId: source.id,
        status: 'SUCCEEDED',
        finishedAt: completedAt,
        fetchedCount: 0,
        createdCount: 0,
        updatedCount: 0,
        failedCount: 0,
        errorCode: null,
      }),
    ])
  } finally {
    spy.mockRestore()
  }
})
it('fails an empty provider page returned at the deadline without cursor, domain or media writes', async () => {
  const source = await db.importSource.findUniqueOrThrow({
    where: { provider_externalId: { provider: 'WORDPRESS', externalId: 'moneydigest.sg' } },
  })
  await db.importSource.update({ where: { id: source.id }, data: { cursor: null } })
  const [, , ...before] = await snapshotIngestion()
  const fetchImage = vi.fn()
  const upload = vi.fn()
  const resolve = vi.fn()
  runtime.fetchImage = fetchImage
  runtime.imageStorage = { upload, resolve }
  lists[0]?.mockImplementation(async () => {
    clock = new Date(clock.getTime() + 90_000)
    return { posts: [], nextCursor: '2' }
  })
  try {
    const response = await request()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'FAILED' })
    expect(lists[0]).toHaveBeenCalledTimes(1)
    expect(lists[1]).not.toHaveBeenCalled()
    expect(lists[2]).not.toHaveBeenCalled()
    expect(await db.ingestionRun.findMany()).toEqual([
      expect.objectContaining({
        sourceId: source.id,
        status: 'FAILED',
        finishedAt: clock,
        fetchedCount: 0,
        createdCount: 0,
        updatedCount: 0,
        errorCode: 'CONFLICT',
      }),
    ])
    expect(await db.importSource.findUniqueOrThrow({ where: { id: source.id } })).toMatchObject({
      cursor: null,
      leaseToken: null,
      leaseExpiresAt: null,
    })
    const [, , ...after] = await snapshotIngestion()
    expect(after).toEqual(before)
    expect(fetchImage).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
    expect(resolve).not.toHaveBeenCalled()
    expect(await db.uploadedFile.count()).toBe(0)
  } finally {
    delete runtime.fetchImage
    delete runtime.imageStorage
  }
})
it.each([
  'Singapore pizza 25% off. Valid from 1 October 2026 until 30 December 2026. All outlets. No membership required.',
  'Singapore pizza 25% off. Valid from 1 October 2026 until 31 December 2026. Selected outlets: Bugis. No membership required.',
  'Singapore pizza 25% off. Valid from 1 October 2026 until 31 December 2026. All outlets. Members only.',
])(
  'does not merge the same brand with different windows, outlet scope or eligibility: %s',
  async (body) => {
    lists[0]?.mockResolvedValue({ posts: [post(0, 'Acme Pizza')], nextCursor: null })
    lists[1]?.mockResolvedValue({ posts: [post(1, 'Acme Pizza', body)], nextCursor: null })
    lists[2]?.mockResolvedValue({ posts: [], nextCursor: null })
    expect((await request()).status).toBe(200)
    expect(await db.deal.count()).toBe(2)
    expect(await db.dealSource.count()).toBe(2)
  },
)
it('keeps an uncertain cloud upload held and reconciles without a second upload', async () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7])
  const { createHash } = await import('node:crypto')
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const upload = vi.fn().mockRejectedValue(new Error('synthetic transport outcome unknown'))
  const resolve = vi.fn().mockResolvedValue(null)
  runtime.fetchImage = vi.fn().mockImplementation(async (url: string) => ({
    bytes,
    sha256,
    mimeType: 'image/jpeg',
    byteLength: bytes.length,
    url,
    finalUrl: url,
  }))
  runtime.imageStorage = { upload, resolve }
  for (const [i, list] of lists.entries())
    list.mockResolvedValue({
      posts: [{ ...post(i), images: [{ url: `${sources[i]?.url}image.jpg` }] }],
      nextCursor: null,
    })
  try {
    expect((await request()).status).toBe(200)
    expect(upload).toHaveBeenCalledTimes(1)
    expect(resolve).toHaveBeenCalledWith(`lobangers-image-v1-${sha256}`)
    expect(await db.importedImage.findUniqueOrThrow({ where: { id: sha256 } })).toMatchObject({
      status: 'UNKNOWN',
      storageKey: null,
      hostedUrl: null,
      errorCode: 'UPLOAD_OUTCOME_UNKNOWN',
    })
  } finally {
    delete runtime.fetchImage
    delete runtime.imageStorage
  }
})
it('persists a bounded backfill cursor while polling the latest page each invocation', async () => {
  lists[1]?.mockResolvedValue({ posts: [], nextCursor: null })
  lists[2]?.mockResolvedValue({ posts: [], nextCursor: null })
  lists[0]?.mockResolvedValue({ posts: [post(0)], nextCursor: '2' })
  expect((await request()).status).toBe(200)
  const source = await db.importSource.findUniqueOrThrow({
    where: { provider_externalId: { provider: 'WORDPRESS', externalId: 'moneydigest.sg' } },
  })
  expect(source.cursor).toBe('2')
  clock = new Date(clock.getTime() + 31_000)
  lists[0]?.mockClear().mockImplementation(async (options) => ({
    posts:
      options.page === 1
        ? [post(0)]
        : [{ ...post(0), externalId: '102', url: 'https://www.moneydigest.sg/synthetic-102/' }],
    nextCursor: options.page === 1 ? '2' : null,
  }))
  expect((await request()).status).toBe(200)
  expect(lists[0]?.mock.calls.map(([options]) => options)).toEqual([
    { page: 1, perPage: 20, cursor: null },
    { page: 2, perPage: 20, cursor: '2' },
  ])
  expect(await db.importedPost.count()).toBe(2)
})
it('persists per-post malformed evidence for non-MoneyDigest providers without stopping healthy sources', async () => {
  lists[1]?.mockResolvedValue({
    posts: [{ ...post(1), contentHtml: 'x'.repeat(100_001) }],
    nextCursor: null,
  })
  const response = await request()
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    status: 'PARTIAL',
    fetchedCount: 3,
    createdCount: 2,
    failedCount: 1,
  })
  const source = await db.importSource.findUniqueOrThrow({
    where: {
      provider_externalId: { provider: 'WORDPRESS', externalId: 'scoobifydaily.wordpress.com' },
    },
  })
  expect(await db.importedPost.findFirst({ where: { sourceId: source.id } })).toMatchObject({
    externalId: '101',
    status: 'FAILED',
    errorCode: 'MALFORMED_POST',
    rawContent: '',
  })
  const dashboard = await request('/api/ingestion/dashboard', { method: 'GET' })
  expect((await dashboard.json()).counts.failed).toBe(1)
})
it('loads an admin-registered Telegram channel from the database on every invocation', async () => {
  await db.importSource.updateMany({ data: { enabled: false } })
  const registered = await db.importSource.create({
    data: {
      provider: 'TELEGRAM',
      externalId: 'syntheticdeals',
      name: 'Synthetic Deals',
      url: 'https://t.me/s/SyntheticDeals',
      enabled: true,
    },
  })
  const previousSources = runtime.sources
  const factory = vi.fn().mockImplementation((source) => ({
    source,
    reuseApproved: true,
    listPosts: async () => ({
      posts: [{ ...post(2), url: 'https://t.me/SyntheticDeals/101' }],
      nextCursor: null,
    }),
  }))
  delete runtime.sources
  runtime.sourceRuntime = factory
  try {
    const response = await request()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ fetchedCount: 1, createdCount: 1 })
    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: registered.externalId,
        url: registered.url,
        kind: 'telegram',
      }),
    )
    expect(await db.importedPost.findFirst({ where: { sourceId: registered.id } })).toMatchObject({
      externalId: '101',
      url: 'https://t.me/SyntheticDeals/101',
    })
    const queue = await request('/api/ingestion/drafts', { method: 'GET' })
    expect((await queue.json()).items).toHaveLength(1)
    const dashboard = await request('/api/ingestion/dashboard', { method: 'GET' })
    expect((await dashboard.json()).source).toMatchObject({ enabled: true, reuseApproved: true })
    clock = new Date(clock.getTime() + 31_000)
    await db.importSource.update({ where: { id: registered.id }, data: { enabled: false } })
    const beforeDisabledRun = factory.mock.calls.length
    expect((await request()).status).toBe(412)
    expect(factory).toHaveBeenCalledTimes(beforeDisabledRun)
  } finally {
    runtime.sources = previousSources
    delete runtime.sourceRuntime
  }
})
it('downloads source bytes through scheduled GET and stores one hosted blob for repeated hashes', async () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])
  const { createHash } = await import('node:crypto')
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const fetchImage = vi.fn().mockImplementation(async (url: string) => ({
    bytes,
    sha256,
    mimeType: 'image/jpeg',
    byteLength: bytes.length,
    url,
    finalUrl: url,
  }))
  const upload = vi.fn().mockResolvedValue({
    key: 'synthetic-real-provider-key',
    url: 'https://synthetic.ufs.sh/f/synthetic-real-provider-key',
  })
  runtime.fetchImage = fetchImage
  runtime.imageStorage = { upload, resolve: vi.fn().mockResolvedValue(null) }
  for (const [i, list] of lists.entries())
    list.mockResolvedValue({
      posts: [
        {
          ...post(i),
          images: [
            {
              url:
                i === 2
                  ? 'https://cdn4.telegram-cdn.org/synthetic.jpg'
                  : `${sources[i]?.url}synthetic.jpg`,
            },
          ],
        },
      ],
      nextCursor: null,
    })
  const invoke = () =>
    request('/api/ingestion/scheduled-runs', {
      method: 'GET',
      headers: { Authorization: `Bearer ${'s'.repeat(48)}` },
    })
  try {
    const response = await invoke()
    expect(response.status).toBe(200)
    expect(fetchImage).toHaveBeenCalledTimes(3)
    expect(upload).toHaveBeenCalledTimes(1)
    expect(await db.$runCommandRaw({ count: 'ImportedImage' })).toMatchObject({ n: 1 })
    expect(await db.$runCommandRaw({ count: 'DealSourceImage' })).toMatchObject({ n: 3 })
    const image = await db.importedImage.findUniqueOrThrow({ where: { id: sha256 } })
    expect(image).toMatchObject({
      status: 'HOSTED',
      storageKey: 'synthetic-real-provider-key',
      mimeType: 'image/jpeg',
      sizeBytes: bytes.length,
    })
    expect(await db.uploadedFile.count()).toBe(0)
    const queue = await request('/api/ingestion/drafts', { method: 'GET' })
    expect((await queue.json()).items[0].images).toEqual([
      expect.objectContaining({
        sha256,
        status: 'HOSTED',
        url: 'https://synthetic.ufs.sh/f/synthetic-real-provider-key',
        mimeType: 'image/jpeg',
        sizeBytes: bytes.length,
      }),
    ])
    clock = new Date(clock.getTime() + 31_000)
    expect((await invoke()).status).toBe(200)
    expect(upload).toHaveBeenCalledTimes(1)
  } finally {
    delete runtime.fetchImage
    delete runtime.imageStorage
  }
})
it('runs scheduled GET with native Vercel bearer auth and deduplicates repeat delivery', async () => {
  const invoke = () =>
    request('/api/ingestion/scheduled-runs', {
      method: 'GET',
      headers: { Authorization: `Bearer ${'s'.repeat(48)}` },
    })
  const response = await invoke()
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ fetchedCount: 3, createdCount: 3 })
  expect(await db.deal.count()).toBe(3)
  expect(await db.importedPost.count()).toBe(3)
  expect(await db.dealSource.count()).toBe(3)
  expect(await db.ingestionRun.count({ where: { status: 'SUCCEEDED' } })).toBe(3)
  for (const list of lists) expect(list).toHaveBeenCalledTimes(1)
  clock = new Date(clock.getTime() + 31_000)
  const repeated = await invoke()
  expect(repeated.status).toBe(200)
  expect(await repeated.json()).toMatchObject({ fetchedCount: 3, createdCount: 0 })
  expect(await db.deal.count()).toBe(3)
  expect(await db.importedPost.count()).toBe(3)
  expect(await db.dealSource.count()).toBe(3)
  expect(await db.ingestionRun.count({ where: { status: 'SUCCEEDED' } })).toBe(6)
  const history = await request('/api/ingestion/runs', { method: 'GET' })
  expect(history.status).toBe(200)
  expect((await history.json()).items).toHaveLength(6)
  for (const list of lists) expect(list).toHaveBeenCalledTimes(2)
})
it.each(['HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'])(
  'rejects scheduled %s before any provider or persistent state changes',
  async (method) => {
    const before = await snapshotIngestion()
    const reads = sessionReads()
    const response = await request('/api/ingestion/scheduled-runs', {
      method,
      headers: { Authorization: `Bearer ${'s'.repeat(48)}` },
    })
    expect(response.status).toBe(405)
    expect(response.headers.get('Allow')).toBe('GET')
    for (const list of lists) expect(list).not.toHaveBeenCalled()
    expect(await snapshotIngestion()).toEqual(before)
    expect(sessionReads()).toBe(reads)
    expect(await db.ingestionRun.count()).toBe(0)
    expect(await db.importedPost.count()).toBe(0)
    expect(await db.deal.count()).toBe(0)
    expect(await db.dealSource.count()).toBe(0)
    expect(await db.importedImage.count()).toBe(0)
  },
)
it.each(['?unexpected=1', '?secret=synthetic', '?CRON_SECRET=synthetic', '?nested[key]=1'])(
  'rejects scheduled GET query extras before any ingestion writes: %s',
  async (query) => {
    const before = await snapshotIngestion()
    const reads = sessionReads()
    const response = await request(`/api/ingestion/scheduled-runs${query}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${'s'.repeat(48)}` },
    })
    expect(response.status).toBe(400)
    for (const list of lists) expect(list).not.toHaveBeenCalled()
    expect(await snapshotIngestion()).toEqual(before)
    expect(sessionReads()).toBe(reads)
    expect(await db.ingestionRun.count()).toBe(0)
    expect(await db.importedPost.count()).toBe(0)
    expect(await db.deal.count()).toBe(0)
  },
)
it.each<{ status: number; headers: Record<string, string> }>([
  { status: 401, headers: {} },
  { status: 403, headers: { Authorization: `Bearer ${'s'.repeat(48)}`, Origin: origin } },
  { status: 200, headers: { Authorization: `Bearer ${'s'.repeat(48)}` } },
])(
  'never caches scheduled GET responses, including pre-auth rejection: $status',
  async (fixture) => {
    const response = await request('/api/ingestion/scheduled-runs', {
      method: 'GET',
      headers: fixture.headers,
    })
    expect(response.status).toBe(fixture.status)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  },
)
it('keeps scheduled GET disabled without enabling ingestion or touching context', async () => {
  const before = await snapshotIngestion()
  const reads = sessionReads()
  runtime.enabled = false
  try {
    const response = await request('/api/ingestion/scheduled-runs', {
      method: 'GET',
      headers: { Authorization: `Bearer ${'s'.repeat(48)}` },
    })
    expect(response.status).toBe(412)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    for (const list of lists) expect(list).not.toHaveBeenCalled()
    expect(await snapshotIngestion()).toEqual(before)
    expect(sessionReads()).toBe(reads)
  } finally {
    runtime.enabled = true
  }
})
it('rejects scheduled GET browser/session fallbacks and malformed bearer authorization', async () => {
  const before = await snapshotIngestion()
  const reads = sessionReads()
  const invalid: { headers: Record<string, string>; status: number }[] = [
    { headers: {}, status: 401 },
    { headers: { Authorization: 'Bearer wrong' }, status: 401 },
    { headers: { Authorization: `Bearer ${'x'.repeat(48)}` }, status: 401 },
    { headers: { Authorization: `bearer ${'s'.repeat(48)}` }, status: 401 },
    { headers: { Authorization: 's'.repeat(48) }, status: 401 },
    { headers: { Cookie: cookie, Origin: origin }, status: 401 },
    { headers: { Authorization: `Bearer ${'s'.repeat(48)}`, Cookie: cookie }, status: 403 },
    { headers: { Authorization: `Bearer ${'s'.repeat(48)}`, Origin: origin }, status: 403 },
    {
      headers: { Authorization: `Bearer ${'s'.repeat(48)}`, 'Sec-Fetch-Site': 'same-origin' },
      status: 403,
    },
  ]
  for (const { headers, status } of invalid) {
    const rejected = await request('/api/ingestion/scheduled-runs', { method: 'GET', headers })
    expect(rejected.status).toBe(status)
    expect(rejected.headers.get('Cache-Control')).toBe('no-store')
    expect(await snapshotIngestion()).toEqual(before)
    expect(sessionReads()).toBe(reads)
  }
  const querySecret = await request(`/api/ingestion/scheduled-runs?secret=${'s'.repeat(48)}`, {
    method: 'GET',
    headers: {},
  })
  expect(querySecret.status).toBe(401)
  for (const list of lists) expect(list).not.toHaveBeenCalled()
  expect(await snapshotIngestion()).toEqual(before)
  expect(sessionReads()).toBe(reads)
})
it.each([
  { body: '{}', contentType: 'application/json', status: 400 },
  { body: '[]', contentType: 'application/json', status: 400 },
  { body: 'null', contentType: 'application/json', status: 400 },
  { body: '{', contentType: 'application/json', status: 400 },
  { body: 'synthetic', contentType: 'text/plain', status: 415 },
])('rejects actual HTTP GET bodies without state changes: $body', async (fixture) => {
  const before = await snapshotIngestion()
  const reads = sessionReads()
  // Node HTTP transport really sends GET bodies; fetch rejects before transport.
  const response = await axios.request({
    url: `${baseURL}/api/ingestion/scheduled-runs`,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${'s'.repeat(48)}`,
      'Content-Type': fixture.contentType,
    },
    data: fixture.body,
    maxRedirects: 0,
    proxy: false,
    validateStatus: () => true,
  })
  expect(response.status).toBe(fixture.status)
  for (const list of lists) expect(list).not.toHaveBeenCalled()
  expect(await snapshotIngestion()).toEqual(before)
  expect(sessionReads()).toBe(reads)
})
it('creates an unapproved source revision without rewriting an approved deal or citation', async () => {
  lists[1]?.mockResolvedValue({ posts: [], nextCursor: null })
  lists[2]?.mockResolvedValue({ posts: [], nextCursor: null })
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
  const approved = await db.deal.findUniqueOrThrow({ where: { id: original.id } })
  const citations = await db.dealSource.findMany({ where: { dealId: original.id } })
  lists[0]?.mockResolvedValue({
    posts: [
      post(
        0,
        'Synthetic Pizza Alpha',
        'Singapore pizza 30% off. Valid from 1 October 2026 until 31 December 2026. All outlets. No membership required.',
      ),
    ],
    nextCursor: null,
  })
  clock = new Date(clock.getTime() + 31_000)
  const response = await request()
  expect(response.status).toBe(200)
  expect(await db.deal.count()).toBe(2)
  expect(await db.deal.findUniqueOrThrow({ where: { id: original.id } })).toEqual(approved)
  expect(await db.dealSource.findMany({ where: { dealId: original.id } })).toEqual(citations)
  expect(await db.deal.findFirst({ where: { reviewStatus: 'PENDING' } })).toMatchObject({
    discountPercent: 30,
    reviewedVersion: null,
    publishedAt: null,
  })
})
it('converges simultaneous different-source transactions onto one canonical identity', async () => {
  await db.promotionIdentity.deleteMany()
  let arrived = 0
  let release: () => void = () => {}
  const barrier = new Promise<void>((resolve) => {
    release = resolve
  })
  for (const [i, list] of lists.entries())
    list.mockImplementation(async () => {
      if (++arrived === 3) release()
      await barrier
      return { posts: [post(i, 'Synthetic Pizza by Acme')], nextCursor: null }
    })
  const { runIngestion } = await import('@api/modules/ingestion/service')
  const results = await Promise.all(
    (runtime.sources ?? []).map((provider) =>
      runIngestion(db, { ...runtime, sources: [provider] }),
    ),
  )
  expect(results.map((result) => result.status)).toEqual(['SUCCEEDED', 'SUCCEEDED', 'SUCCEEDED'])
  expect(await db.deal.count()).toBe(1)
  expect(await db.dealSource.count()).toBe(3)
  expect(await db.promotionIdentity.count()).toBe(1)
})
it('attaches identical canonical promotions from different sources to one durable deal', async () => {
  for (const [i, list] of lists.entries())
    list.mockResolvedValue({ posts: [post(i, 'Synthetic Pizza by Acme')], nextCursor: null })
  const response = await request()
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    status: 'SUCCEEDED',
    fetchedCount: 3,
    createdCount: 1,
  })
  expect(await db.deal.count()).toBe(1)
  expect(await db.dealSource.count()).toBe(3)
  clock = new Date(clock.getTime() + 31_000)
  expect((await request()).status).toBe(200)
  expect(await db.deal.count()).toBe(1)
  expect(await db.dealSource.count()).toBe(3)
})
it('persists all three fixed sources through the admin HTTP scrape entry point', async () => {
  const response = await request()
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    status: 'SUCCEEDED',
    fetchedCount: 3,
    createdCount: 3,
  })
  expect(await db.importedPost.count()).toBe(3)
  expect(await db.deal.count()).toBe(3)
  expect(await db.dealSource.count()).toBe(3)
  expect(await db.ingestionRun.count({ where: { status: 'SUCCEEDED' } })).toBe(3)
  for (const list of lists) expect(list).toHaveBeenCalledTimes(1)
})
