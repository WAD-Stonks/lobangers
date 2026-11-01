import { execFile } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { parseConfig } from '@api/config'
import type { IngestionRuntime } from '@api/modules/ingestion/runtime'
import { runIngestion } from '@api/modules/ingestion/service'
import { MONEYDIGEST_SOURCE } from '@api/modules/ingestion/source'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

const root = new URL('../../../../', import.meta.url).pathname
const evidence = resolve(tmpdir(), `lobangers-ingestion-admin-${randomUUID()}`)
let mongo: MongoMemoryReplSet
let db: typeof import('@broke-oclock/db').db
let server: Server
let baseURL = ''
let databaseUrl = ''
let admin: { id: string; cookie: string }
let clock = new Date()
const post = (
  id = 101,
  content = 'Singapore pizza 50% off. Online only. No membership required. Valid from 1 October 2026 until 31 December 2026.',
) => ({
  id,
  link: `https://www.moneydigest.sg/synthetic-${id}/`,
  date: '2026-10-01T12:00:00',
  title: { rendered: 'Synthetic pizza' },
  content: { rendered: content },
  excerpt: { rendered: '' },
})
const runtime: IngestionRuntime = {
  enabled: true,
  reuseApproved: true,
  now: () => clock,
  listPosts: vi.fn(async () => [post()]),
}
const request = async (path: string, body?: unknown, cookie = admin.cookie) => {
  const r = await fetch(`${baseURL}/api/ingestion${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Cookie: cookie,
      Origin: 'http://localhost:5173',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { status: r.status, data: await r.json() }
}
beforeAll(async () => {
  if (process.env.DATABASE_URL) throw new Error('Refusing ambient DATABASE_URL')
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const url = mongo.getUri(`investigation_${randomUUID().replaceAll('-', '')}`)
  databaseUrl = url
  await mkdir(evidence, { recursive: true })
  await copyFile(`${root}/packages/db/prisma/schema.prisma`, `${evidence}/schema.prisma`)
  await promisify(execFile)(
    `${root}/packages/db/node_modules/.bin/prisma`,
    ['db', 'push', '--skip-generate', '--schema', `${evidence}/schema.prisma`],
    {
      cwd: evidence,
      env: { PATH: process.env.PATH, HOME: evidence, TMPDIR: evidence, DATABASE_URL: url },
      timeout: 60_000,
    },
  )
  vi.stubEnv('DATABASE_URL', url)
  vi.stubEnv('NODE_ENV', 'test')
  db = (await import('@broke-oclock/db')).db
  const express = (await import('express')).default
  const { createAuth } = await import('@api/auth')
  const { toNodeHandler } = await import('@broke-oclock/auth/node')
  const { apiErrorMiddleware } = await import('@api/errors')
  server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No listener')
  baseURL = `http://127.0.0.1:${address.port}`
  const config = parseConfig({
    DATABASE_URL: url,
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    BETTER_AUTH_URL: baseURL,
    WEB_ORIGIN: 'http://localhost:5173',
  })
  const auth = createAuth(config)
  const app = express()
  app.all('/api/auth/*splat', toNodeHandler(auth))
  app.use(express.json())
  const { createIngestionRouter } = await import('@api/rest/routers/ingestion')
  app.use('/api/ingestion', createIngestionRouter({ config, auth, ingestion: runtime }))
  const investigation = await import('@api/rest/routers/ingestion-investigation').catch(() => null)
  if (investigation)
    app.use(
      '/api/ingestion',
      investigation.createIngestionInvestigationRouter({ config, auth, ingestion: runtime }),
    )
  app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND' } }))
  app.use(apiErrorMiddleware)
  server.on('request', app)
  const r = await fetch(`${baseURL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({
      name: 'Synthetic operator',
      email: `${randomUUID()}@example.test`,
      password: randomBytes(24).toString('base64url'),
    }),
  })
  expect(r.status).toBe(200)
  const body = await r.json()
  admin = {
    id: body.user.id,
    cookie: r.headers
      .getSetCookie()
      .map((v) => v.split(';')[0])
      .join('; '),
  }
  await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
  await db.importSource.create({ data: { ...MONEYDIGEST_SOURCE, enabled: true } })
}, 180_000)
afterAll(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
  await db?.$disconnect()
  await mongo?.stop()
  expect(server?.listening ?? false).toBe(false)
  expect(mongo?.state).toBe('stopped')
  vi.unstubAllEnvs()
  await writeFile(
    resolve(evidence, 'qi1-teardown.json'),
    JSON.stringify({ httpListening: server?.listening ?? false, mongo: mongo?.state }),
  )
  console.log(
    'QI1_TEARDOWN',
    JSON.stringify({ httpListening: server?.listening ?? false, mongo: mongo?.state }),
  )
})
it('F8 retains a real mixed HTTP read whose target query precedes exact terminal recovery', async () => {
  const { row, body } = await boundaryTarget()
  clock = new Date()
  const initial = await request(`/posts/${row.id}`)
  expect(initial.status).toBe(200)
  const barrier = () => {
    let arrive!: () => void
    let release!: () => void
    const waiting = new Promise<void>((resolve) => {
      arrive = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    return {
      waiting,
      release,
      pause: async () => {
        arrive()
        await gate
      },
    }
  }
  const provider = barrier(),
    read = barrier()
  const { createIngestionRuntime } = await import('@api/modules/ingestion/runtime')
  const controlledFetch = vi.fn(async () => {
    await provider.pause()
    return Response.json([
      post(Number(row.externalId), post().content.rendered.replace('50%', '40%')),
    ])
  })
  const registered = createIngestionRuntime(
    parseConfig({
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
      BETTER_AUTH_URL: baseURL,
      WEB_ORIGIN: 'http://localhost:5173',
      INGESTION_ENABLED: 'true',
      MONEYDIGEST_REUSE_APPROVED: 'true',
    }),
    { fetch: controlledFetch },
  )
  runtime.sourceRuntime = registered.sourceRuntime
  const operation = request(`/posts/${row.id}/recoveries`, {
    ...body,
    mode: 'REFRESH_SOURCE_WINDOW',
  })
  await provider.waiting
  const admittedTarget = await db.importedPost.findUniqueOrThrow({ where: { id: row.id } })
  const find = db.importedPost.findUnique.bind(db.importedPost)
  const observer = vi.spyOn(db.importedPost, 'findUnique').mockImplementation((...args) => {
    const query = find(...args)
    return new Proxy(query, {
      get(target, key, receiver) {
        if (key === 'then')
          return (...callbacks: Parameters<typeof query.then>) =>
            query
              .then(async (value) => {
                // Pause only AFTER the actual selected target query has completed.
                if (args[0].where.id === row.id && args[0].select?.latestSnapshot === true)
                  await read.pause()
                return value
              })
              .then(...callbacks)
        const value: unknown = Reflect.get(target, key, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  })
  let mixedRequest: ReturnType<typeof request> | undefined
  try {
    mixedRequest = request(`/posts/${row.id}`)
    await read.waiting
    clock = new Date(clock.getTime() + 1_000)
    provider.release()
    const terminal = await operation
    expect(terminal.status).toBe(200)
    expect(terminal.data).toMatchObject({
      postId: row.id,
      status: 'SUCCEEDED',
      targetOutcome: 'RECOVERED',
    })
    clock = new Date(clock.getTime() + 31_000)
    const afterCommit = await boundaryState()
    read.release()
    const mixed = await mixedRequest
    observer.mockRestore()
    const fresh = await request(`/posts/${row.id}`)
    expect(mixed.status).toBe(200)
    expect(fresh.status).toBe(200)
    expect(mixed.data.latestRecovery).toEqual(terminal.data)
    expect(mixed.data.post.contentHash).toBe(row.contentHash)
    expect(mixed.data.post.updatedAt).toBe(admittedTarget.updatedAt.toISOString())
    expect(fresh.data.post.contentHash).not.toBe(row.contentHash)
    expect(fresh.data.post.updatedAt).not.toBe(admittedTarget.updatedAt.toISOString())
    expect(mixed.data.capabilities.every((c: { allowed: boolean }) => c.allowed)).toBe(true)
    expect(controlledFetch).toHaveBeenCalledTimes(1)
    expect(await boundaryState()).toEqual(afterCommit)
    const receipt = {
      initial: initial.data,
      mixed: mixed.data,
      fresh: fresh.data,
      recovery: terminal.data,
    }
    await writeFile(
      process.env.LOBANGERS_RECONCILE_FIXTURE ?? resolve(evidence, 'mixed-read.json'),
      JSON.stringify(receipt, null, 2),
    )
    console.log(
      'F8_REAL_MIXED_READ',
      JSON.stringify({
        old: mixed.data.post.updatedAt,
        fresh: fresh.data.post.updatedAt,
        terminal: terminal.data.status,
        providerCalls: controlledFetch.mock.calls.length,
      }),
    )
  } finally {
    provider.release()
    read.release()
    observer.mockRestore()
    delete runtime.sourceRuntime
    await operation
    if (mixedRequest) await mixedRequest
  }
})

it('captures a complete exact envelope before media failure without reconstructing rawContent', async () => {
  const input = post(
    101,
    `${post().content.rendered}<img src="https://www.moneydigest.sg/wp-content/uploads/synthetic.jpg">`,
  )
  vi.mocked(runtime.listPosts).mockResolvedValueOnce([input])
  runtime.fetchImage = vi.fn().mockRejectedValue(new Error('Synthetic media failure'))
  await runIngestion(db, runtime)
  const row = await db.importedPost.findFirstOrThrow({ where: { externalId: '101' } })
  expect(row.status).toBe('FAILED')
  expect(row.latestSnapshot).toBe(JSON.stringify(input))
  expect(row.latestSnapshotHash).toBe(
    createHash('sha256').update(JSON.stringify(input)).digest('hex'),
  )
  expect(row.snapshotFormat).toBe('moneydigest-v1')
  expect(row.failureStage).toBe('MEDIA')
  delete runtime.fetchImage
})
it('recovers only the confirmed exact stored envelope, durably audits, preserves canonical citations and applies cooldown', async () => {
  const row = await db.importedPost.findFirstOrThrow({ where: { externalId: '101' } })
  const body = {
    expectedUpdatedAt: row.updatedAt.toISOString(),
    expectedContentHash: row.contentHash,
    mode: 'REPROCESS_STORED',
    note: 'Synthetic exact envelope recovery',
    confirmed: true,
  }
  clock = new Date(clock.getTime() + 31_000)
  const result = await request(`/posts/${row.id}/recoveries`, body)
  expect(result.status).toBe(200)
  expect(result.data).toMatchObject({
    postId: row.id,
    mode: 'REPROCESS_STORED',
    status: 'SUCCEEDED',
    targetOutcome: 'RECOVERED',
  })
  expect((await request(`/recoveries/${result.data.id}`)).data).toEqual(result.data)
  const linked = await db.dealSource.findMany({ where: { importedPostId: row.id } })
  expect(linked).toHaveLength(1)
  expect(await db.platformAudit.count({ where: { subjectId: result.data.id } })).toBe(2)
  expect((await request(`/posts/${row.id}/recoveries`, body)).status).toBe(409)
  const fresh = await db.importedPost.findUniqueOrThrow({ where: { id: row.id } })
  const freshBody = {
    ...body,
    expectedUpdatedAt: fresh.updatedAt.toISOString(),
    expectedContentHash: fresh.contentHash,
  }
  expect((await request(`/posts/${row.id}/recoveries`, freshBody)).status).toBe(429)
  clock = new Date(clock.getTime() + 31_000)
  const again = await request(`/posts/${row.id}/recoveries`, freshBody)
  expect(again.data).toMatchObject({ status: 'SUCCEEDED', targetOutcome: 'UNCHANGED' })
  expect(await db.dealSource.findMany({ where: { importedPostId: row.id } })).toEqual(linked)
})
it('reads every immutable citation with membership checks, exact bytes, numeric values, and disabled source scope', async () => {
  const source = await db.importSource.findFirstOrThrow()
  const deal = await db.deal.create({
    data: {
      title: 'Synthetic fixed price',
      description: 'Synthetic',
      category: 'other',
      origin: 'IMPORTED',
      reviewStatus: 'PENDING',
      offerType: 'FIXED_PRICE',
      priceMinor: 1250,
      currency: 'SGD',
      discountPercent: null,
      applicability: 'ONLINE',
    },
  })
  const citations = []
  for (const id of [201, 202]) {
    const input = post(id)
    const snapshot = JSON.stringify(input)
    const imported = await db.importedPost.create({
      data: {
        sourceId: source.id,
        externalId: String(id),
        url: input.link,
        rawContent: 'Not an envelope',
        contentHash: createHash('sha256').update(snapshot).digest('hex'),
        status: 'NEEDS_REVIEW',
      },
    })
    citations.push(
      await db.dealSource.create({
        data: {
          dealId: deal.id,
          importedPostId: imported.id,
          sourceContentHash: imported.contentHash,
          sourceContentSnapshot: snapshot,
          sourceUrl: imported.url,
        },
      }),
    )
  }
  await db.importSource.update({ where: { id: source.id }, data: { enabled: false } })
  const page = await request(`/drafts/${deal.id}/evidence?limit=1`)
  const [firstCitation, secondCitation] = citations
  if (!firstCitation || !secondCitation) throw new Error('Missing exact citation fixtures')
  expect(page.status).toBe(200)
  expect(page.data.items).toHaveLength(1)
  expect(page.data.nextCursor).toBe(firstCitation.id)
  expect(page.data.items[0]).toMatchObject({
    id: firstCitation.id,
    pinnedHash: firstCitation.sourceContentHash,
    hashMatchesCurrent: true,
    imageCount: 0,
    source: { enabled: false },
  })
  const next = await request(`/drafts/${deal.id}/evidence?limit=1&cursor=${page.data.nextCursor}`)
  expect(next.data.items.map((v: { id: string }) => v.id)).toEqual([secondCitation.id])
  expect(next.data.nextCursor).toBeNull()
  const detail = await request(`/drafts/${deal.id}/evidence/${firstCitation.id}`)
  expect(detail.status).toBe(200)
  expect(detail.data.snapshot).toBe(firstCitation.sourceContentSnapshot)
  expect(detail.data.hashVerified).toBe(true)
  expect(
    (await request(`/drafts/000000000000000000000001/evidence/${firstCitation.id}`)).status,
  ).toBe(404)
  const queue = await request('/drafts')
  expect(queue.data.items.find((v: { id: string }) => v.id === deal.id)).toMatchObject({
    priceMinor: 1250,
    currency: 'SGD',
    discountPercent: null,
  })
  await db.importSource.update({ where: { id: source.id }, data: { enabled: true } })
})

it('fences the canonical parent operation version on a new citation without editing prior evidence', async () => {
  const original = await db.dealSource.findFirstOrThrow({
    where: { importedPost: { externalId: '101' } },
  })
  const deal = await db.deal.findUniqueOrThrow({ where: { id: original.dealId } })
  clock = new Date(clock.getTime() + 31_000)
  vi.mocked(runtime.listPosts).mockResolvedValueOnce([
    post(
      102,
      `${post().content.rendered}<img src="https://www.moneydigest.sg/wp-content/uploads/synthetic.jpg">`,
    ),
  ])
  await runIngestion(db, runtime)
  const after = await db.deal.findUniqueOrThrow({ where: { id: deal.id } })
  expect(after.operationVersion).toBe((deal.operationVersion ?? 0) + 1)
  expect(await db.dealSource.findUnique({ where: { id: original.id } })).toEqual(original)
  expect(await db.deal.count({ where: { id: deal.id } })).toBe(1)
})
it('returns bounded metadata rather than fabricated oversized or unknown snapshot content', async () => {
  const link = await db.dealSource.findFirstOrThrow()
  for (const text of ['🧪'.repeat(300_000), '{"unknown":"<script>alert(1)</script>"}']) {
    // Deliberately corrupt legacy fixture: no production writer mutates citations.
    await db.dealSource.update({ where: { id: link.id }, data: { sourceContentSnapshot: text } })
    const r = await request(`/drafts/${link.dealId}/evidence/${link.id}`)
    expect(r.status).toBe(200)
    expect(r.data.snapshot).toBeNull()
    expect(r.data.parsed).toBeNull()
    expect(r.data.hashVerified).toBe(false)
    expect(Buffer.byteLength(JSON.stringify(r.data))).toBeLessThanOrEqual(1024 * 1024)
  }
  await db.dealSource.update({
    where: { id: link.id },
    data: { sourceContentSnapshot: link.sourceContentSnapshot },
  })
})
it('bounds refresh to two pages of the one registered source and returns NOT_OBSERVED for an absent target', async () => {
  const row = await db.importedPost.findFirstOrThrow({ where: { externalId: '101' } })
  clock = new Date(clock.getTime() + 31_000)
  const listPosts = vi.fn(async () => ({ posts: [post(987)], nextCursor: '2' }))
  runtime.sourceRuntime = (definition) => ({ source: definition, reuseApproved: true, listPosts })
  const before = await db.importedPost.count()
  const r = await request(`/posts/${row.id}/recoveries`, {
    expectedUpdatedAt: row.updatedAt.toISOString(),
    expectedContentHash: row.contentHash,
    mode: 'REFRESH_SOURCE_WINDOW',
    note: 'Synthetic bounded refresh',
    confirmed: true,
  })
  expect(r.status).toBe(200)
  expect(r.data).toMatchObject({ status: 'SUCCEEDED', targetOutcome: 'NOT_OBSERVED' })
  expect(listPosts.mock.calls).toEqual([
    [{ page: 1, perPage: 20, cursor: null }],
    [{ page: 2, perPage: 20, cursor: '2' }],
  ])
  expect(await db.importedPost.count()).toBe(before)
  delete runtime.sourceRuntime
})
it('retains legacy missing envelopes, rejects disabled recovery, validates confirmation and exposes safe read capabilities', async () => {
  const row = await db.importedPost.findFirstOrThrow({ where: { externalId: '201' } })
  const r = await request(`/posts/${row.id}`)
  expect(r.status).toBe(200)
  expect(r.data.post.snapshotAvailable).toBe(false)
  expect(
    r.data.capabilities.find((c: { mode: string }) => c.mode === 'REPROCESS_STORED'),
  ).toMatchObject({ allowed: false })
  expect(JSON.stringify(r.data)).not.toContain('Not an envelope')
  const body = {
    expectedUpdatedAt: row.updatedAt.toISOString(),
    expectedContentHash: row.contentHash,
    mode: 'REPROCESS_STORED',
    note: 'Synthetic missing',
    confirmed: true,
  }
  expect((await request(`/posts/${row.id}/recoveries`, body)).status).toBe(412)
  expect((await request(`/posts/${row.id}/recoveries`, { ...body, confirmed: false })).status).toBe(
    400,
  )
  await db.importSource.update({ where: { id: row.sourceId }, data: { enabled: false } })
  expect(
    (await request(`/posts/${row.id}/recoveries`, { ...body, mode: 'REFRESH_SOURCE_WINDOW' }))
      .status,
  ).toBe(412)
  await db.importSource.update({ where: { id: row.sourceId }, data: { enabled: true } })
  expect((await request('/posts', undefined, '')).status).toBe(401)
  expect((await request('/posts?limit=999')).status).toBe(400)
  const { createIngestionInvestigationClient } = await import(
    '@broke-oclock/api-client/ingestion-investigation'
  )
  const axios = (await import('axios')).default
  const client = createIngestionInvestigationClient(
    axios.create({ baseURL: `${baseURL}/api`, headers: { Cookie: admin.cookie } }),
  )
  expect((await client.post(row.id)).post.id).toBe(row.id)
  expect(() => client.posts({ limit: 999 })).toThrow()
  expect((await client.posts()).items.every((item) => item.status === 'FAILED')).toBe(true)
})
it('rechecks current administrator after the provider boundary and records interruption without source/deal mutation', async () => {
  const row = await db.importedPost.findFirstOrThrow({ where: { externalId: '101' } })
  const links = await db.dealSource.findMany({ where: { importedPostId: row.id } })
  clock = new Date(clock.getTime() + 31_000)
  runtime.sourceRuntime = (definition) => ({
    source: definition,
    reuseApproved: true,
    listPosts: async () => {
      await db.user.update({ where: { id: admin.id }, data: { role: 'USER' } })
      return { posts: [post(101)], nextCursor: null }
    },
  })
  try {
    const r = await request(`/posts/${row.id}/recoveries`, {
      expectedUpdatedAt: row.updatedAt.toISOString(),
      expectedContentHash: row.contentHash,
      mode: 'REFRESH_SOURCE_WINDOW',
      note: 'Synthetic demotion boundary',
      confirmed: true,
    })
    expect(r.status).toBe(200)
    expect(r.data).toMatchObject({
      status: 'INTERRUPTED',
      targetOutcome: 'UNKNOWN',
      errorCode: 'FORBIDDEN',
    })
    expect(await db.dealSource.findMany({ where: { importedPostId: row.id } })).toEqual(links)
    expect((await request(`/recoveries/${r.data.id}`)).status).toBe(403)
  } finally {
    delete runtime.sourceRuntime
    await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
  }
})

it('rolls back admission and reservation when the transactional audit cannot be persisted', async () => {
  const row = await db.importedPost.findFirstOrThrow({ where: { externalId: '101' } })
  clock = new Date(clock.getTime() + 31_000)
  const source = await db.importSource.findUniqueOrThrow({ where: { id: row.sourceId } })
  const before = await db.ingestionRecovery.count()
  const transact = db.$transaction.bind(db)
  const spy = vi.spyOn(db, '$transaction').mockImplementation((operation, options) =>
    transact(
      async (tx) =>
        operation(
          new Proxy(tx, {
            get(target, key, receiver) {
              if (key !== 'platformAudit') return Reflect.get(target, key, receiver)
              return new Proxy(target.platformAudit, {
                get(delegate, method, delegateReceiver) {
                  if (method !== 'create') return Reflect.get(delegate, method, delegateReceiver)
                  return () => {
                    throw new Error('Synthetic audit rollback')
                  }
                },
              })
            },
          }),
        ),
      options,
    ),
  )
  try {
    const r = await request(`/posts/${row.id}/recoveries`, {
      expectedUpdatedAt: row.updatedAt.toISOString(),
      expectedContentHash: row.contentHash,
      mode: 'REPROCESS_STORED',
      note: 'Synthetic rollback',
      confirmed: true,
    })
    expect(r.status).toBe(500)
  } finally {
    spy.mockRestore()
  }
  expect(await db.importedPost.findUnique({ where: { id: row.id } })).toEqual(row)
  expect(await db.importSource.findUnique({ where: { id: row.sourceId } })).toEqual(source)
  expect(await db.ingestionRecovery.count()).toBe(before)
})
it('admits at most one concurrent claimant and retains a stolen lease token on owner release', async () => {
  const row = await db.importedPost.findFirstOrThrow({ where: { externalId: '101' } })
  clock = new Date(clock.getTime() + 31_000)
  let release!: () => void
  let entered!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const ready = new Promise<void>((resolve) => {
    entered = resolve
  })
  runtime.sourceRuntime = (definition) => ({
    source: definition,
    reuseApproved: true,
    listPosts: async () => {
      entered()
      await gate
      return { posts: [post(101)], nextCursor: null }
    },
  })
  const body = {
    expectedUpdatedAt: row.updatedAt.toISOString(),
    expectedContentHash: row.contentHash,
    mode: 'REFRESH_SOURCE_WINDOW',
    note: 'Synthetic owner race',
    confirmed: true,
  }
  const first = request(`/posts/${row.id}/recoveries`, body)
  await ready
  expect((await request(`/posts/${row.id}/recoveries`, body)).status).toBe(409)
  await db.importSource.update({
    where: { id: row.sourceId },
    data: {
      leaseToken: 'synthetic-new-owner',
      leaseExpiresAt: new Date(clock.getTime() + 120_000),
    },
  })
  const pending = await db.ingestionRecovery.findFirstOrThrow({
    where: { postId: row.id },
    orderBy: { requestedAt: 'desc' },
  })
  expect(pending.ownerLeaseToken).toEqual(expect.any(String))
  expect(pending.ownerLeaseToken).not.toBe('synthetic-new-owner')
  const beforeReconciliation = await boundaryState()
  for (const path of [`/recoveries/${pending.id}`, `/posts/${row.id}`]) {
    const response = await request(path)
    expect(response.status).toBe(200)
    const projected = path.startsWith('/posts/') ? response.data.latestRecovery : response.data
    expect(projected).toMatchObject({
      status: 'INTERRUPTED',
      targetOutcome: 'UNKNOWN',
      finishedAt: null,
    })
    expect(projected).not.toHaveProperty('ownerLeaseToken')
    const head = await boundaryRequest(path, 'HEAD')
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
  }
  expect(await boundaryState()).toEqual(beforeReconciliation)
  release()
  const outcome = await first
  expect(outcome.data).toMatchObject({ status: 'INTERRUPTED', targetOutcome: 'UNKNOWN' })
  expect(
    (await db.importSource.findUniqueOrThrow({ where: { id: row.sourceId } })).leaseToken,
  ).toBe('synthetic-new-owner')
  await db.importSource.update({
    where: { id: row.sourceId },
    data: { leaseToken: null, leaseExpiresAt: null },
  })
  delete runtime.sourceRuntime
})
it('rejects protected persistence after source disable while allowing read-only durable outcomes', async () => {
  const row = await db.importedPost.findFirstOrThrow({ where: { externalId: '101' } })
  const citations = await db.dealSource.findMany({ where: { importedPostId: row.id } })
  clock = new Date(clock.getTime() + 31_000)
  runtime.sourceRuntime = (definition) => ({
    source: definition,
    reuseApproved: true,
    listPosts: async () => {
      await db.importSource.update({ where: { id: row.sourceId }, data: { enabled: false } })
      return { posts: [post(101, 'Changed content 50% off')], nextCursor: null }
    },
  })
  try {
    const r = await request(`/posts/${row.id}/recoveries`, {
      expectedUpdatedAt: row.updatedAt.toISOString(),
      expectedContentHash: row.contentHash,
      mode: 'REFRESH_SOURCE_WINDOW',
      note: 'Synthetic source disabled boundary',
      confirmed: true,
    })
    expect(r.status).toBe(200)
    expect(r.data).toMatchObject({
      status: 'INTERRUPTED',
      targetOutcome: 'UNKNOWN',
      errorCode: 'CONFLICT',
    })
    expect(await db.dealSource.findMany({ where: { importedPostId: row.id } })).toEqual(citations)
    expect(
      (await db.importedPost.findUniqueOrThrow({ where: { id: row.id } })).latestSnapshotHash,
    ).toBe(row.latestSnapshotHash)
  } finally {
    delete runtime.sourceRuntime
    await db.importSource.update({ where: { id: row.sourceId }, data: { enabled: true } })
  }
})
it('keeps approved, rejected and hidden canonical content and SOURCE_CHANGED intact during exact reprocessing', async () => {
  const row = await db.importedPost.findFirstOrThrow({ where: { externalId: '101' } })
  const link = await db.dealSource.findFirstOrThrow({ where: { importedPostId: row.id } })
  for (const reviewStatus of ['APPROVED', 'REJECTED', 'HIDDEN'] as const) {
    await db.deal.update({ where: { id: link.dealId }, data: { reviewStatus } })
    const deal = await db.deal.findUniqueOrThrow({ where: { id: link.dealId } })
    const current = await db.importedPost.update({
      where: { id: row.id },
      data: { status: 'FAILED', errorCode: 'SOURCE_CHANGED' },
    })
    clock = new Date(clock.getTime() + 31_000)
    const r = await request(`/posts/${row.id}/recoveries`, {
      expectedUpdatedAt: current.updatedAt.toISOString(),
      expectedContentHash: current.contentHash,
      mode: 'REPROCESS_STORED',
      note: 'Synthetic protected content',
      confirmed: true,
    })
    expect(r.status).toBe(200)
    expect(r.data.targetOutcome).toBe('STILL_FAILED')
    expect(await db.deal.findUnique({ where: { id: deal.id } })).toEqual(deal)
    expect(await db.dealSource.findUnique({ where: { id: link.id } })).toEqual(link)
    expect((await db.importedPost.findUniqueOrThrow({ where: { id: row.id } })).errorCode).toBe(
      'SOURCE_CHANGED',
    )
  }
})
// Router boundary fixtures are independent of the historical ingestion scenarios above.
// Raw collection reads retain missing fields as well as every persisted fence/version.
const boundaryState = async () =>
  Promise.all(
    [
      'User',
      'Session',
      'Account',
      'Verification',
      'PlatformAccessFence',
      'StallGrant',
      'MerchantAccessRequest',
      'PlatformAudit',
      'AdminEvidence',
      'Merchant',
      'Venue',
      'Deal',
      'DealVenue',
      'DealVote',
      'Comment',
      'Bookmark',
      'DealReport',
      'CommentReport',
      'UploadedFile',
      'ImportSource',
      'ImportedPost',
      'DealSource',
      'ImportedImage',
      'DealSourceImage',
      'PromotionIdentity',
      'IngestionRecovery',
      'IngestionRun',
    ].map(async (collection) => {
      const result = await db.$runCommandRaw({
        find: collection,
        filter: {},
        sort: { _id: 1 },
        batchSize: 1000,
        singleBatch: true,
      })
      const { firstBatch } = (result as { cursor: { firstBatch: unknown[] } }).cursor
      expect(firstBatch.length).toBeLessThan(1000)
      return { collection, rows: firstBatch }
    }),
  )
let boundaryExternalId = 97000
const boundaryTarget = async () => {
  const source = await db.importSource.findFirstOrThrow()
  const input = post(++boundaryExternalId)
  const snapshot = JSON.stringify(input)
  const hash = createHash('sha256').update(snapshot).digest('hex')
  const row = await db.importedPost.create({
    data: {
      sourceId: source.id,
      externalId: String(input.id),
      url: input.link,
      rawContent: 'Do not reconstruct boundary evidence',
      contentHash: hash,
      latestSnapshot: snapshot,
      latestSnapshotHash: hash,
      snapshotFormat: 'moneydigest-v1',
      status: 'FAILED',
    },
  })
  clock = new Date(clock.getTime() + 31_000)
  return {
    row,
    body: {
      expectedUpdatedAt: row.updatedAt.toISOString(),
      expectedContentHash: row.contentHash,
      mode: 'REPROCESS_STORED',
      note: 'Synthetic router boundary consent',
      confirmed: true,
    },
  }
}
const boundaryRequest = (path: string, method: string, origin?: string, body?: unknown) =>
  fetch(`${baseURL}/api/ingestion${path}`, {
    method,
    headers: {
      Cookie: admin.cookie,
      ...(origin === undefined ? {} : { Origin: origin }),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
it.each([undefined, 'https://hostile.example', 'null', 'http://localhost:5173.hostile.example'])(
  'boundary rejects recovery Origin %s before any persisted write',
  async (origin) => {
    const { row, body } = await boundaryTarget()
    const before = await boundaryState()
    const calls = vi.mocked(runtime.listPosts).mock.calls.length
    const response = await boundaryRequest(`/posts/${row.id}/recoveries`, 'POST', origin, body)
    expect.soft(response.status).toBe(403)
    expect.soft(await response.json()).toMatchObject({ error: { code: 'FORBIDDEN' } })
    expect(await boundaryState()).toEqual(before)
    expect(vi.mocked(runtime.listPosts).mock.calls).toHaveLength(calls)
  },
)
it('boundary binds recovery consent to URL target and strict body without writes', async () => {
  const first = await boundaryTarget()
  const second = await boundaryTarget()
  const before = await boundaryState()
  for (const [body, status] of [
    [{ ...first.body, postId: second.row.id }, 400],
    [{ ...first.body, expectedContentHash: '0'.repeat(64) }, 409],
    [{ ...first.body, confirmed: false }, 400],
  ] as const) {
    const response = await boundaryRequest(
      `/posts/${first.row.id}/recoveries`,
      'POST',
      'http://localhost:5173',
      body,
    )
    expect(response.status).toBe(status)
    expect(await boundaryState()).toEqual(before)
  }
})
it('boundary accepts exact trusted Origin and preserves recovery result and audit semantics', async () => {
  const { row, body } = await boundaryTarget()
  const result = await boundaryRequest(
    `/posts/${row.id}/recoveries`,
    'POST',
    'http://localhost:5173',
    body,
  )
  expect(result.status).toBe(200)
  const recovered = await result.json()
  expect(recovered).toMatchObject({
    postId: row.id,
    status: 'SUCCEEDED',
    targetOutcome: 'RECOVERED',
  })
  expect(await db.platformAudit.count({ where: { subjectId: recovered.id } })).toBe(2)
  expect(await db.ingestionRun.findUnique({ where: { id: recovered.runId } })).not.toBeNull()
  expect(
    (await db.importSource.findUniqueOrThrow({ where: { id: row.sourceId } })).leaseToken,
  ).toBeNull()
})
it('boundary GET and implicit HEAD evidence, post and recovery reads remain read-only; recovery writes reject read methods', async () => {
  const { row, body } = await boundaryTarget()
  const result = await request(`/posts/${row.id}/recoveries`, body)
  expect(result.status).toBe(200)
  const citation = await db.dealSource.findFirstOrThrow({ where: { importedPostId: row.id } })
  // A refresh-due native session must not be refreshed by protected resource reads.
  await db.session.updateMany({
    where: { userId: admin.id },
    data: { updatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
  })
  const before = await boundaryState()
  const paths = [
    `/drafts/${citation.dealId}/evidence`,
    `/drafts/${citation.dealId}/evidence/${citation.id}`,
    '/posts',
    `/posts/${row.id}`,
    `/recoveries/${result.data.id}`,
  ]
  for (const path of paths) {
    for (const method of ['GET', 'HEAD']) {
      const response = await boundaryRequest(path, method)
      expect(response.status, `${method} ${path}`).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      const text = await response.text()
      if (method === 'HEAD') expect(text).toBe('')
      else expect(JSON.parse(text)).toBeTruthy()
      expect(await boundaryState(), `${method} ${path} changed persistence`).toEqual(before)
    }
    const unsupported = await boundaryRequest(path, 'POST', 'http://localhost:5173', {})
    expect(unsupported.status).toBe(405)
    expect(unsupported.headers.get('Allow')).toBe('GET')
  }
  for (const method of ['GET', 'HEAD', 'PATCH', 'DELETE']) {
    const response = await boundaryRequest(`/posts/${row.id}/recoveries`, method)
    expect(response.status).toBe(405)
    expect(response.headers.get('Allow')).toBe('POST')
  }
  expect(await boundaryState()).toEqual(before)
})

it('exposes exact UTF-8 Unicode evidence, normalized historical envelopes, and image final URL provenance', async () => {
  const source = await db.importSource.findFirstOrThrow()
  const input = {
    externalId: '901',
    url: 'https://www.moneydigest.sg/synthetic-901/',
    publishedAt: null,
    sourceUpdatedAt: null,
    title: 'Synthetic 🧪',
    contentHtml: '漢'.repeat(90_000),
    excerptHtml: '',
    images: [],
  }
  const snapshot = JSON.stringify(input)
  const hash = createHash('sha256').update(snapshot).digest('hex')
  const imported = await db.importedPost.create({
    data: {
      sourceId: source.id,
      externalId: '901',
      url: input.url,
      rawContent: '',
      contentHash: hash,
      latestSnapshot: snapshot,
      latestSnapshotHash: hash,
      snapshotFormat: 'source-post-v1',
    },
  })
  const deal = await db.deal.create({
    data: {
      title: 'Unicode synthetic',
      description: '',
      category: 'other',
      origin: 'IMPORTED',
      offerType: 'OTHER',
      applicability: 'ONLINE',
    },
  })
  const link = await db.dealSource.create({
    data: {
      dealId: deal.id,
      importedPostId: imported.id,
      sourceContentHash: hash,
      sourceContentSnapshot: snapshot,
      sourceUrl: input.url,
    },
  })
  const image = await db.importedImage.create({
    data: { id: 'f'.repeat(64), mimeType: 'image/png', sizeBytes: 32 },
  })
  await db.dealSourceImage.create({
    data: {
      dealSourceId: link.id,
      imageId: image.id,
      sourceUrl: 'https://www.moneydigest.sg/wp-content/uploads/a.png',
      finalUrl: 'https://i0.wp.com/www.moneydigest.sg/wp-content/uploads/a.png',
    },
  })
  const r = await request(`/drafts/${deal.id}/evidence/${link.id}`)
  expect(r.status).toBe(200)
  expect(r.data).toMatchObject({
    snapshot,
    format: 'source-post-v1',
    hashVerified: true,
    snapshotBytes: Buffer.byteLength(snapshot),
  })
  expect(r.data.images[0].finalUrl).toBe(
    'https://i0.wp.com/www.moneydigest.sg/wp-content/uploads/a.png',
  )
  expect(Buffer.byteLength(JSON.stringify(r.data))).toBeLessThanOrEqual(1024 * 1024)
})

it.each([
  'other-post',
  'invalid-provider-id',
  'other-source',
  'literal-target-id',
  'normalized-other-post',
] as const)(
  'F3 refuses %s stored evidence before admission and without any collection/provider writes',
  async (variant) => {
    const { row, body } = await boundaryTarget()
    const stored =
      variant === 'other-post'
        ? post(88001)
        : variant === 'invalid-provider-id'
          ? { ...post(), id: '101' }
          : variant === 'literal-target-id'
            ? post(Number(row.externalId))
            : variant === 'normalized-other-post'
              ? {
                  externalId: '88001',
                  url: 'https://www.moneydigest.sg/synthetic-88001/',
                  publishedAt: null,
                  sourceUpdatedAt: null,
                  title: 'Synthetic normalized historical post',
                  contentHtml: post().content.rendered,
                  excerptHtml: '',
                  images: [],
                }
              : {
                  ...post(Number(row.externalId)),
                  link: 'https://scoobifydaily.wordpress.com/88001/',
                }
    const text = JSON.stringify(stored)
    await db.importedPost.update({
      where: { id: row.id },
      data: {
        ...(variant === 'literal-target-id' ? { externalId: `0${row.externalId}` } : {}),
        snapshotFormat: variant === 'normalized-other-post' ? 'source-post-v1' : 'moneydigest-v1',
        latestSnapshot: text,
        latestSnapshotHash: createHash('sha256').update(text).digest('hex'),
      },
    })
    const current = await db.importedPost.findUniqueOrThrow({ where: { id: row.id } })
    const before = await boundaryState()
    const providerCalls = vi.mocked(runtime.listPosts).mock.calls.length
    const detail = await request(`/posts/${row.id}`)
    expect(detail.status).toBe(200)
    expect(detail.data.post.snapshotAvailable).toBe(false)
    expect(
      detail.data.capabilities.find((item: { mode: string }) => item.mode === 'REPROCESS_STORED'),
    ).toMatchObject({ allowed: false })
    const response = await request(`/posts/${row.id}/recoveries`, {
      ...body,
      expectedUpdatedAt: current.updatedAt.toISOString(),
    })
    expect(response.status).toBe(412)
    expect(await boundaryState()).toEqual(before)
    expect(vi.mocked(runtime.listPosts).mock.calls).toHaveLength(providerCalls)
  },
)

it('F3 admits exact stored identity even when processed contentHash differs from latestSnapshotHash', async () => {
  const { row } = await boundaryTarget()
  const current = await db.importedPost.update({
    where: { id: row.id },
    data: { contentHash: 'c'.repeat(64) },
  })
  expect(current.contentHash).not.toBe(current.latestSnapshotHash)
  const detail = await request(`/posts/${row.id}`)
  expect(detail.data.post).toMatchObject({
    contentHash: current.contentHash,
    latestSnapshotHash: current.latestSnapshotHash,
    snapshotAvailable: true,
  })
  expect(
    detail.data.capabilities.find((item: { mode: string }) => item.mode === 'REPROCESS_STORED'),
  ).toMatchObject({ allowed: true })
  const calls = vi.mocked(runtime.listPosts).mock.calls.length
  const result = await request(`/posts/${row.id}/recoveries`, {
    expectedUpdatedAt: current.updatedAt.toISOString(),
    expectedContentHash: current.contentHash,
    mode: 'REPROCESS_STORED',
    note: 'Exact latest envelope, different processed hash',
    confirmed: true,
  })
  expect(result.status).toBe(200)
  expect(result.data).toMatchObject({
    postId: row.id,
    status: 'SUCCEEDED',
    targetOutcome: 'RECOVERED',
  })
  expect(vi.mocked(runtime.listPosts).mock.calls).toHaveLength(calls)
})

it('F5 returns legal historical null image provenance without reconstruction or GET/HEAD writes', async () => {
  const { row, body } = await boundaryTarget()
  const result = await request(`/posts/${row.id}/recoveries`, body)
  expect(result.status).toBe(200)
  const citation = await db.dealSource.findFirstOrThrow({ where: { importedPostId: row.id } })
  const image = await db.importedImage.create({
    data: { id: 'e'.repeat(64), mimeType: 'image/png', sizeBytes: 16 },
  })
  const provenance = await db.dealSourceImage.create({
    data: {
      dealSourceId: citation.id,
      imageId: image.id,
      sourceUrl: 'https://www.moneydigest.sg/wp-content/uploads/historical.png',
      finalUrl: null,
    },
  })
  const before = await boundaryState()
  const path = `/drafts/${citation.dealId}/evidence/${citation.id}`
  const response = await request(path)
  expect(response.status).toBe(200)
  expect(response.data).toMatchObject({
    snapshot: citation.sourceContentSnapshot,
    hashVerified: true,
  })
  expect(response.data.images).toEqual([
    expect.objectContaining({ id: provenance.id, sourceUrl: provenance.sourceUrl, finalUrl: null }),
  ])
  const head = await boundaryRequest(path, 'HEAD')
  expect(head.status).toBe(200)
  expect(await head.text()).toBe('')
  expect(await boundaryState()).toEqual(before)
})

it.each(['REQUESTED', 'RUNNING'] as const)(
  'F6 projects abandoned durable %s as interrupted/indeterminate on GET and post detail without DB repair',
  async (status) => {
    const { row } = await boundaryTarget()
    const requestedAt = new Date('2020-01-01T00:00:00.000Z')
    const run = await db.ingestionRun.create({
      data: { sourceId: row.sourceId, startedAt: requestedAt, status: 'RUNNING' },
    })
    const recovery = await db.ingestionRecovery.create({
      data: {
        actorId: admin.id,
        actorName: 'Synthetic abandoned owner',
        postId: row.id,
        sourceId: row.sourceId,
        mode: 'REPROCESS_STORED',
        expectedUpdatedAt: row.updatedAt,
        expectedContentHash: row.contentHash,
        note: 'Synthetic process terminated before bookkeeping',
        status,
        targetOutcome: 'UNKNOWN',
        requestedAt,
        runId: run.id,
      },
    })
    await db.importSource.update({
      where: { id: row.sourceId },
      data: {
        leaseToken: 'expired-abandoned-owner',
        leaseExpiresAt: new Date('2020-01-01T00:02:00.000Z'),
      },
    })
    const before = await boundaryState()
    for (const path of [`/recoveries/${recovery.id}`, `/posts/${row.id}`]) {
      const response = await request(path)
      expect(response.status).toBe(200)
      const projected = path.startsWith('/posts/') ? response.data.latestRecovery : response.data
      expect(projected).toMatchObject({
        id: recovery.id,
        status: 'INTERRUPTED',
        targetOutcome: 'UNKNOWN',
        finishedAt: null,
      })
      const head = await boundaryRequest(path, 'HEAD')
      expect(head.status).toBe(200)
      expect(await head.text()).toBe('')
      expect(await boundaryState()).toEqual(before)
    }
  },
)

it.each(['REQUESTED', 'RUNNING'] as const)(
  'F6 retains a live %s attempt as active and leaves owner/lease/recorded facts untouched',
  async (status) => {
    const { row } = await boundaryTarget()
    const requestedAt = new Date(Math.max(clock.getTime(), Date.now()) + 1_000)
    const recovery = await db.ingestionRecovery.create({
      data: {
        actorId: admin.id,
        actorName: 'Synthetic live owner',
        postId: row.id,
        sourceId: row.sourceId,
        mode: 'REPROCESS_STORED',
        expectedUpdatedAt: row.updatedAt,
        expectedContentHash: row.contentHash,
        note: 'Synthetic still owned attempt',
        status,
        targetOutcome: 'UNKNOWN',
        requestedAt,
        ownerLeaseToken: 'active-recovery-owner',
      },
    })
    await db.importSource.update({
      where: { id: row.sourceId },
      data: {
        leaseToken: 'active-recovery-owner',
        leaseExpiresAt: new Date(requestedAt.getTime() + 120_000),
      },
    })
    const before = await boundaryState()
    for (const path of [`/recoveries/${recovery.id}`, `/posts/${row.id}`]) {
      const response = await request(path)
      expect(response.status).toBe(200)
      const projected = path.startsWith('/posts/') ? response.data.latestRecovery : response.data
      expect(projected).toMatchObject({
        status,
        targetOutcome: 'UNKNOWN',
        finishedAt: null,
      })
      const head = await boundaryRequest(path, 'HEAD')
      expect(head.status).toBe(200)
      expect(await head.text()).toBe('')
      expect(await boundaryState()).toEqual(before)
    }
    await db.importSource.update({
      where: { id: row.sourceId },
      data: { leaseToken: null, leaseExpiresAt: null },
    })
  },
)

it('F6 durably anchors the admitted 90-second budget and projects expiry while the 120-second owner lease is still live', async () => {
  const { row, body } = await boundaryTarget()
  const admittedAt = new Date(clock)
  let release!: () => void
  let entered!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const ready = new Promise<void>((resolve) => {
    entered = resolve
  })
  runtime.sourceRuntime = (definition) => ({
    source: definition,
    reuseApproved: true,
    listPosts: async () => {
      entered()
      await gate
      return { posts: [post(Number(row.externalId))], nextCursor: null }
    },
  })
  const operation = request(`/posts/${row.id}/recoveries`, {
    ...body,
    mode: 'REFRESH_SOURCE_WINDOW',
  })
  try {
    await ready
    const recovery = await db.ingestionRecovery.findFirstOrThrow({ where: { postId: row.id } })
    expect(recovery.requestedAt).toEqual(admittedAt)
    expect(recovery.status).toBe('RUNNING')
    const source = await db.importSource.findUniqueOrThrow({ where: { id: row.sourceId } })
    expect(source.leaseToken).toEqual(expect.any(String))
    expect(recovery.ownerLeaseToken).toBe(source.leaseToken)
    expect(source.leaseExpiresAt).toEqual(new Date(admittedAt.getTime() + 120_000))
    const beforeActiveReads = await boundaryState()
    for (const path of [`/recoveries/${recovery.id}`, `/posts/${row.id}`]) {
      const active = await request(path)
      expect(active.status).toBe(200)
      const projected = path.startsWith('/posts/') ? active.data.latestRecovery : active.data
      expect(projected).toMatchObject({
        id: recovery.id,
        status: 'RUNNING',
        targetOutcome: 'UNKNOWN',
        finishedAt: null,
      })
      expect(projected).not.toHaveProperty('ownerLeaseToken')
      const head = await boundaryRequest(path, 'HEAD')
      expect(head.status).toBe(200)
      expect(await head.text()).toBe('')
    }
    expect(await boundaryState()).toEqual(beforeActiveReads)
    clock = new Date(admittedAt.getTime() + 90_000)
    const before = await boundaryState()
    const expired = await request(`/posts/${row.id}`)
    expect(expired.data.latestRecovery).toMatchObject({
      id: recovery.id,
      status: 'INTERRUPTED',
      targetOutcome: 'UNKNOWN',
      finishedAt: null,
    })
    expect(await boundaryState()).toEqual(before)
    expect(await db.importedPost.findUnique({ where: { id: row.id } })).toEqual(
      expect.objectContaining({
        latestSnapshot: row.latestSnapshot,
        latestSnapshotHash: row.latestSnapshotHash,
      }),
    )
  } finally {
    release()
    delete runtime.sourceRuntime
  }
  const outcome = await operation
  expect(outcome.status).toBe(200)
  expect(outcome.data).toMatchObject({
    status: 'INTERRUPTED',
    targetOutcome: 'UNKNOWN',
    finishedAt: clock.toISOString(),
  })
  const released = await db.importSource.findUniqueOrThrow({ where: { id: row.sourceId } })
  expect(released.leaseToken).toBeNull()
  expect(released.leaseExpiresAt).toBeNull()
})

it.each(['recovery-revoked', 'run-revoked', 'recovery-active'] as const)(
  'QI-1 fences new upload dispatch after actual media-claim commit: %s',
  async (lane) => {
    // Native signup creates a unique real cookie/session; never revoke the shared operator.
    let operator = admin
    if (lane !== 'recovery-active') {
      const signup = await fetch(`${baseURL}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
        body: JSON.stringify({
          name: 'Synthetic QI-1 operator',
          email: `${randomUUID()}@example.test`,
          password: randomBytes(24).toString('base64url'),
        }),
      })
      expect(signup.status).toBe(200)
      const identity = await signup.json()
      const cookie = signup.headers
        .getSetCookie()
        .map((v) => v.split(';')[0])
        .join('; ')
      await db.user.update({ where: { id: identity.user.id }, data: { role: 'ADMIN' } })
      operator = { id: identity.user.id, cookie }
    }
    const cookie = operator.cookie
    const session = await db.session.findFirstOrThrow({ where: { userId: operator.id } })
    const { row, body } = await boundaryTarget()
    const url = `https://www.moneydigest.sg/wp-content/uploads/qi1-${row.externalId}.jpg`
    const bytes = new TextEncoder().encode(`Synthetic QI-1 image ${row.id}`)
    const imageId = createHash('sha256').update(bytes).digest('hex')
    const input = post(Number(row.externalId), `${post().content.rendered}<img src="${url}">`)
    const snapshot = JSON.stringify(input)
    const hash = createHash('sha256').update(snapshot).digest('hex')
    const target = await db.importedPost.update({
      where: { id: row.id },
      data: { latestSnapshot: snapshot, latestSnapshotHash: hash, contentHash: hash },
    })
    const originalRuntime = { ...runtime }
    runtime.fetchImage = vi.fn(async () => ({
      bytes,
      byteLength: bytes.length,
      mimeType: 'image/jpeg',
      sha256: imageId,
      url,
      finalUrl: url,
    }))
    runtime.listPosts = vi.fn(async () => [input])
    const uploads: { sessionPresent: boolean; customId: string }[] = []
    const upload = vi.fn(async (_image, customId: string) => {
      uploads.push({
        sessionPresent: !!(await db.session.findUnique({ where: { id: session.id } })),
        customId,
      })
      return { key: `qi1-${imageId}`, url: `https://utfs.io/f/qi1-${imageId}` }
    })
    const resolveImage = vi.fn(async () => null)
    runtime.imageStorage = { upload, resolve: resolveImage }
    let arrive!: () => void
    let release!: () => void
    const committed = new Promise<void>((resolve) => {
      arrive = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const transact = db.$transaction.bind(db)
    const observer = vi.spyOn(db, '$transaction').mockImplementation((operation, options) =>
      (async () => {
        let claimed = false
        const result = await transact(
          async (tx) =>
            operation(
              new Proxy(tx, {
                get(target, key, receiver) {
                  if (key !== 'importedImage') return Reflect.get(target, key, receiver)
                  return new Proxy(target.importedImage, {
                    get(delegate, method, delegateReceiver) {
                      const original: unknown = Reflect.get(delegate, method, delegateReceiver)
                      if (method !== 'updateMany')
                        return typeof original === 'function' ? original.bind(delegate) : original
                      return async (args: Parameters<typeof delegate.updateMany>[0]) => {
                        const value = await delegate.updateMany(args)
                        if (
                          args.where?.id === imageId &&
                          args.where.status === 'DOWNLOADED_ONLY' &&
                          args.data.status === 'UPLOADING' &&
                          value.count === 1
                        )
                          claimed = true
                        return value
                      }
                    },
                  })
                },
              }),
            ),
          options,
        )
        // Crucial: await the real transaction's COMMIT, not an in-transaction query.
        // Withhold only its reply; there is no open DB transaction across this gate.
        if (claimed) {
          arrive()
          await gate
        }
        return result
      })(),
    )
    const protectedState = async () => {
      const state = await boundaryState()
      return state.filter(({ collection }) =>
        [
          'ImportedPost',
          'Deal',
          'DealSource',
          'ImportedImage',
          'DealSourceImage',
          'PromotionIdentity',
        ].includes(collection),
      )
    }
    const sourceFacts = () =>
      db.importSource.findUniqueOrThrow({
        where: { id: row.sourceId },
        select: { provider: true, externalId: true, url: true, enabled: true, cursor: true },
      })
    const initialSource = await sourceFacts()
    const priorCitations = await db.dealSource.findMany({ orderBy: { id: 'asc' } })
    const operation =
      lane === 'run-revoked'
        ? fetch(`${baseURL}/api/ingestion/runs`, {
            method: 'POST',
            headers: { Cookie: cookie, Origin: 'http://localhost:5173' },
          }).then(async (r) => ({ status: r.status, data: await r.json() }))
        : request(
            `/posts/${row.id}/recoveries`,
            {
              ...body,
              expectedUpdatedAt: target.updatedAt.toISOString(),
              expectedContentHash: hash,
            },
            cookie,
          )
    try {
      await Promise.race([
        committed,
        operation.then(() => {
          throw new Error('Media claim was not reached')
        }),
      ])
      const claim = await db.importedImage.findUniqueOrThrow({ where: { id: imageId } })
      expect(claim).toMatchObject({ status: 'UPLOADING', storageKey: null, hostedUrl: null })
      expect(claim.uploadToken).toEqual(expect.any(String))
      expect(upload).not.toHaveBeenCalled()
      expect(resolveImage).not.toHaveBeenCalled()
      if (lane !== 'recovery-active') {
        await db.session.delete({ where: { id: session.id } })
        expect(await db.session.findUnique({ where: { id: session.id } })).toBeNull()
      }
      const beforeResume = await protectedState()
      release()
      const result = await operation
      expect(result.status).toBe(200)
      const persistedImage = await db.importedImage.findUniqueOrThrow({ where: { id: imageId } })
      const persistedPost = await db.importedPost.findUniqueOrThrow({ where: { id: row.id } })
      const after = await protectedState()
      const run = await db.ingestionRun.findUniqueOrThrow({ where: { id: result.data.runId } })
      const receipt = {
        lane,
        actualClaimCommitted: claim.status,
        revokedBeforeResume: lane !== 'recovery-active',
        uploads,
        resolves: resolveImage.mock.calls.length,
        result: result.data,
        imageStatus: persistedImage.status,
        processedContentHash: persistedPost.processedContentHash,
        protectedBefore: createHash('sha256').update(JSON.stringify(beforeResume)).digest('hex'),
        protectedAfter: createHash('sha256').update(JSON.stringify(after)).digest('hex'),
        runStatus: run.status,
        runError: run.errorCode,
      }
      await writeFile(resolve(evidence, `qi1-${lane}.json`), JSON.stringify(receipt, null, 2))
      console.log('QI1_MEDIA_CLAIM_RECEIPT', JSON.stringify(receipt))
      expect(await sourceFacts()).toEqual(initialSource)
      expect(
        (await db.importSource.findUniqueOrThrow({ where: { id: row.sourceId } })).leaseToken,
      ).toBeNull()
      expect(resolveImage).not.toHaveBeenCalled()
      expect(
        await db.dealSource.findMany({
          where: { id: { in: priorCitations.map((c) => c.id) } },
          orderBy: { id: 'asc' },
        }),
      ).toEqual(priorCitations)
      if (lane === 'recovery-active') {
        expect(uploads).toEqual([
          { sessionPresent: true, customId: `lobangers-image-v1-${imageId}` },
        ])
        expect(result.data).toMatchObject({ status: 'SUCCEEDED', targetOutcome: 'RECOVERED' })
        expect(persistedImage).toMatchObject({
          status: 'HOSTED',
          storageKey: `qi1-${imageId}`,
          hostedUrl: `https://utfs.io/f/qi1-${imageId}`,
        })
        expect(persistedPost.processedContentHash).toBe(hash)
        const citation = await db.dealSource.findFirstOrThrow({ where: { importedPostId: row.id } })
        expect(citation).toMatchObject({ sourceContentHash: hash, sourceContentSnapshot: snapshot })
        expect(await db.dealSourceImage.findMany({ where: { dealSourceId: citation.id } })).toEqual(
          [expect.objectContaining({ imageId, sourceUrl: url, finalUrl: url })],
        )
        expect(run.status).toBe('SUCCEEDED')
      } else {
        expect(after).toEqual(beforeResume)
        expect(persistedImage).toEqual(claim)
        expect(persistedPost.processedContentHash).toBeNull()
        expect(run).toMatchObject({
          status: 'FAILED',
          errorCode: lane === 'run-revoked' ? 'INGESTION_FAILED' : 'UNAUTHORIZED',
        })
        expect(await db.dealSource.count({ where: { importedPostId: row.id } })).toBe(0)
        expect((await request(`/posts/${row.id}`, undefined, cookie)).status).toBe(401)
        if (lane === 'recovery-revoked') {
          expect(result.data).toMatchObject({
            status: 'INTERRUPTED',
            targetOutcome: 'UNKNOWN',
            errorCode: 'UNAUTHORIZED',
          })
        }
        // Last assertion makes the exact safety RED visible after local-denial checks.
        expect(
          uploads,
          'No NEW upload may start after the native session deletion commits',
        ).toEqual([])
      }
      if (lane !== 'run-revoked') {
        expect(await db.platformAudit.count({ where: { subjectId: result.data.id } })).toBe(2)
        expect(
          await db.ingestionRecovery.findUnique({ where: { id: result.data.id } }),
        ).toMatchObject({
          status: result.data.status,
          targetOutcome: result.data.targetOutcome,
          errorCode: result.data.errorCode,
        })
      }
    } finally {
      release()
      await operation
      observer.mockRestore()
      Object.assign(runtime, originalRuntime)
      if (!originalRuntime.fetchImage) delete runtime.fetchImage
      if (!originalRuntime.imageStorage) delete runtime.imageStorage
      if (lane !== 'recovery-active') await db.session.deleteMany({ where: { id: session.id } })
    }
  },
)
