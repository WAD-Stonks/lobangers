import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { parseConfig } from '@api/config'
import type { IngestionRuntime } from '@api/modules/ingestion/runtime'
import { MONEYDIGEST_SOURCE } from '@api/modules/ingestion/source'
import { pushDisposableSchema } from '@api-tests/fixtures/disposable-schema'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

let mongo: MongoMemoryReplSet
let db: typeof import('@broke-oclock/db').db
let server: Server
let baseURL = ''
let databaseUrl = ''
let clock = new Date()
const origin = 'http://localhost:5173'
const cronSecret = randomBytes(32).toString('hex')
const post = (id: number, image = false) => ({
  id,
  link: `https://www.moneydigest.sg/controlled-${id}/`,
  date: '2026-10-01T12:00:00',
  title: { rendered: 'Controlled pizza' },
  content: {
    rendered: `Singapore pizza 50% off. Online only. No membership required. Valid from 1 October 2026 until 31 December 2026.${image ? '<img src="https://www.moneydigest.sg/wp-content/uploads/controlled.jpg">' : ''}`,
  },
  excerpt: { rendered: '' },
})
const runtime: IngestionRuntime = {
  enabled: true,
  reuseApproved: true,
  now: () => clock,
  listPosts: async () => [],
}
const barrier = () => {
  let arrive!: () => void
  let release!: () => void
  const waiting = new Promise<void>((r) => {
    arrive = r
  })
  const gate = new Promise<void>((r) => {
    release = r
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
const cookieOf = (r: Response) =>
  r.headers
    .getSetCookie()
    .map((v) => v.split(';')[0])
    .join('; ')
let authIp = 1
const authRequest = (path: string, body: object, cookie = '') =>
  fetch(`${baseURL}/api/auth${path}`, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      Cookie: cookie,
      'X-Forwarded-For': `198.51.100.${authIp++}`,
    },
    body: JSON.stringify(body),
  })
const identity = async () => {
  const email = `${randomUUID()}@example.test`
  const password = randomBytes(24).toString('base64url')
  const signup = await authRequest('/sign-up/email', {
    name: 'Controlled operator',
    email,
    password,
  })
  expect(signup.status).toBe(200)
  const user = await db.user.findUniqueOrThrow({ where: { email } })
  await db.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } })
  await authRequest('/sign-out', {}, cookieOf(signup))
  const signin = await authRequest('/sign-in/email', { email, password })
  expect(signin.status).toBe(200)
  const session = await db.session.findFirstOrThrow({ where: { userId: user.id } })
  return { userId: user.id, sessionId: session.id, cookie: cookieOf(signin) }
}
const manual = (cookie: string) =>
  fetch(`${baseURL}/api/ingestion/runs`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: origin },
  })
