import { execFile } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parseConfig } from '@api/config'
import type { IngestionRuntime } from '@api/modules/ingestion/runtime'
import { MONEYDIGEST_SOURCE, sourceWhere } from '@api/modules/ingestion/source'
import { parseDealCopyBatch } from '@api/tools/deal-copy/batch'
import { pushDisposableSchema } from '@api-tests/fixtures/disposable-schema'
import {
  registerSyntheticOutletFixtureDatabase,
  seedSyntheticOutletProof,
  seedSyntheticScope,
} from '@api-tests/fixtures/outlet-proof'
import axios from 'axios'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const origin = 'http://localhost:5173'
const root = fileURLToPath(new URL('../../../../', import.meta.url))
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let db: typeof import('@broke-oclock/db').db
let baseURL = ''
let fixtureDatabaseUrl = ''
let clock = new Date('2026-10-03T00:00:00.000Z')
const syntheticPost = (
  id = 101,
  content = 'Singapore pizza 1-for-1. Valid from 1 October 2026 until 31 December 2026.',
) => ({
  id,
  link: `https://www.moneydigest.sg/synthetic-${id}/`,
  date: '2026-10-01T12:00:00',
  title: { rendered: 'Synthetic Pizza' },
  content: { rendered: content },
  excerpt: { rendered: '' },
})
const listPosts = vi.fn<IngestionRuntime['listPosts']>().mockResolvedValue([syntheticPost()])
const runtime: IngestionRuntime = {
  enabled: false,
  reuseApproved: false,
  now: () => clock,
  listPosts,
}

