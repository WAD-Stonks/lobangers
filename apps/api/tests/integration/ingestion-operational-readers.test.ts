import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { parseConfig } from '@api/config'
import { createIngestionRuntime, type IngestionRuntime } from '@api/modules/ingestion/runtime'
import { MONEYDIGEST_SOURCE, SCOOBIFY_SOURCE } from '@api/modules/ingestion/source'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'

// Real HTTP/auth/Prisma/Mongo and production provider composition. Only the
// publisher transport is synthetic; no provider URL is ever requested.
const origin = 'http://localhost:5173'
const cronSecret = 'synthetic-operational-cron-secret-0000000000000000'
const telegram = {
  provider: 'TELEGRAM' as const,
  externalId: 'syntheticops',
  name: 'Synthetic registered channel',
  url: 'https://t.me/s/SyntheticOps',
}
const cases = [
  { kind: 'telegram', source: telegram },
  { kind: 'scoobify', source: { ...SCOOBIFY_SOURCE, name: 'Synthetic Scoobify' } },
  { kind: 'moneydigest', source: { ...MONEYDIGEST_SOURCE, name: 'Synthetic MoneyDigest' } },
] as const
let clock = new Date('2026-10-22T00:00:00Z')
let batch = 1
let active: (typeof cases)[number] = cases[0]
let databaseUrl = ''
let baseURL = ''
let cookie = ''
let actorId = ''
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let db: typeof import('@broke-oclock/db').db
const runtime: IngestionRuntime = {
  enabled: false,
  reuseApproved: false,
  now: () => clock,
  listPosts: async () => {
    throw new Error('Unexpected legacy provider request')
  },
}
const transport = vi.fn<typeof fetch>().mockImplementation(async (input) => {
  const url = new URL(String(input))
  expect(url.origin).toBe(
    active.kind === 'telegram'
      ? 'https://t.me'
      : active.kind === 'scoobify'
        ? 'https://public-api.wordpress.com'
        : 'https://www.moneydigest.sg',
  )
  const good = `SYNTHETIC pizza ${batch === 1 ? 'Alpha' : 'Beta'} 25% off. Valid from 1 October 2026 until 31 December 2026. All outlets. No membership required.`
  const contents = [good, 'x'.repeat(100_001)]
  if (active.kind === 'telegram') {
    const messages = url.searchParams.has('before') ? [] : contents
    const html = `<a class="tgme_channel_info_header_username" href="https://t.me/SyntheticOps">@SyntheticOps</a>${messages
      .map((body, index) => {
        const id = batch * 100 + index + 1
        return `<div class="tgme_widget_message" data-post="SyntheticOps/${id}"><div class="tgme_widget_message_text">${body}</div><a class="tgme_widget_message_date" href="https://t.me/SyntheticOps/${id}"><time datetime="2026-10-01T12:00:00Z"></time></a></div>`
      })
      .join('')}`
    return new Response(html, { headers: { 'Content-Type': 'text/html' } })
  }
  return new Response(
    JSON.stringify(
      contents.map((body, index) => ({
        id: batch * 100 + index + 1,
        link: `${active.source.url}synthetic-${batch}-${index}/`,
        date: '2026-10-01T12:00:00',
        date_gmt: '2026-10-01T12:00:00',
        modified_gmt: '2026-10-01T12:00:00',
        title: { rendered: `SYNTHETIC pizza batch ${batch}` },
        content: { rendered: body },
        excerpt: { rendered: '' },
      })),
    ),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
const configure = (flags: Record<string, string> = {}) => {
  delete runtime.sources
  const config = parseConfig({
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: 'synthetic-operational-auth-secret-at-least-32-chars',
    BETTER_AUTH_URL: baseURL,
    WEB_ORIGIN: origin,
    ...flags,
  })
  Object.assign(runtime, createIngestionRuntime(config, { fetch: transport }), { now: () => clock })
}
const request = (path: string, options: RequestInit = {}) =>
  fetch(`${baseURL}${path}`, {
    headers: { Cookie: cookie, Origin: origin },
    ...options,
  })
const read = async () => {
  const calls = transport.mock.calls.length
  const historyResponse = await request('/api/ingestion/runs?limit=20')
  const overviewResponse = await request('/api/admin/overview')
  const dashboardResponse = await request('/api/ingestion/dashboard')
  expect([historyResponse.status, overviewResponse.status, dashboardResponse.status]).toEqual([
    200, 200, 200,
  ])
  const history = await historyResponse.json()
  const overview = await overviewResponse.json()
  const dashboard = await dashboardResponse.json()
  expect(transport).toHaveBeenCalledTimes(calls)
  expect.soft(overview.readiness.importAllowed).toBe(dashboard.source.enabled)
  expect.soft(overview.readiness.reuseAttested).toBe(dashboard.source.reuseApproved)
  expect.soft(overview.counts.failedImportedPosts).toBe(dashboard.counts.failed)
  return { history, overview, dashboard }
}
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  databaseUrl = mongo.getUri(`ingestion_operational_${randomUUID().replaceAll('-', '')}`)
  expect(new URL(databaseUrl).hostname).toBe('127.0.0.1')
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  db = (await import('@broke-oclock/db')).db
  const { createApp } = await import('@api/app')
  server = createServer()
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing owned HTTP address')
  baseURL = `http://127.0.0.1:${address.port}`
  const config = parseConfig({
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    BETTER_AUTH_URL: baseURL,
    WEB_ORIGIN: origin,
    CRON_SECRET: cronSecret,
  })
  server.on('request', createApp(config, { ingestion: runtime }))
  const signup = await fetch(`${baseURL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Synthetic operational admin',
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
})
beforeEach(async () => {
  for (const collection of [
    'DealSourceImage',
    'ImportedImage',
    'PromotionIdentity',
    'DealSource',
    'Deal',
    'ImportedPost',
    'IngestionRun',
    'ImportSource',
  ]) {
    await db.$runCommandRaw({ delete: collection, deletes: [{ q: {}, limit: 0 }] })
  }
  await db.user.update({ where: { id: actorId }, data: { role: 'ADMIN' } })
  clock = new Date(clock.getTime() + 31_000)
  batch = 1
  active = cases[0]
  transport.mockClear()
  configure()
})
afterAll(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  await db?.$disconnect()
  await mongo?.stop()
  expect(server?.listening ?? false).toBe(false)
  expect(mongo?.state).toBe('stopped')
  vi.unstubAllEnvs()
})
it.each(cases)(
  'exposes manual and scheduled $kind outcomes through both UI readers, including disabled history',
  async (fixture) => {
    active = fixture
    const source = await db.importSource.create({ data: { ...fixture.source, enabled: true } })
    configure({
      INGESTION_ENABLED: 'true',
      MONEYDIGEST_REUSE_APPROVED: fixture.kind === 'moneydigest' ? 'true' : 'false',
      SCOOBIFY_REUSE_APPROVED: fixture.kind === 'scoobify' ? 'true' : 'false',
    })
    const runIds: string[] = []
    for (const scheduled of [false, true]) {
      const response = await request(
        scheduled ? '/api/ingestion/scheduled-runs' : '/api/ingestion/runs',
        {
          method: scheduled ? 'GET' : 'POST',
          ...(scheduled ? { headers: { Authorization: `Bearer ${cronSecret}` } } : {}),
        },
      )
      expect(response.status).toBe(200)
      const result = await response.json()
      expect(result).toMatchObject({
        status: 'PARTIAL',
        fetchedCount: 2,
        createdCount: 1,
        failedCount: 1,
      })
      console.info('SYNTHETIC operational flow', {
        kind: fixture.kind,
        trigger: scheduled ? 'scheduled' : 'manual',
        sourceId: source.id,
        ...result,
      })
      runIds.push(result.runId)
      expect(
        await db.ingestionRun.findUniqueOrThrow({ where: { id: result.runId } }),
      ).toMatchObject({ sourceId: source.id, status: 'PARTIAL', failedCount: 1 })
      expect(
        await db.importedPost.count({ where: { sourceId: source.id, status: 'FAILED' } }),
      ).toBe(batch)
      const { history, overview, dashboard } = await read()
      expect
        .soft(history.items.map((run: { id: string }) => run.id).sort())
        .toEqual([...runIds].sort())
      expect.soft(overview.recentRuns).toEqual(history.items)
      for (const run of history.items)
        expect.soft(run).toMatchObject({
          sourceName: source.name,
          status: 'PARTIAL',
          fetchedCount: 2,
          createdCount: 1,
          failedCount: 1,
        })
      expect.soft(overview.counts.failedImportedPosts).toBe(batch)
      expect.soft(overview.counts.pendingImportedDrafts).toBe(batch)
      expect
        .soft(dashboard.source)
        .toMatchObject({ name: 'Registered sources', enabled: true, reuseApproved: true })
      expect.soft(overview.readiness).toMatchObject({
        ingestionOptIn: true,
        sourceRecordEnabled: true,
        sourceIdentityValid: true,
        reuseAttested: true,
        importAllowed: true,
      })
      batch++
      clock = new Date(clock.getTime() + 31_000)
    }
    configure({ INGESTION_ENABLED: 'false' })
    const optedOut = await read()
    expect(optedOut.history.items).toHaveLength(2)
    expect(optedOut.overview.counts.failedImportedPosts).toBe(2)
    expect(optedOut.overview.readiness.importAllowed).toBe(false)
    configure({ INGESTION_ENABLED: 'true' })
    const approvalRemoved = await read()
    expect(approvalRemoved.history.items).toHaveLength(2)
    expect(approvalRemoved.overview.counts.failedImportedPosts).toBe(2)
    expect(approvalRemoved.overview.readiness.importAllowed).toBe(fixture.kind === 'telegram')
    await db.importSource.update({ where: { id: source.id }, data: { enabled: false } })
    const disabled = await read()
    expect(disabled.history.items).toHaveLength(2)
    expect(disabled.overview.recentRuns).toEqual(disabled.history.items)
    expect(disabled.overview.counts.failedImportedPosts).toBe(2)
    expect(
      await db.importedPost.findMany({
        where: { sourceId: source.id, status: 'FAILED' },
        select: { errorCode: true },
      }),
    ).toEqual([{ errorCode: 'MALFORMED_POST' }, { errorCode: 'MALFORMED_POST' }])
    expect(disabled.overview.readiness.importAllowed).toBe(false)
    const before = transport.mock.calls.length
    expect((await request('/api/ingestion/runs', { method: 'POST' })).status).toBe(412)
    expect(transport).toHaveBeenCalledTimes(before)
  },
)
it.each(cases)(
  'retains the failed scheduled $kind run and its safe error through both readers',
  async (fixture) => {
    active = fixture
    const source = await db.importSource.create({ data: { ...fixture.source, enabled: true } })
    configure({
      INGESTION_ENABLED: 'true',
      MONEYDIGEST_REUSE_APPROVED: 'true',
      SCOOBIFY_REUSE_APPROVED: 'true',
    })
    transport.mockResolvedValueOnce(
      new Response('SYNTHETIC publisher unavailable', { status: 503 }),
    )
    const response = await request('/api/ingestion/scheduled-runs', {
      method: 'GET',
      headers: { Authorization: `Bearer ${cronSecret}` },
    })
    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result).toMatchObject({ status: 'FAILED', fetchedCount: 0, createdCount: 0 })
    const stored = await db.ingestionRun.findUniqueOrThrow({ where: { id: result.runId } })
    expect(stored).toMatchObject({ sourceId: source.id, status: 'FAILED', errorCode: 'HTTP_ERROR' })
    await db.importSource.update({ where: { id: source.id }, data: { enabled: false } })
    const { history, overview } = await read()
    expect(history.items).toEqual([
      expect.objectContaining({
        id: result.runId,
        sourceName: source.name,
        status: 'FAILED',
        errorCode: 'HTTP_ERROR',
      }),
    ])
    expect(overview.recentRuns).toEqual(history.items)
    expect(overview.counts.failedImportedPosts).toBe(0)
    expect(overview.readiness.importAllowed).toBe(false)
  },
)
it.each(cases)(
  'keeps $kind opt-in and publisher approval independent, with no provider I/O on reads',
  async (fixture) => {
    active = fixture
    const source = await db.importSource.create({ data: { ...fixture.source, enabled: true } })
    let result = await read()
    expect(result.overview.readiness.importAllowed).toBe(false)
    expect(result.dashboard.source.enabled).toBe(false)
    configure({ INGESTION_ENABLED: 'true' })
    result = await read()
    expect(result.overview.readiness.importAllowed).toBe(fixture.kind === 'telegram')
    expect(result.dashboard.source.reuseApproved).toBe(fixture.kind === 'telegram')
    if (fixture.kind !== 'telegram')
      expect((await request('/api/ingestion/runs', { method: 'POST' })).status).toBe(412)
    await db.importSource.update({
      where: { id: source.id },
      data: { url: 'https://unsupported.example.test/' },
    })
    result = await read()
    expect(result.overview.readiness.importAllowed).toBe(false)
    expect(result.dashboard.source.enabled).toBe(false)
    expect(transport).not.toHaveBeenCalled()
  },
)
it('excludes unsupported WordPress history/failures and does not combine approval from a disabled source with another enabled unapproved source', async () => {
  await db.importSource.create({ data: { ...telegram, enabled: false } })
  await db.importSource.create({ data: { ...SCOOBIFY_SOURCE, enabled: true } })
  const unsupported = await db.importSource.create({
    data: {
      provider: 'WORDPRESS',
      externalId: 'unsupported.example.test',
      name: 'Unsupported legacy publisher',
      url: 'https://unsupported.example.test/',
      enabled: true,
    },
  })
  await db.ingestionRun.create({
    data: { sourceId: unsupported.id, status: 'FAILED', failedCount: 1, startedAt: clock },
  })
  await db.importedPost.create({
    data: {
      sourceId: unsupported.id,
      externalId: 'synthetic',
      url: unsupported.url,
      status: 'FAILED',
      rawContent: '',
      contentHash: 'synthetic',
      errorCode: 'MALFORMED_POST',
    },
  })
  configure({ INGESTION_ENABLED: 'true', MONEYDIGEST_REUSE_APPROVED: 'true' })
  const { history, overview, dashboard } = await read()
  expect(history.items).toEqual([])
  expect(overview.recentRuns).toEqual([])
  expect(overview.counts.failedImportedPosts).toBe(0)
  expect(overview.readiness.importAllowed).toBe(false)
  expect(dashboard.source.enabled).toBe(false)
  expect((await request('/api/ingestion/runs', { method: 'POST' })).status).toBe(412)
  expect(transport).not.toHaveBeenCalled()
})
it('keeps bounded deterministic history across every supported publisher, independently of the active registry page', async () => {
  configure({ INGESTION_ENABLED: 'true' })
  const registered = []
  for (const fixture of cases)
    registered.push(await db.importSource.create({ data: { ...fixture.source, enabled: false } }))
  // More than a worker's registry page must not truncate disabled-source history.
  for (let index = 0; index < 51; index++)
    await db.importSource.create({
      data: {
        provider: 'WORDPRESS',
        externalId: `unsupported-${index}`,
        name: 'Unsupported synthetic publisher',
        url: 'https://unsupported.example.test/',
        enabled: true,
      },
    })
  const expected = []
  for (let index = 0; index < 25; index++) {
    const source = registered[index % registered.length]
    if (!source) throw new Error('Missing synthetic source')
    const run = await db.ingestionRun.create({
      data: { sourceId: source.id, startedAt: clock, status: 'SUCCEEDED' },
    })
    expected.push({ id: run.id, name: source.name })
  }
  expected.sort((left, right) => right.id.localeCompare(left.id))
  const shortResponse = await request('/api/ingestion/runs?limit=3')
  expect(shortResponse.status).toBe(200)
  const short = await shortResponse.json()
  expect(short.items.map((run: { id: string }) => run.id)).toEqual(
    expected.slice(0, 3).map((run) => run.id),
  )
  const defaultResponse = await request('/api/ingestion/runs')
  expect((await defaultResponse.json()).items.map((run: { id: string }) => run.id)).toEqual(
    expected.slice(0, 20).map((run) => run.id),
  )
  const { overview } = await read()
  expect(overview.recentRuns.map((run: { id: string }) => run.id)).toEqual(
    expected.slice(0, 10).map((run) => run.id),
  )
  expect(overview.recentRuns.map((run: { sourceName: string }) => run.sourceName)).toEqual(
    expected.slice(0, 10).map((run) => run.name),
  )
  expect(overview.readiness.importAllowed).toBe(false)
  expect(transport).not.toHaveBeenCalled()
})
it('uses the configured provider approval in the sources-array compatibility path', async () => {
  const source = await db.importSource.create({ data: { ...telegram, enabled: true } })
  configure({ INGESTION_ENABLED: 'true' })
  const definition = { ...telegram, kind: 'telegram' as const }
  delete runtime.sourceRuntime
  const provider = {
    source: definition,
    reuseApproved: false,
    listPosts: vi.fn().mockRejectedValue(new Error('No provider I/O on a read')),
  }
  runtime.sources = [provider]
  expect((await read()).overview.readiness.importAllowed).toBe(false)
  provider.reuseApproved = true
  expect((await read()).overview.readiness.importAllowed).toBe(true)
  await db.importSource.update({ where: { id: source.id }, data: { enabled: false } })
  expect((await read()).overview.readiness.importAllowed).toBe(false)
  expect(provider.listPosts).not.toHaveBeenCalled()
  delete runtime.sources
})
it('keeps the legacy MoneyDigest readiness fail-closed for missing approval and invalid identity', async () => {
  const source = await db.importSource.create({ data: { ...MONEYDIGEST_SOURCE, enabled: true } })
  configure({ INGESTION_ENABLED: 'true' })
  delete runtime.sourceRuntime
  expect((await read()).dashboard.source.enabled).toBe(false)
  runtime.reuseApproved = true
  expect((await read()).dashboard.source.enabled).toBe(true)
  await db.importSource.update({
    where: { id: source.id },
    data: { url: 'https://unsupported.example.test/' },
  })
  const invalid = await read()
  expect(invalid.overview.readiness.sourceIdentityValid).toBe(false)
  expect(invalid.dashboard.source.enabled).toBe(false)
  expect(transport).not.toHaveBeenCalled()
})
it('rejects mismatched persisted Telegram URL identity for readiness', async () => {
  await db.importSource.create({ data: { ...telegram, externalId: 'otherchannel', enabled: true } })
  configure({
    INGESTION_ENABLED: 'true',
    MONEYDIGEST_REUSE_APPROVED: 'true',
    SCOOBIFY_REUSE_APPROVED: 'true',
  })
  const { overview, dashboard } = await read()
  expect(overview.readiness).toMatchObject({
    sourceIdentityValid: false,
    reuseAttested: false,
    importAllowed: false,
  })
  expect(dashboard.source.enabled).toBe(false)
  expect((await request('/api/ingestion/runs', { method: 'POST' })).status).toBe(412)
  expect(transport).not.toHaveBeenCalled()
})
it('retains HTTP bounds, read method policy and fresh admin role checks without provider calls', async () => {
  for (const path of ['/api/ingestion/runs', '/api/admin/overview', '/api/ingestion/dashboard']) {
    expect((await request(path, { headers: {} })).status).toBe(401)
    expect((await request(path, { method: 'PUT' })).status).toBe(405)
  }
  expect((await request('/api/ingestion/runs?limit=101')).status).toBe(400)
  expect((await request('/api/ingestion/runs?limit=0')).status).toBe(400)
  expect(
    (
      await request('/api/ingestion/runs', {
        method: 'POST',
        headers: { Cookie: cookie, Origin: 'https://untrusted.example.test' },
      })
    ).status,
  ).toBe(403)
  expect(
    (
      await request('/api/ingestion/scheduled-runs', {
        method: 'GET',
        headers: { Authorization: `Bearer ${cronSecret}`, Origin: origin },
      })
    ).status,
  ).toBe(403)
  expect(
    (
      await request('/api/ingestion/scheduled-runs', {
        method: 'POST',
        headers: { Authorization: `Bearer ${cronSecret}` },
      })
    ).status,
  ).toBe(405)
  for (const role of ['USER', 'MODERATOR', 'MERCHANT'] as const) {
    await db.user.update({ where: { id: actorId }, data: { role } })
    for (const path of ['/api/ingestion/runs', '/api/admin/overview', '/api/ingestion/dashboard'])
      expect((await request(path)).status).toBe(403)
  }
  expect(transport).not.toHaveBeenCalled()
})