const resetSource = async () => {
  clock = new Date(clock.getTime() + 31_000)
  return db.importSource.upsert({
    where: {
      provider_externalId: {
        provider: MONEYDIGEST_SOURCE.provider,
        externalId: MONEYDIGEST_SOURCE.externalId,
      },
    },
    create: { ...MONEYDIGEST_SOURCE, enabled: true, cursor: '7' },
    update: { enabled: true, cursor: '7' },
  })
}
beforeAll(async () => {
  if (process.env.DATABASE_URL) throw new Error('Refusing ambient DATABASE_URL')
  await mkdir(resolve(tmpdir(), 'lobangers-controlled-commit'), { recursive: true })
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const url = mongo.getUri(`controlled_${randomUUID().replaceAll('-', '')}`)
  databaseUrl = url
  await pushDisposableSchema(url)
  vi.stubEnv('DATABASE_URL', url)
  vi.stubEnv('NODE_ENV', 'test')
  db = (await import('@broke-oclock/db')).db
  server = createServer()
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing listener')
  baseURL = `http://127.0.0.1:${address.port}`
  const config = parseConfig({
    DATABASE_URL: url,
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    BETTER_AUTH_URL: baseURL,
    WEB_ORIGIN: origin,
    INGESTION_ENABLED: 'true',
    MONEYDIGEST_REUSE_APPROVED: 'true',
    CRON_SECRET: cronSecret,
  })
  const { createApp } = await import('@api/app')
  server.on('request', createApp(config, { ingestion: runtime }))
}, 180_000)
afterAll(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((r) => server.close(() => r()))
  await db?.$disconnect()
  await mongo?.stop()
  expect(server.listening).toBe(false)
  expect(mongo.state).toBe('stopped')
  vi.unstubAllEnvs()
})
for (const [index, change] of ['revoke', 'suspend', 'demote'].entries()) {
  it(`denies protected commits when native actor loses access (${change}) during provider promise`, async () => {
    const actor = await identity()
    const source = await resetSource()
    const paused = barrier()
    const input = post(1000 + index, true)
    runtime.sources = [
      {
        source: { kind: 'moneydigest', ...MONEYDIGEST_SOURCE },
        reuseApproved: true,
        listPosts: async () => {
          await paused.pause()
          return { posts: [input], nextCursor: '8' }
        },
      },
    ]
    runtime.fetchImage = vi.fn(async () => {
      throw new Error('Must not reach media')
    })
    const pending = manual(actor.cookie)
    await paused.waiting
    if (change === 'revoke') await db.session.delete({ where: { id: actor.sessionId } })
    if (change === 'suspend')
      await db.user.update({
        where: { id: actor.userId },
        data: { suspendedAt: new Date(), authVersion: { increment: 1 } },
      })
    if (change === 'demote')
      await db.user.update({
        where: { id: actor.userId },
        data: { role: 'USER', platformVersion: { increment: 1 } },
      })
    paused.release()
    const response = await pending
    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result.status).toBe('FAILED')
    expect(
      await db.importedPost.count({ where: { sourceId: source.id, externalId: String(input.id) } }),
    ).toBe(0)
    expect(runtime.fetchImage).not.toHaveBeenCalled()
    const fresh = await db.importSource.findUniqueOrThrow({ where: { id: source.id } })
    expect(fresh.cursor).toBe('7')
    expect(fresh.leaseToken).toBeNull()
    expect(await db.ingestionRun.findUniqueOrThrow({ where: { id: result.runId } })).toMatchObject({
      status: 'FAILED',
    })
  })
}
const fetchedImage = (seed: string) => {
  const bytes = new TextEncoder().encode(seed)
  return {
    bytes,
    byteLength: bytes.length,
    mimeType: 'image/jpeg',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    url: 'https://www.moneydigest.sg/wp-content/uploads/controlled.jpg',
    finalUrl: 'https://www.moneydigest.sg/wp-content/uploads/controlled.jpg',
  }
}
for (const [index, stage] of ['download', 'upload', 'resolve'].entries()) {
  it(`does not commit local media or posts after revocation during ${stage}`, async () => {
    const actor = await identity()
    const source = await resetSource()
    const input = post(1200 + index, true)
    const image = fetchedImage(`actor-${stage}`)
    if (stage === 'resolve')
      await db.importedImage.create({
        data: {
          id: image.sha256,
          status: 'UNKNOWN',
          uploadToken: null,
          sizeBytes: image.byteLength,
          mimeType: image.mimeType,
        },
      })
    const paused = barrier()
    runtime.sources = [
      {
        source: { kind: 'moneydigest', ...MONEYDIGEST_SOURCE },
        reuseApproved: true,
        listPosts: async () => ({ posts: [input], nextCursor: '8' }),
      },
    ]
    runtime.fetchImage = async () => {
      if (stage === 'download') await paused.pause()
      return image
    }
    runtime.imageStorage = {
      upload: async () => {
        if (stage === 'upload') await paused.pause()
        return { key: 'controlled-key', url: 'https://utfs.io/f/controlled' }
      },
      resolve: async () => {
        if (stage === 'resolve') await paused.pause()
        return { key: 'controlled-key', url: 'https://utfs.io/f/controlled' }
      },
    }
    const pending = manual(actor.cookie)
    await paused.waiting
    const importedBefore = await db.importedPost.findUniqueOrThrow({
      where: { sourceId_externalId: { sourceId: source.id, externalId: String(input.id) } },
    })
    const imageBefore = await db.importedImage.findUnique({ where: { id: image.sha256 } })
    await db.session.delete({ where: { id: actor.sessionId } })
    paused.release()
    const response = await pending
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'FAILED', createdCount: 0 })
    expect(await db.importedImage.findUnique({ where: { id: image.sha256 } })).toEqual(imageBefore)
    expect(await db.importedPost.findUniqueOrThrow({ where: { id: importedBefore.id } })).toEqual(
      importedBefore,
    )
    expect(await db.dealSource.count({ where: { importedPostId: importedBefore.id } })).toBe(0)
    expect((await db.importSource.findUniqueOrThrow({ where: { id: source.id } })).cursor).toBe('7')
    delete runtime.imageStorage
  })
}
for (const [providerIndex, kind] of ['moneydigest', 'scoobify'].entries()) {
  for (const stage of ['MEDIA', 'PARSE']) {
    it(`captures original registered ${kind} transport object before ${stage} failure`, async () => {
      const { createIngestionRuntime } = await import('@api/modules/ingestion/runtime')
      const { SCOOBIFY_SOURCE } = await import('@api/modules/ingestion/source')
      const { readEnvelope, captureEnvelope } = await import('@api/modules/ingestion/snapshot')
      const actor = await identity()
      await resetSource()
      await db.importSource.updateMany({ data: { enabled: false } })
      const definition = kind === 'moneydigest' ? MONEYDIGEST_SOURCE : SCOOBIFY_SOURCE
      const source = await db.importSource.upsert({
        where: {
          provider_externalId: { provider: definition.provider, externalId: definition.externalId },
        },
        create: { ...definition, enabled: true },
        update: { enabled: true, cursor: null },
      })
      const id = 2000 + providerIndex * 10 + (stage === 'MEDIA' ? 1 : 2)
      const original = {
        ...post(id, stage === 'MEDIA'),
        link: `${definition.url}controlled-${id}/`,
        date_gmt: '2026-10-01T12:00:00',
        modified_gmt: '2026-10-02T12:00:00',
        title: {
          rendered: stage === 'PARSE' ? 'x'.repeat(2001) : 'Controlled pizza',
          providerTitleFlag: 'exact',
        },
        content: {
          rendered: post(id, stage === 'MEDIA').content.rendered.replaceAll(
            'https://www.moneydigest.sg/wp-content/uploads/',
            kind === 'scoobify'
              ? 'https://scoobifydaily.files.wordpress.com/2026/10/'
              : 'https://www.moneydigest.sg/wp-content/uploads/',
          ),
          protected: false,
        },
        extraProviderField: {
          nested: [true, { exact: '漢字', whitespace: '  retained  ' }],
          nullable: null,
        },
      }
      const providerFetch = vi.fn<typeof fetch>(async () => Response.json([original]))
      const transport = createIngestionRuntime(
        parseConfig({
          DATABASE_URL: databaseUrl,
          BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
          BETTER_AUTH_URL: baseURL,
          WEB_ORIGIN: origin,
          INGESTION_ENABLED: 'true',
          MONEYDIGEST_REUSE_APPROVED: 'true',
          SCOOBIFY_REUSE_APPROVED: 'true',
        }),
        { fetch: providerFetch },
      )
      runtime.sourceRuntime = transport.sourceRuntime
      delete runtime.sources
      runtime.fetchImage = async () => {
        throw new Error('Controlled media failure')
      }
      const result = await manual(actor.cookie)
      expect(result.status).toBe(200)
      expect(await result.json()).toMatchObject({ status: 'FAILED' })
      expect(providerFetch).toHaveBeenCalledTimes(1)
      const row = await db.importedPost.findUniqueOrThrow({
        where: { sourceId_externalId: { sourceId: source.id, externalId: String(id) } },
      })
      expect(row.failureStage).toBe(stage)
      expect(typeof row.latestSnapshot).toBe('string')
      const stored = JSON.parse(String(row.latestSnapshot))
      const originalSnapshot = stored
      expect(originalSnapshot).toEqual(original)
      expect(row.latestSnapshotHash).toBe(
        createHash('sha256').update(String(row.latestSnapshot)).digest('hex'),
      )
      const restored = readEnvelope(row, { kind, ...definition } as Parameters<
        typeof readEnvelope
      >[1])
      expect(restored).not.toBeNull()
      expect(
        captureEnvelope(restored, { kind, ...definition } as Parameters<typeof readEnvelope>[1]),
      ).toMatchObject({
        latestSnapshot: row.latestSnapshot,
        latestSnapshotHash: row.latestSnapshotHash,
      })
      delete runtime.sourceRuntime
    })
  }
}
for (const [policyIndex, policy] of ['approved', 'hidden', 'rejected'].entries()) {
  for (const stage of ['MEDIA', 'PERSIST']) {
    it(`preserves SOURCE_CHANGED and last-success hash on ${stage} failure for ${policy} canonical`, async () => {
      const actor = await identity()
      const source = await resetSource()
      delete runtime.sourceRuntime
      const id = 3000 + policyIndex * 10 + (stage === 'MEDIA' ? 1 : 2)
      const original = post(id)
      original.title.rendered = `Original protected ${id}`
      const snapshot = JSON.stringify(original)
      const hash = createHash('sha256').update(snapshot).digest('hex')
      const processedAt = new Date('2026-10-01T12:00:00Z')
      const imported = await db.importedPost.create({
        data: {
          sourceId: source.id,
          externalId: String(id),
          url: original.link,
          rawContent: original.content.rendered,
          contentHash: hash,
          processedContentHash: hash,
          processedAt,
          status: 'NEEDS_REVIEW',
          errorCode: 'SOURCE_CHANGED',
        },
      })
      const deal = await db.deal.create({
        data: {
          title: original.title.rendered,
          description: 'Protected immutable canonical',
          category: 'other',
          origin: 'IMPORTED',
          reviewStatus: policy === 'rejected' ? 'REJECTED' : 'APPROVED',
          deletedAt: policy === 'hidden' ? new Date('2026-10-01') : null,
          contentVersion: 4,
          operationVersion: 8,
          offerType: 'PERCENT_OFF',
          discountPercent: 50,
          applicability: 'ONLINE',
        },
      })
      const citation = await db.dealSource.create({
        data: {
          dealId: deal.id,
          importedPostId: imported.id,
          sourceContentHash: hash,
          sourceContentSnapshot: snapshot,
          sourceUrl: original.link,
        },
      })
      const changed = post(id, stage === 'MEDIA')
      changed.title.rendered = `Changed protected ${id}`
      if (stage === 'PERSIST') {
        const { promotionIdentity } = await import('@api/modules/ingestion/promotion-identity')
        const { parseSourcePost } = await import('@api/modules/ingestion/source-post')
        const identity = promotionIdentity(
          parseSourcePost(changed, { kind: 'moneydigest', ...MONEYDIGEST_SOURCE }),
        )
        expect(identity).not.toBeNull()
        if (!identity) throw new Error('Missing canonical fixture identity')
        const trap = await db.deal.create({
          data: {
            title: 'Unavailable canonical',
            description: 'Controlled persistence failure',
            applicability: 'ONLINE',
            offerType: 'PERCENT_OFF',
            discountPercent: 50,
            category: 'other',
            origin: 'IMPORTED',
            reviewStatus: 'REJECTED',
            deletedAt: new Date(),
          },
        })
        await db.promotionIdentity.create({ data: { id: identity, dealId: trap.id } })
      }
      runtime.sources = [
        {
          source: { kind: 'moneydigest', ...MONEYDIGEST_SOURCE },
          reuseApproved: true,
          listPosts: async () => ({ posts: [changed], nextCursor: '8' }),
        },
      ]
      runtime.fetchImage = async () => {
        throw new Error('Controlled media failure')
      }
      delete runtime.imageStorage
      const response = await manual(actor.cookie)
      expect(response.status).toBe(200)
      const result = await response.json()
      expect(result).toMatchObject({ status: 'FAILED' })
      const failed = await db.importedPost.findUniqueOrThrow({ where: { id: imported.id } })
      expect(failed).toMatchObject({
        status: 'FAILED',
        errorCode: 'SOURCE_CHANGED',
        failureStage: stage,
        processedContentHash: hash,
        processedAt,
        contentHash: hash,
        lastRunId: result.runId,
        latestSnapshot: JSON.stringify(changed),
      })
      expect(await db.deal.findUniqueOrThrow({ where: { id: deal.id } })).toEqual(deal)
      expect(await db.dealSource.findUniqueOrThrow({ where: { id: citation.id } })).toEqual(
        citation,
      )
      expect(
        await db.ingestionRun.findUniqueOrThrow({ where: { id: result.runId } }),
      ).toMatchObject({
        status: 'FAILED',
        errorCode: stage === 'MEDIA' ? 'INGESTION_FAILED' : 'CONFLICT',
      })
    })
  }
}
for (const [index, mutation] of ['disable', 'replace-owner', 'expire'].entries()) {
  it(`retains source CAS fencing when ${mutation} occurs during the provider promise`, async () => {
    const actor = await identity()
    const source = await resetSource()
    const paused = barrier()
    const input = post(4000 + index, true)
    const replacement = randomUUID()
    runtime.sources = [
      {
        source: { kind: 'moneydigest', ...MONEYDIGEST_SOURCE },
        reuseApproved: true,
        listPosts: async () => {
          await paused.pause()
          return { posts: [input], nextCursor: '8' }
        },
      },
    ]
    runtime.fetchImage = vi.fn(async () => {
      throw new Error('Unexpected media')
    })
    const pending = manual(actor.cookie)
    await paused.waiting
    await db.importSource.update({
      where: { id: source.id },
      data:
        mutation === 'disable'
          ? { enabled: false }
          : mutation === 'replace-owner'
            ? { leaseToken: replacement }
            : { leaseExpiresAt: new Date(clock.getTime() - 1) },
    })
    paused.release()
    const response = await pending
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'FAILED', createdCount: 0 })
    expect(
      await db.importedPost.count({ where: { sourceId: source.id, externalId: String(input.id) } }),
    ).toBe(0)
    expect(runtime.fetchImage).not.toHaveBeenCalled()
    const fresh = await db.importSource.findUniqueOrThrow({ where: { id: source.id } })
    expect(fresh.cursor).toBe('7')
    expect(fresh.leaseToken).toBe(mutation === 'replace-owner' ? replacement : null)
    if (mutation === 'replace-owner')
      await db.importSource.update({
        where: { id: source.id },
        data: { leaseToken: null, leaseExpiresAt: null },
      })
  })
}
it('fences post persistence after capture when a native session is revoked before the local commit', async () => {
  const actor = await identity()
  const source = await resetSource()
  await db.importSource.update({ where: { id: source.id }, data: { cursor: null } })
  const input = post(4100)
  const paused = barrier()
  runtime.sources = [
    {
      source: { kind: 'moneydigest', ...MONEYDIGEST_SOURCE },
      reuseApproved: true,
      listPosts: async () => ({ posts: [input], nextCursor: '8' }),
    },
  ]
  delete runtime.fetchImage
  delete runtime.imageStorage
  const find = db.importedPost.findUnique.bind(db.importedPost)
  const observer = vi.spyOn(db.importedPost, 'findUnique').mockImplementation((...args) => {
    const query = find(...args)
    return new Proxy(query, {
      get(target, key, receiver) {
        if (key === 'then')
          return (...callbacks: Parameters<typeof query.then>) =>
            query
              .then(async (value) => {
                if (args[0].where.sourceId_externalId?.externalId === String(input.id))
                  await paused.pause()
                return value
              })
              .then(...callbacks)
        const value: unknown = Reflect.get(target, key, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  })
  const pending = manual(actor.cookie)
  try {
    await paused.waiting
    const before = await db.importedPost.findFirstOrThrow({
      where: { sourceId: source.id, externalId: String(input.id) },
    })
    await db.session.delete({ where: { id: actor.sessionId } })
    paused.release()
    expect(await (await pending).json()).toMatchObject({ status: 'FAILED', createdCount: 0 })
    expect(await db.importedPost.findFirstOrThrow({ where: { id: before.id } })).toEqual(before)
    expect(await db.dealSource.count({ where: { importedPostId: before.id } })).toBe(0)
    expect(
      (await db.importSource.findUniqueOrThrow({ where: { id: source.id } })).cursor,
    ).toBeNull()
  } finally {
    paused.release()
    observer.mockRestore()
  }
})
it('fences an empty-page cursor commit after native actor revocation', async () => {
  const actor = await identity()
  const source = await resetSource()
  await db.importSource.update({ where: { id: source.id }, data: { cursor: null } })
  const paused = barrier()
  runtime.sources = [
    {
      source: { kind: 'moneydigest', ...MONEYDIGEST_SOURCE },
      reuseApproved: true,
      listPosts: async () => {
        await paused.pause()
        return { posts: [], nextCursor: '8' }
      },
    },
  ]
  const pending = manual(actor.cookie)
  await paused.waiting
  await db.session.delete({ where: { id: actor.sessionId } })
  paused.release()
  expect(await (await pending).json()).toMatchObject({ status: 'FAILED' })
  expect((await db.importSource.findUniqueOrThrow({ where: { id: source.id } })).cursor).toBeNull()
})
it('carries the native actor through the legacy single-source runtime branch', async () => {
  const actor = await identity()
  const source = await resetSource()
  const paused = barrier()
  const input = post(4200)
  delete runtime.sources
  delete runtime.sourceRuntime
  runtime.listPosts = async () => {
    await paused.pause()
    return [input]
  }
  const pending = manual(actor.cookie)
  await paused.waiting
  await db.session.delete({ where: { id: actor.sessionId } })
  paused.release()
  expect(await (await pending).json()).toMatchObject({ status: 'FAILED', createdCount: 0 })
  expect(
    await db.importedPost.count({ where: { sourceId: source.id, externalId: String(input.id) } }),
  ).toBe(0)
  expect(
    (await db.importSource.findUniqueOrThrow({ where: { id: source.id } })).leaseToken,
  ).toBeNull()
})
it('rejects a revoked session at transactional admission without creating a source run', async () => {
  const actor = await identity()
  await resetSource()
  const sourceBefore = await db.importSource.findFirstOrThrow({
    where: { externalId: MONEYDIGEST_SOURCE.externalId },
  })
  const runsBefore = await db.ingestionRun.count()
  await db.session.delete({ where: { id: actor.sessionId } })
  const { acquireLease } = await import('@api/modules/ingestion/service')
  await expect(
    acquireLease(db, clock, { kind: 'moneydigest', ...MONEYDIGEST_SOURCE }, actor),
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  expect(await db.ingestionRun.count()).toBe(runsBefore)
  expect(await db.importSource.findUniqueOrThrow({ where: { id: sourceBefore.id } })).toEqual(
    sourceBefore,
  )
})
it('reports bounded manual admission contention as CONFLICT without a provider request', async () => {
  const actor = await identity()
  await resetSource()
  const paused = barrier()
  delete runtime.sources
  const list = vi.fn(async () => [])
  runtime.listPosts = list
  const held = db.$transaction(async (tx) => {
    const { fencePlatformAccess } = await import('@api/modules/platform-admin/transaction')
    await fencePlatformAccess(tx)
    await paused.pause()
  })
  try {
    await paused.waiting
    const response = await manual(actor.cookie)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: { code: 'CONFLICT' } })
    expect(list).not.toHaveBeenCalled()
  } finally {
    paused.release()
    await held
  }
})
it('scheduled bearer path remains actorless and commits successful canonical evidence and cursor', async () => {
  const source = await resetSource()
  const input = post(1100, true)
  const image = fetchedImage('scheduled-positive')
  const upload = vi.fn(async () => ({
    key: 'scheduled-key',
    url: 'https://utfs.io/f/scheduled-controlled',
  }))
  runtime.imageStorage = { upload, resolve: async () => null }
  runtime.fetchImage = async () => image
  runtime.sources = [
    {
      source: { kind: 'moneydigest', ...MONEYDIGEST_SOURCE },
      reuseApproved: true,
      listPosts: async () => ({ posts: [input], nextCursor: '9' }),
    },
  ]
  const denied = await fetch(`${baseURL}/api/ingestion/scheduled-runs`)
  expect(denied.status).toBe(401)
  const response = await fetch(`${baseURL}/api/ingestion/scheduled-runs`, {
    headers: { Authorization: `Bearer ${cronSecret}` },
  })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ status: 'SUCCEEDED', createdCount: 1 })
  const imported = await db.importedPost.findUniqueOrThrow({
    where: { sourceId_externalId: { sourceId: source.id, externalId: '1100' } },
    include: { deals: true },
  })
  expect(imported.deals).toHaveLength(1)
  expect(upload).toHaveBeenCalledTimes(1)
  expect(await db.importedImage.findUniqueOrThrow({ where: { id: image.sha256 } })).toMatchObject({
    status: 'HOSTED',
  })
  expect(imported.latestSnapshotHash).toBe(
    createHash('sha256').update(JSON.stringify(input)).digest('hex'),
  )
  expect((await db.importSource.findUniqueOrThrow({ where: { id: source.id } })).cursor).toBe('9')
})

it('reports complete citation evidence for a successful actual registered Scoobify original', async () => {
  const { createIngestionRuntime } = await import('@api/modules/ingestion/runtime')
  const { SCOOBIFY_SOURCE } = await import('@api/modules/ingestion/source')
  const actor = await identity()
  const original = {
    ...post(5100),
    link: `${SCOOBIFY_SOURCE.url}controlled-evidence/`,
    extraProviderField: { nested: [false, 'original'] },
    date_gmt: '2026-10-01T12:00:00',
    modified_gmt: null,
  }
  await resetSource()
  await db.importSource.updateMany({ data: { enabled: false } })
  const source = await db.importSource.upsert({
    where: {
      provider_externalId: {
        provider: SCOOBIFY_SOURCE.provider,
        externalId: SCOOBIFY_SOURCE.externalId,
      },
    },
    create: { ...SCOOBIFY_SOURCE, enabled: true },
    update: { enabled: true, cursor: null },
  })
  const transport = createIngestionRuntime(
    parseConfig({
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
      BETTER_AUTH_URL: baseURL,
      WEB_ORIGIN: origin,
      INGESTION_ENABLED: 'true',
      SCOOBIFY_REUSE_APPROVED: 'true',
    }),
    { fetch: async () => Response.json([original]) },
  )
  runtime.sourceRuntime = transport.sourceRuntime
  delete runtime.sources
  try {
    const response = await manual(actor.cookie)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'SUCCEEDED', createdCount: 1 })
    const imported = await db.importedPost.findUniqueOrThrow({
      where: { sourceId_externalId: { sourceId: source.id, externalId: '5100' } },
      include: { deals: true },
    })
    const text = JSON.stringify(original)
    const hash = createHash('sha256').update(text).digest('hex')
    expect(imported.latestSnapshot).toBe(text)
    expect(imported.latestSnapshotHash).toBe(hash)
    expect(imported.deals).toHaveLength(1)
    const citation = imported.deals[0]
    if (!citation) throw new Error('Missing canonical citation')
    expect(citation.sourceContentSnapshot).toBe(text)
    expect(citation.sourceContentHash).toBe(hash)
    const detail = () =>
      fetch(`${baseURL}/api/ingestion/drafts/${citation.dealId}/evidence/${citation.id}`, {
        headers: { Cookie: actor.cookie },
      })
    const evidence = await detail()
    expect(evidence.status).toBe(200)
    expect(await evidence.json()).toMatchObject({
      availability: 'COMPLETE',
      format: 'source-post-v1',
      snapshot: text,
      hashVerified: true,
      parseError: null,
      citation: { pinnedHash: hash },
      parsed: { status: 'NEEDS_REVIEW' },
    })
    expect(await db.dealSource.findUniqueOrThrow({ where: { id: citation.id } })).toEqual(citation)
  } finally {
    delete runtime.sourceRuntime
  }
})