let admin: { id: string; cookie: string }
let member: { id: string; cookie: string }
const signUp = async (name: string) => {
  const response = await fetch(`${baseURL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      name,
      email: `synthetic-${randomUUID()}@example.test`,
      password: randomBytes(24).toString('base64url'),
    }),
  })
  expect(response.status).toBe(200)
  const body = await response.json()
  return {
    id: body.user.id as string,
    cookie: response.headers
      .getSetCookie()
      .map((v) => v.split(';')[0])
      .join('; '),
  }
}
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const databaseUrl = mongo.getUri(`ingestion_${randomUUID().replaceAll('-', '')}`)
  fixtureDatabaseUrl = databaseUrl
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  await pushDisposableSchema(databaseUrl)
  db = (await import('@broke-oclock/db')).db
  registerSyntheticOutletFixtureDatabase(db, databaseUrl)
  const { createApp } = await import('@api/app')
  server = createServer()
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing local server')
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
  admin = await signUp('Synthetic admin')
  member = await signUp('Synthetic member')
  await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
}, 180_000)
afterAll(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  await db?.$disconnect()
  await mongo?.stop()
  vi.unstubAllEnvs()
})

const http = (cookie = admin.cookie, requestOrigin: string | undefined = origin) =>
  axios.create({
    baseURL,
    validateStatus: () => true,
    headers: {
      ...(requestOrigin ? { Origin: requestOrigin } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
  })
const fixture = async () => {
  const source = await db.importSource.upsert({
    where: sourceWhere,
    create: { ...MONEYDIGEST_SOURCE, enabled: true },
    update: { enabled: true },
  })
  const snapshot = JSON.stringify(syntheticPost())
  const hash = createHash('sha256').update(snapshot).digest('hex')
  const post = await db.importedPost.create({
    data: {
      sourceId: source.id,
      externalId: randomUUID(),
      url: syntheticPost().link,
      rawContent: snapshot,
      contentHash: hash,
      processedContentHash: hash,
      status: 'NEEDS_REVIEW',
    },
  })
  const deal = await db.deal.create({
    data: {
      title: 'Synthetic Pizza',
      description: 'Immutable description',
      terms: 'Immutable terms',
      category: 'FOOD',
      offerType: 'BUY_ONE_GET_ONE',
      origin: 'IMPORTED',
      applicability: 'NO_FIXED_LOCATION',
      validFrom: new Date('2026-10-01'),
      validUntil: new Date('2027-01-01'),
      sources: {
        create: {
          importedPostId: post.id,
          sourceContentHash: hash,
          sourceContentSnapshot: snapshot,
          sourceUrl: post.url,
        },
      },
    },
  })
  const merchant = await db.merchant.create({ data: { name: 'Synthetic merchant' } })
  const venue = await db.venue.create({
    data: {
      merchantId: merchant.id,
      name: 'Existing outlet',
      address: 'Existing address',
      latitude: 1.3,
      longitude: 103.8,
    },
  })
  // Explicit existing selectable catalogue positive, independent of the pending draft.
  await seedSyntheticOutletProof(db, venue.id)
  return { deal, post, venue, merchant, source }
}
const associate = (
  f: Awaited<ReturnType<typeof fixture>>,
  version = 1,
  venueId = f.venue.id,
  operationVersion = 0,
) =>
  http().patch(`/api/ingestion/drafts/${f.deal.id}/outlet`, {
    expectedContentVersion: version,
    expectedOperationVersion: operationVersion,
    venueId,
  })
const review = (
  f: Awaited<ReturnType<typeof fixture>>,
  version = 1,
  decision = 'APPROVE',
  operationVersion = 0,
) =>
  http().post(`/api/ingestion/drafts/${f.deal.id}/review`, {
    expectedContentVersion: version,
    expectedOperationVersion: operationVersion,
    decision,
    note: 'Synthetic evidence checked',
  })
const stored = (id: string) =>
  db.deal.findUniqueOrThrow({ where: { id }, include: { sources: true, venues: true } })

describe('existing outlet association real native HTTP and disposable Mongo', () => {
  it('conflicts with real changed-content reimport and never carries the selected outlet to new evidence', async () => {
    const { runIngestion } = await import('@api/modules/ingestion/service')
    const f = await fixture()
    const id = 90001
    runtime.enabled = true
    runtime.reuseApproved = true
    clock = new Date(clock.getTime() + 30_000)
    listPosts.mockResolvedValue([syntheticPost(id)])
    expect((await http().post('/api/ingestion/runs')).status).toBe(200)
    const initial = await db.deal.findFirstOrThrow({
      where: { sources: { some: { importedPost: { externalId: String(id) } } } },
    })
    const selected = { ...f, deal: initial }
    expect((await associate(selected)).status).toBe(200)
    const before = await stored(initial.id)
    if (before.operationVersion === null) throw new Error('Missing associated operation version')
    clock = new Date(clock.getTime() + 30_000)
    listPosts.mockResolvedValue([
      syntheticPost(
        id,
        'Singapore pizza 1-for-1. Valid from 2 October 2026 until 31 December 2026.',
      ),
    ])
    const transact = db.$transaction.bind(db)
    let armed = true
    const spy = vi.spyOn(db, '$transaction').mockImplementation((operation, options) =>
      transact(
        async (tx) =>
          operation(
            new Proxy(tx, {
              get(target, property, receiver) {
                if (property !== 'deal') return Reflect.get(target, property, receiver)
                return new Proxy(target.deal, {
                  get(delegate, method, receiver) {
                    if (method !== 'findFirst') return Reflect.get(delegate, method, receiver)
                    return async (...args: Parameters<typeof delegate.findFirst>) => {
                      const result = await delegate.findFirst(...args)
                      if (armed && args[0]?.where?.id === initial.id) {
                        armed = false
                        // An independent system writer must not wait on this manual
                        // association's native actor fence while its Mongo read is paused.
                        expect(await runIngestion(db, runtime)).toMatchObject({
                          status: 'SUCCEEDED',
                        })
                      }
                      return result
                    }
                  },
                })
              },
            }),
          ),
        options,
      ),
    )
    const next = await fixture()
    try {
      expect((await associate(selected, 2, next.venue.id, before.operationVersion)).status).toBe(
        409,
      )
      expect(armed).toBe(false)
    } finally {
      spy.mockRestore()
    }
    const historical = await stored(initial.id)
    expect(historical.sources).toEqual(before.sources)
    expect(historical).toMatchObject({
      reviewStatus: 'REJECTED',
      merchantId: f.merchant.id,
      publishedAt: null,
    })
    expect(historical.venues).toEqual(before.venues)
    const replacement = await db.deal.findFirstOrThrow({
      where: {
        reviewStatus: 'PENDING',
        sources: { some: { importedPost: { externalId: String(id) } } },
      },
      include: { venues: true },
    })
    expect(replacement).toMatchObject({
      contentVersion: 3,
      applicability: 'NO_FIXED_LOCATION',
      merchantId: null,
      publishedAt: null,
      venues: [],
    })
  })

  it('validates role, origin, strict input and read-only methods without any mutation', async () => {
    const f = await fixture()
    const path = `/api/ingestion/drafts/${f.deal.id}/outlet`
    const body = { expectedContentVersion: 1, venueId: f.venue.id }
    const before = await stored(f.deal.id)
    expect((await http('').patch(path, body)).status).toBe(401)
    expect((await http(member.cookie).patch(path, body)).status).toBe(403)
    expect((await http(admin.cookie, 'https://hostile.test').patch(path, body)).status).toBe(403)
    expect((await http(admin.cookie, '').patch(path, body)).status).toBe(403)
    for (const invalid of [
      { ...body, merchantId: f.merchant.id },
      { ...body, expectedContentVersion: 0 },
      { ...body, expectedContentVersion: 2147483647 },
      { ...body, venueId: f.venue.id.toUpperCase() },
    ])
      expect((await http().patch(path, invalid)).status).toBe(400)
    expect((await http().patch('/api/ingestion/drafts/INVALID/outlet', body)).status).toBe(400)
    for (const method of ['get', 'head', 'post', 'put', 'delete']) {
      const r = await http().request({ method, url: path })
      expect(r.status).toBe(405)
      expect(r.headers.allow).toBe('PATCH')
    }
    expect(await stored(f.deal.id)).toEqual(before)
  })
  it('refuses stale, reviewed, unsupported, inconsistent, inactive and mismatched evidence states', async () => {
    for (const state of [
      'stale',
      'reviewed',
      'deleted',
      'native',
      'online',
      'all',
      'missing',
      'inactive',
      'merchant',
      'source',
      'hash',
      'failed',
      'multi',
      'occupancyMissing',
      'occupancyNull',
      'occupancyStale',
    ]) {
      const f = await fixture()
      let status = 412
      if (state === 'stale') status = 409
      if (state === 'reviewed') {
        await db.deal.update({ where: { id: f.deal.id }, data: { reviewStatus: 'REJECTED' } })
        status = 409
      }
      if (state === 'deleted') {
        await db.deal.update({ where: { id: f.deal.id }, data: { deletedAt: new Date() } })
        status = 404
      }
      if (state === 'native') {
        await db.deal.update({ where: { id: f.deal.id }, data: { origin: 'USER_SUBMITTED' } })
        status = 404
      }
      if (state === 'online' || state === 'all')
        await db.deal.update({
          where: { id: f.deal.id },
          data: { applicability: state === 'online' ? 'ONLINE' : 'ALL_MERCHANT_OUTLETS' },
        })
      if (state === 'inactive')
        await db.venue.update({ where: { id: f.venue.id }, data: { deletedAt: new Date() } })
      if (state === 'merchant')
        await db.merchant.update({ where: { id: f.merchant.id }, data: { deletedAt: new Date() } })
      if (state === 'source')
        await db.importSource.update({ where: { id: f.source.id }, data: { enabled: false } })
      if (state === 'hash' || state === 'failed')
        await db.importedPost.update({
          where: { id: f.post.id },
          data:
            state === 'hash'
              ? { contentHash: 'changed' }
              : { status: 'FAILED', errorCode: 'POST_FAILED' },
        })
      if (state === 'multi')
        await db.dealVenue.create({ data: { dealId: f.deal.id, venueId: f.venue.id } })
      if (state === 'occupancyMissing')
        await db.venue.update({
          where: { id: f.venue.id },
          data: { occupancyEvidence: { unset: true } },
        })
      if (state === 'occupancyNull')
        await db.venue.update({ where: { id: f.venue.id }, data: { occupancyEvidence: null } })
      if (state === 'occupancyStale')
        await db.venue.update({
          where: { id: f.venue.id },
          data: { address: 'Changed synthetic occupancy tuple' },
        })
      const before = await stored(f.deal.id)
      expect(
        (
          await associate(
            f,
            state === 'stale' ? 2 : 1,
            state === 'missing' ? '000000000000000000000001' : f.venue.id,
          )
        ).status,
        state,
      ).toBe(status)
      expect(await stored(f.deal.id)).toEqual(before)
    }
  })
  it('reassociates exactly one outlet at a new version and refuses an unchanged selection', async () => {
    const f = await fixture(),
      next = await fixture()
    expect((await associate(f)).status).toBe(200)
    expect((await associate(f, 2, f.venue.id, 1)).status).toBe(412)
    expect((await associate(f, 2, next.venue.id, 1)).status).toBe(200)
    const after = await stored(f.deal.id)
    expect(after).toMatchObject({
      merchantId: next.merchant.id,
      contentVersion: 3,
      reviewStatus: 'PENDING',
      publishedAt: null,
    })
    expect(after.venues.map((v) => v.venueId)).toEqual([next.venue.id])
  })
  it('serializes simultaneous review and association so changed content is never approved', async () => {
    const f = await fixture()
    const results = await Promise.all([associate(f), review(f)])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    const after = await stored(f.deal.id)
    if (after.reviewStatus === 'APPROVED')
      expect(after).toMatchObject({ contentVersion: 1, reviewedVersion: 1, merchantId: null })
    else
      expect(after).toMatchObject({
        reviewStatus: 'PENDING',
        contentVersion: 2,
        publishedAt: null,
        reviewedVersion: null,
      })
  })
  it('conflicts on committed source, outlet, merchant and actor changes after transaction reads', async () => {
    const { PrismaClient } = await import('@broke-oclock/db')
    const concurrent = new PrismaClient({ datasourceUrl: fixtureDatabaseUrl })
    for (const target of ['deal', 'venue', 'merchant', 'user', 'importSource'] as const) {
      const f = await fixture()
      const transact = db.$transaction.bind(db)
      let armed = true
      const spy = vi.spyOn(db, '$transaction').mockImplementation((operation, options) =>
        transact(
          async (tx) =>
            operation(
              new Proxy(tx, {
                get(transaction, property, receiver) {
                  if (property !== target) return Reflect.get(transaction, property, receiver)
                  return new Proxy(transaction[target], {
                    get(delegate, method, receiver) {
                      if (method !== (target === 'deal' ? 'findFirst' : 'findUnique'))
                        return Reflect.get(delegate, method, receiver)
                      return async (...args: unknown[]) => {
                        const value = await Reflect.apply(
                          Reflect.get(delegate, method),
                          delegate,
                          args,
                        )
                        if (armed) {
                          armed = false
                          if (target === 'deal')
                            await concurrent.importedPost.update({
                              where: { id: f.post.id },
                              data: { contentHash: 'concurrent-change' },
                            })
                          if (target === 'venue')
                            await concurrent.venue.update({
                              where: { id: f.venue.id },
                              data: { deletedAt: new Date() },
                            })
                          if (target === 'merchant')
                            await concurrent.merchant.update({
                              where: { id: f.merchant.id },
                              data: { deletedAt: new Date() },
                            })
                          if (target === 'user')
                            await concurrent.user.update({
                              where: { id: admin.id },
                              data: { role: 'USER' },
                            })
                          if (target === 'importSource')
                            await concurrent.importSource.update({
                              where: { id: f.source.id },
                              data: { enabled: false },
                            })
                        }
                        return value
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
        expect((await associate(f)).status, target).toBe(409)
        expect(await stored(f.deal.id)).toMatchObject({
          contentVersion: 1,
          merchantId: null,
          reviewStatus: 'PENDING',
          publishedAt: null,
        })
      } finally {
        spy.mockRestore()
        await concurrent.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
      }
    }
    await concurrent.$disconnect()
  })
  it('rolls back all fences and draft edits when link creation fails and returns a sanitized 500', async () => {
    const f = await fixture()
    const before = await stored(f.deal.id),
      post = await db.importedPost.findUniqueOrThrow({ where: { id: f.post.id } }),
      actor = await db.user.findUniqueOrThrow({ where: { id: admin.id } })
    const transact = db.$transaction.bind(db)
    const spy = vi.spyOn(db, '$transaction').mockImplementation((operation, options) =>
      transact(
        async (tx) =>
          operation(
            new Proxy(tx, {
              get(target, property, receiver) {
                if (property !== 'dealVenue') return Reflect.get(target, property, receiver)
                return new Proxy(target.dealVenue, {
                  get(delegate, method, receiver) {
                    if (method === 'create')
                      return () => {
                        throw new Error('private injected diagnostics')
                      }
                    return Reflect.get(delegate, method, receiver)
                  },
                })
              },
            }),
          ),
        options,
      ),
    )
    try {
      const result = await associate(f)
      expect(result.status).toBe(500)
      expect(result.data).toEqual({
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
      })
      expect(await stored(f.deal.id)).toEqual(before)
      expect(await db.importedPost.findUniqueOrThrow({ where: { id: f.post.id } })).toEqual(post)
      expect(await db.user.findUniqueOrThrow({ where: { id: admin.id } })).toEqual(actor)
    } finally {
      spy.mockRestore()
    }
  })

  it('refuses approval when the associated outlet or merchant is inactive, but preserves rejection', async () => {
    for (const target of ['venue', 'merchant'] as const) {
      const f = await fixture()
      expect((await associate(f)).status).toBe(200)
      // Approval positive prerequisite is a separately reviewed synthetic campaign,
      // never inferred from selecting a venue. Inactivity remains the only changed gate.
      await seedSyntheticScope(db, f.deal.id, 'SOURCE_SELECTED', {
        sourceUrl: f.post.url,
        sourceContentHash: f.post.contentHash,
      })
      if (target === 'venue')
        await db.venue.update({ where: { id: f.venue.id }, data: { deletedAt: new Date() } })
      else
        await db.merchant.update({ where: { id: f.merchant.id }, data: { deletedAt: new Date() } })
      expect((await review(f, 2, 'APPROVE', 1)).status).toBe(412)
      expect((await stored(f.deal.id)).publishedAt).toBeNull()
      expect((await review(f, 2, 'REJECT', 1)).status).toBe(200)
    }
  })
  it('conflicts if the ADMIN is demoted after its transaction role read, leaving no review write', async () => {
    const f = await fixture()
    const { PrismaClient } = await import('@broke-oclock/db')
    const concurrent = new PrismaClient({ datasourceUrl: fixtureDatabaseUrl })
    const transact = db.$transaction.bind(db)
    let armed = true
    const spy = vi.spyOn(db, '$transaction').mockImplementation((operation, options) =>
      transact(async (tx) => {
        const proxy = new Proxy(tx, {
          get(target, property, receiver) {
            if (property !== 'user') return Reflect.get(target, property, receiver)
            return new Proxy(target.user, {
              get(delegate, method, receiver) {
                if (method !== 'findUnique') return Reflect.get(delegate, method, receiver)
                return async (...args: Parameters<typeof delegate.findUnique>) => {
                  const result = await delegate.findUnique(...args)
                  if (armed && args[0]?.where.id === admin.id) {
                    armed = false
                    await concurrent.user.update({
                      where: { id: admin.id },
                      data: { role: 'USER' },
                    })
                  }
                  return result
                }
              },
            })
          },
        })
        return operation(proxy)
      }, options),
    )
    try {
      expect((await review(f)).status).toBe(409)
      expect(await stored(f.deal.id)).toMatchObject({ reviewStatus: 'PENDING', publishedAt: null })
    } finally {
      spy.mockRestore()
      await concurrent.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
      await concurrent.$disconnect()
    }
  })
  it('associates without provisioning or changing citation bytes and projects the selected outlet', async () => {
    const f = await fixture()
    const before = await stored(f.deal.id)
    const counts = await Promise.all([db.merchant.count(), db.venue.count()])
    const response = await associate(f)
    expect(response.status).toBe(200)
    expect(response.data).toEqual({
      id: f.deal.id,
      operationVersion: 1,
      contentVersion: 2,
      reviewStatus: 'PENDING',
      applicability: 'SELECTED_OUTLETS',
      merchantId: f.merchant.id,
      outlet: {
        id: f.venue.id,
        name: f.venue.name,
        address: f.venue.address,
        merchantName: f.merchant.name,
      },
    })
    const after = await stored(f.deal.id)
    expect(after.sources).toEqual(before.sources)
    expect(after).toMatchObject({
      ...f.deal,
      operationVersion: 1,
      updatedAt: after.updatedAt,
      merchantId: f.merchant.id,
      applicability: 'SELECTED_OUTLETS',
      contentVersion: 2,
      reviewedVersion: null,
      reviewedById: null,
      reviewedAt: null,
      reviewNote: null,
      publishedAt: null,
    })
    expect(after.venues.map((v) => v.venueId)).toEqual([f.venue.id])
    expect(await Promise.all([db.merchant.count(), db.venue.count()])).toEqual(counts)
    // A catalogue association deliberately does not confirm campaign participation.
    expect(after.scopeConfirmation).toBeNull()
    const heldQueue = await http().get('/api/ingestion/drafts?limit=50')
    expect(heldQueue.data.items.find((d: { id: string }) => d.id === f.deal.id)).toMatchObject({
      reviewReady: true,
      approvalReady: false,
      scopeStatus: 'UNCONFIRMED',
    })
    expect((await review(f, 2, 'APPROVE', 1)).status).toBe(412)
    await seedSyntheticScope(db, f.deal.id, 'SOURCE_SELECTED', {
      sourceUrl: f.post.url,
      sourceContentHash: f.post.contentHash,
    })
    const queue = await http().get('/api/ingestion/drafts?limit=50')
    expect(queue.data.items.find((d: { id: string }) => d.id === f.deal.id)).toMatchObject({
      merchantId: f.merchant.id,
      outlet: response.data.outlet,
      reviewReady: true,
    })
    expect((await review(f, 1)).status).toBe(409)
    expect((await review(f, 2, 'APPROVE', 1)).status).toBe(200)
  })
})

const approvedPhysicalFixture = async (title = 'Synthetic Pizza') => {
  const f = await fixture()
  if (title !== f.deal.title) {
    // Setup only, before association, proof or moderation.
    await db.deal.update({ where: { id: f.deal.id }, data: { title } })
  }
  expect((await associate(f)).status).toBe(200)
  await seedSyntheticScope(db, f.deal.id, 'SOURCE_SELECTED', {
    sourceUrl: f.post.url,
    sourceContentHash: f.post.contentHash,
  })
  expect((await review(f, 2, 'APPROVE', 1)).status).toBe(200)
  expect((await stored(f.deal.id)).publishedAt).not.toBeNull()
  return f
}

const publicVenueDealIds = async (venueId: string): Promise<string[]> => {
  const response = await http().get(`/api/venues/${venueId}`)
  expect(response.status).toBe(200)
  return response.data.deals.map((deal: { id: string }) => deal.id)
}

describe('operator copy writer actual caller with native review and public projection', () => {
  it('rejects conflicting planned rewrites of one field without changing any deal', async () => {
    const { rewriteDealCopy } = await import('@api/tools/rewrite-deal-copy')
    const f = await approvedPhysicalFixture()
    const before = await stored(f.deal.id)
    const batch = parseDealCopyBatch({
      note: 'SYNTHETIC: ambiguous batch must not silently choose the last value',
      rewrites: [
        { id: f.deal.id, field: 'title', from: before.title, to: 'Synthetic first title' },
        { id: f.deal.id, field: 'title', from: before.title, to: 'Synthetic second title' },
      ],
    })
    await expect(rewriteDealCopy(db, batch.rewrites, { apply: true })).rejects.toThrow(
      'Conflicting rewrites',
    )
    expect(await stored(f.deal.id)).toEqual(before)
  })

  it('versions a multi-field rewrite once, withdraws publication and never reuses old scope', async () => {
    const { rewriteDealCopy } = await import('@api/tools/rewrite-deal-copy')
    const f = await approvedPhysicalFixture()
    const before = await stored(f.deal.id)
    const postBefore = await db.importedPost.findUniqueOrThrow({ where: { id: f.post.id } })
    expect(await publicVenueDealIds(f.venue.id)).toContain(f.deal.id)
    const batch = parseDealCopyBatch({
      note: 'SYNTHETIC: inert material writer control only',
      rewrites: [
        { id: f.deal.id, field: 'title', from: before.title, to: 'Synthetic new title' },
        { id: f.deal.id, field: 'description', from: before.description, to: 'Synthetic new copy' },
        { id: f.deal.id, field: 'terms', from: before.terms, to: 'Synthetic new terms' },
        { id: f.deal.id, field: 'category', from: before.category, to: 'DRINKS' },
        { id: f.deal.id, field: 'cuisine', from: null, to: 'CAFE' },
      ],
    })
    await rewriteDealCopy(db, batch.rewrites, { apply: false })
    expect(await stored(f.deal.id)).toEqual(before)
    await rewriteDealCopy(db, batch.rewrites, { apply: true })
    const after = await stored(f.deal.id)
    expect(after).toMatchObject({
      title: 'Synthetic new title',
      description: 'Synthetic new copy',
      terms: 'Synthetic new terms',
      category: 'DRINKS',
      cuisine: 'CAFE',
      contentVersion: 3,
      reviewStatus: 'PENDING',
      reviewedVersion: null,
      reviewedById: null,
      reviewedAt: null,
      reviewNote: null,
      publishedAt: null,
      scopeConfirmation: null,
    })
    expect(after.sources).toEqual(before.sources)
    expect(after.venues).toEqual(before.venues)
    expect(await db.importedPost.findUniqueOrThrow({ where: { id: f.post.id } })).toEqual(
      postBefore,
    )
    expect(await publicVenueDealIds(f.venue.id)).not.toContain(f.deal.id)
    expect((await review(f, 2, 'APPROVE', 1)).status).toBe(409)
    expect((await review(f, 3, 'APPROVE', 3)).status).toBe(412)
    await seedSyntheticScope(db, f.deal.id, 'SOURCE_SELECTED', {
      sourceUrl: f.post.url,
      sourceContentHash: f.post.contentHash,
    })
    expect((await review(f, 3, 'APPROVE', 3)).status).toBe(200)
    expect(await publicVenueDealIds(f.venue.id)).toContain(f.deal.id)
    // Revert is also material content, not restoration of the previous review/proof.
    await rewriteDealCopy(db, batch.rewrites, { apply: true, revert: true })
    expect(await stored(f.deal.id)).toMatchObject({
      title: before.title,
      description: before.description,
      terms: before.terms,
      category: before.category,
      cuisine: null,
      contentVersion: 4,
      reviewStatus: 'PENDING',
      reviewedVersion: null,
      publishedAt: null,
      scopeConfirmation: null,
    })
    const reverted = await stored(f.deal.id)
    await rewriteDealCopy(db, batch.rewrites, { apply: true, revert: true })
    expect(await stored(f.deal.id)).toEqual(reverted)
    expect(await publicVenueDealIds(f.venue.id)).not.toContain(f.deal.id)
  })
})

describe('operator category writer actual caller with native review and public projection', () => {
  it('withdraws a reclassified approved deal until fresh source scope and review, but leaves noops alone', async () => {
    const { reclassifyCategories } = await import('@api/tools/reclassify-categories')
    const f = await approvedPhysicalFixture('Synthetic bubble tea')
    const unchanged = await approvedPhysicalFixture()
    const before = await stored(f.deal.id)
    const unchangedBefore = await stored(unchanged.deal.id)
    const postBefore = await db.importedPost.findUniqueOrThrow({ where: { id: f.post.id } })
    expect(await publicVenueDealIds(f.venue.id)).toContain(f.deal.id)
    await reclassifyCategories(db, false)
    expect(await stored(f.deal.id)).toEqual(before)
    await reclassifyCategories(db, true)
    const after = await stored(f.deal.id)
    expect(after).toMatchObject({
      title: before.title,
      description: before.description,
      category: 'DRINKS',
      contentVersion: 3,
      reviewStatus: 'PENDING',
      reviewedVersion: null,
      reviewedById: null,
      reviewedAt: null,
      reviewNote: null,
      publishedAt: null,
      scopeConfirmation: null,
    })
    expect(after.sources).toEqual(before.sources)
    expect(after.venues).toEqual(before.venues)
    expect(await stored(unchanged.deal.id)).toEqual(unchangedBefore)
    expect(await db.importedPost.findUniqueOrThrow({ where: { id: f.post.id } })).toEqual(
      postBefore,
    )
    expect(await publicVenueDealIds(f.venue.id)).not.toContain(f.deal.id)
    expect((await review(f, 2, 'APPROVE', 1)).status).toBe(409)
    expect((await review(f, 3, 'APPROVE', 3)).status).toBe(412)
    await seedSyntheticScope(db, f.deal.id, 'SOURCE_SELECTED', {
      sourceUrl: f.post.url,
      sourceContentHash: f.post.contentHash,
    })
    expect((await review(f, 3, 'APPROVE', 3)).status).toBe(200)
    expect(await publicVenueDealIds(f.venue.id)).toContain(f.deal.id)
    const reviewed = await stored(f.deal.id)
    await reclassifyCategories(db, true)
    expect(await stored(f.deal.id)).toEqual(reviewed)
  })
})

describe('material writer concurrency and disposable CLI characterization', () => {
  it.each(['rewrite', 'reclassify'] as const)(
    '%s refuses a concurrently advanced version and rolls back the other batch member',
    async (writer) => {
      const first = await approvedPhysicalFixture('Synthetic bubble tea')
      const second = await approvedPhysicalFixture('Synthetic bubble tea')
      const firstBefore = await stored(first.deal.id)
      const secondBefore = await stored(second.deal.id)
      const { PrismaClient } = await import('@broke-oclock/db/constructor')
      const concurrent = new PrismaClient({ datasourceUrl: fixtureDatabaseUrl })
      const transact = db.$transaction.bind(db)
      let racedRow: Awaited<ReturnType<typeof stored>> | undefined
      const spy = vi
        .spyOn(db, '$transaction')
        .mockImplementationOnce(async (operation, options) => {
          // Commit after real planning but before the real transaction. Change a field NOT being
          // rewritten/classified: expected-field guards alone cannot detect this new version.
          await concurrent.deal.update({
            where: { id: second.deal.id },
            data: { terms: 'SYNTHETIC concurrent terms', contentVersion: { increment: 1 } },
          })
          racedRow = await stored(second.deal.id)
          return transact(operation, options)
        })
      try {
        if (writer === 'rewrite') {
          const { rewriteDealCopy } = await import('@api/tools/rewrite-deal-copy')
          const batch = parseDealCopyBatch({
            note: 'SYNTHETIC: real multi-deal transaction rollback',
            rewrites: [first, second].map((f) => ({
              id: f.deal.id,
              field: 'title',
              from: 'Synthetic bubble tea',
              to: 'Synthetic rewritten bubble tea',
            })),
          })
          await expect(rewriteDealCopy(db, batch.rewrites, { apply: true })).rejects.toMatchObject({
            code: 'P2025',
          })
        } else {
          const { reclassifyCategories } = await import('@api/tools/reclassify-categories')
          await expect(reclassifyCategories(db, true)).rejects.toMatchObject({ code: 'P2025' })
        }
        expect(racedRow).toMatchObject({ contentVersion: secondBefore.contentVersion + 1 })
        expect(await stored(first.deal.id)).toEqual(firstBefore)
        expect(await stored(second.deal.id)).toEqual(racedRow)
      } finally {
        spy.mockRestore()
        await concurrent.$disconnect()
      }
    },
  )

  it('keeps actual CLI dry-run, apply and revert usable on an explicitly owned loopback database', async () => {
    const f = await approvedPhysicalFixture()
    const before = await stored(f.deal.id)
    const url = new URL(fixtureDatabaseUrl)
    expect(url.protocol).toBe('mongodb:')
    expect(url.hostname).toBe('127.0.0.1')
    expect(url.pathname).toMatch(/^\/ingestion_[a-f0-9]+$/)
    const directory = await mkdtemp(join(tmpdir(), 'synthetic-material-cli-'))
    const batchPath = join(directory, 'synthetic-copy.json')
    await writeFile(
      batchPath,
      JSON.stringify({
        note: 'SYNTHETIC: actual CLI against a disposable loopback replica only',
        rewrites: [
          { id: f.deal.id, field: 'title', from: before.title, to: 'Synthetic bubble tea' },
        ],
      }),
    )
    // Do not forward provider credentials, NODE_OPTIONS, dotenv loaders or ambient DB values.
    const cliEnvironment = {
      PATH: process.env.PATH,
      TMPDIR: tmpdir(),
      NODE_ENV: 'test',
      DATABASE_URL: fixtureDatabaseUrl,
      PRISMA_HIDE_UPDATE_MESSAGE: 'true',
    }
    const cli = async (tool: string, args: string[] = []) =>
      promisify(execFile)(process.execPath, ['--import', 'tsx', `src/tools/${tool}.ts`, ...args], {
        cwd: join(root, 'apps/api'),
        env: cliEnvironment,
        timeout: 30_000,
      })
    try {
      const copyPreview = await cli('rewrite-deal-copy', ['--batch', batchPath])
      expect(copyPreview.stdout).toContain('Dry run:')
      expect(copyPreview.stdout).toContain(
        'withdraw publication and require fresh review and outlet scope',
      )
      expect(await stored(f.deal.id)).toEqual(before)
      expect((await cli('rewrite-deal-copy', ['--batch', batchPath, '--apply'])).stdout).toContain(
        'Updated 1 field(s).',
      )
      expect(await stored(f.deal.id)).toMatchObject({
        title: 'Synthetic bubble tea',
        contentVersion: 3,
        reviewStatus: 'PENDING',
        publishedAt: null,
        scopeConfirmation: null,
      })
      const rewritten = await stored(f.deal.id)
      const categoryPreview = await cli('reclassify-categories')
      expect(categoryPreview.stdout).toContain('Dry run:')
      expect(categoryPreview.stdout).toContain(
        'withdraw publication and require fresh review and outlet scope',
      )
      expect(await stored(f.deal.id)).toEqual(rewritten)
      expect((await cli('reclassify-categories', ['--apply'])).stdout).toContain('Updated')
      expect(await stored(f.deal.id)).toMatchObject({
        category: 'DRINKS',
        contentVersion: 4,
        reviewStatus: 'PENDING',
        publishedAt: null,
        scopeConfirmation: null,
      })
      await cli('rewrite-deal-copy', ['--batch', batchPath, '--apply', '--revert'])
      expect(await stored(f.deal.id)).toMatchObject({
        title: before.title,
        contentVersion: 5,
        reviewStatus: 'PENDING',
        publishedAt: null,
        scopeConfirmation: null,
      })
      expect(await publicVenueDealIds(f.venue.id)).not.toContain(f.deal.id)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

const setCategory = (
  f: Awaited<ReturnType<typeof fixture>>,
  version = 1,
  category = 'DRINKS',
  operationVersion = 0,
) =>
  http().patch(`/api/ingestion/drafts/${f.deal.id}/category`, {
    expectedContentVersion: version,
    expectedOperationVersion: operationVersion,
    category,
  })

describe('draft category correction', () => {
  it('discards version-bound outlet proof and requires fresh source-confirmed scope before publication', async () => {
    const f = await fixture()
    // SYNTHETIC positive with every physical prerequisite, not a catalogue selection as proof.
    await db.deal.update({
      where: { id: f.deal.id },
      data: {
        applicability: 'SELECTED_OUTLETS',
        merchantId: f.merchant.id,
        venues: { create: { venueId: f.venue.id } },
      },
    })
    await seedSyntheticScope(db, f.deal.id, 'SOURCE_SELECTED', {
      sourceUrl: f.post.url,
      sourceContentHash: f.post.contentHash,
    })
    const before = await stored(f.deal.id)
    expect(before.scopeConfirmation?.contentVersion).toBe(1)
    expect((await setCategory(f)).status).toBe(200)
    const after = await stored(f.deal.id)
    expect(after.scopeConfirmation).toBeNull()
    expect(after.sources).toEqual(before.sources)
    expect(after.venues).toEqual(before.venues)
    expect((await review(f, 2, 'APPROVE', 1)).status).toBe(412)
    expect((await stored(f.deal.id)).publishedAt).toBeNull()
    await seedSyntheticScope(db, f.deal.id, 'SOURCE_SELECTED', {
      sourceUrl: f.post.url,
      sourceContentHash: f.post.contentHash,
    })
    expect((await review(f, 2, 'APPROVE', 1)).status).toBe(200)
    expect((await stored(f.deal.id)).publishedAt).not.toBeNull()
  })

  it('moves the draft to a new pending version and refuses stale, unchanged or unknown input', async () => {
    const f = await fixture()
    // The upstream category approval positive needs the same independent physical proof as
    // association/review positives. A version change cannot inherit campaign participation.
    await db.deal.update({
      where: { id: f.deal.id },
      data: {
        applicability: 'SELECTED_OUTLETS',
        merchantId: f.merchant.id,
        venues: { create: { venueId: f.venue.id } },
      },
    })
    await seedSyntheticScope(db, f.deal.id, 'SOURCE_SELECTED', {
      sourceUrl: f.post.url,
      sourceContentHash: f.post.contentHash,
    })
    expect((await setCategory(f, 1, 'MYSTERY')).status).toBe(400)
    expect((await setCategory(f, 1, 'FOOD')).status).toBe(412)
    expect(
      (
        await http(member.cookie).patch(`/api/ingestion/drafts/${f.deal.id}/category`, {
          expectedContentVersion: 1,
          category: 'DRINKS',
        })
      ).status,
    ).toBe(403)
    const before = await stored(f.deal.id)
    const response = await setCategory(f)
    expect(response.status).toBe(200)
    expect(response.data).toEqual({
      id: f.deal.id,
      operationVersion: 1,
      contentVersion: 2,
      reviewStatus: 'PENDING',
      category: 'DRINKS',
    })
    const after = await stored(f.deal.id)
    expect(after.sources).toEqual(before.sources)
    expect(after).toMatchObject({
      category: 'DRINKS',
      contentVersion: 2,
      reviewedVersion: null,
      reviewNote: null,
      publishedAt: null,
    })
    expect((await setCategory(f, 1, 'BAKERY')).status).toBe(409)
    expect((await review(f, 1)).status).toBe(409)
    expect((await review(f, 2, 'APPROVE', 1)).status).toBe(412)
    await seedSyntheticScope(db, f.deal.id, 'SOURCE_SELECTED', {
      sourceUrl: f.post.url,
      sourceContentHash: f.post.contentHash,
    })
    expect((await review(f, 2, 'APPROVE', 1)).status).toBe(200)
    expect((await stored(f.deal.id)).publishedAt).not.toBeNull()
    expect((await setCategory(f, 2, 'BAKERY')).status).toBe(409)
  })
})