it.each([
  'moneydigest-original',
  'moneydigest-absent-excerpt',
  'scoobify-normalized',
  'mismatched-pin',
  'unknown-format',
] as const)('preserves pinned citation bytes and integrity for %s', async (variant) => {
  const { SCOOBIFY_SOURCE } = await import('@api/modules/ingestion/source')
  const definition = variant.startsWith('moneydigest') ? MONEYDIGEST_SOURCE : SCOOBIFY_SOURCE
  const actor = await identity()
  const source = await db.importSource.upsert({
    where: {
      provider_externalId: { provider: definition.provider, externalId: definition.externalId },
    },
    create: { ...definition, enabled: false },
    update: {},
  })
  const original = { ...post(5200), link: `${definition.url}pinned-original/` }
  const { excerpt: _excerpt, ...withoutExcerpt } = original
  const normalized = {
    externalId: '5200',
    url: original.link,
    publishedAt: original.date,
    sourceUpdatedAt: null,
    title: original.title.rendered,
    contentHtml: original.content.rendered,
    excerptHtml: '',
    images: [],
  }
  const input =
    variant === 'moneydigest-absent-excerpt'
      ? withoutExcerpt
      : variant === 'scoobify-normalized'
        ? normalized
        : variant === 'unknown-format'
          ? { unrecognized: true }
          : original
  // Deliberate JSON whitespace is part of the citation, never parser-reencoded.
  const text = JSON.stringify(input, null, 2)
  const actualHash = createHash('sha256').update(text).digest('hex')
  const pinnedHash = variant === 'mismatched-pin' ? 'a'.repeat(64) : actualHash
  const imported = await db.importedPost.create({
    data: {
      sourceId: source.id,
      externalId: `52${['moneydigest-original', 'moneydigest-absent-excerpt', 'scoobify-normalized', 'mismatched-pin', 'unknown-format'].indexOf(variant) + 1}`,
      url: original.link,
      rawContent: original.content.rendered,
      contentHash: actualHash,
      latestSnapshot: text,
      latestSnapshotHash: actualHash,
      snapshotFormat: variant.startsWith('moneydigest') ? 'moneydigest-v1' : 'source-post-v1',
      status: 'NEEDS_REVIEW',
    },
  })
  const deal = await db.deal.create({
    data: {
      title: 'Pinned citation fixture',
      description: 'Immutable evidence',
      category: 'other',
      origin: 'IMPORTED',
      reviewStatus: 'PENDING',
      applicability: 'ONLINE',
      offerType: 'PERCENT_OFF',
      discountPercent: 50,
    },
  })
  const citation = await db.dealSource.create({
    data: {
      dealId: deal.id,
      importedPostId: imported.id,
      sourceContentHash: pinnedHash,
      sourceContentSnapshot: text,
      sourceUrl: `${definition.url}different-citation-url/`,
    },
  })
  const response = await fetch(
    `${baseURL}/api/ingestion/drafts/${deal.id}/evidence/${citation.id}`,
    { headers: { Cookie: actor.cookie } },
  )
  expect(response.status).toBe(200)
  const unknown = variant === 'mismatched-pin' || variant === 'unknown-format'
  expect(await response.json()).toMatchObject({
    availability: unknown ? 'UNKNOWN_FORMAT' : 'COMPLETE',
    format: unknown
      ? 'UNKNOWN'
      : variant.startsWith('moneydigest')
        ? 'moneydigest-v1'
        : 'source-post-v1',
    snapshot: unknown ? null : text,
    snapshotBytes: Buffer.byteLength(text),
    hashVerified: variant !== 'mismatched-pin',
    parsed: unknown ? null : { status: 'NEEDS_REVIEW' },
    parseError: unknown ? 'UNRECOGNIZED_SNAPSHOT' : null,
    citation: { pinnedHash, sourceUrl: citation.sourceUrl },
  })
  expect(await db.dealSource.findUniqueOrThrow({ where: { id: citation.id } })).toEqual(citation)
  expect(await db.importedPost.findUniqueOrThrow({ where: { id: imported.id } })).toEqual(imported)
})
