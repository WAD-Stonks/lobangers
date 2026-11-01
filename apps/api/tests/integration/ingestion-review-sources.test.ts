import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { parseConfig } from '@api/config'
import type { IngestionRuntime } from '@api/modules/ingestion/runtime'
import { pushDisposableSchema } from '@api-tests/fixtures/disposable-schema'
import {
  registerSyntheticOutletFixtureDatabase,
  seedSyntheticScope,
} from '@api-tests/fixtures/outlet-proof'
import type { IngestionDraftsResponse } from '@broke-oclock/contracts/ingestion'
import axios from 'axios'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const origin = 'http://localhost:5173'
const now = new Date('2026-10-20T00:00:00Z')
const knownSources = [
  ['WORDPRESS', 'moneydigest.sg'],
  ['WORDPRESS', 'scoobifydaily.wordpress.com'],
  ['TELEGRAM', 'ThisCounted'],
] as const
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let db: typeof import('@broke-oclock/db').db
let baseURL = ''
let admin: { id: string; cookie: string }
let member: { id: string; cookie: string }
const listPosts = vi.fn<IngestionRuntime['listPosts']>().mockResolvedValue([])
const runtime: IngestionRuntime = {
  enabled: false,
  reuseApproved: false,
  now: () => now,
  listPosts,
}
const http = (cookie = admin.cookie, requestOrigin = origin) =>
  axios.create({
    baseURL,
    timeout: 5_000,
    validateStatus: () => true,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(requestOrigin ? { Origin: requestOrigin } : {}),
    },
  })
const signUp = async () => {
  const response = await fetch(`${baseURL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      name: 'Synthetic review source admin',
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
      .map((value) => value.split(';')[0])
      .join('; '),
  }
}
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const databaseUrl = mongo.getUri(`ingestion_${randomUUID().replaceAll('-', '')}`)
  if (!databaseUrl.startsWith('mongodb://127.0.0.1:'))
    throw new Error('Local disposable replica required')
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
  admin = await signUp()
  member = await signUp()
  await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
}, 180_000)
afterAll(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  await db?.$disconnect()
  await mongo?.stop()
  vi.unstubAllEnvs()
})
const fixture = async (provider: 'WORDPRESS' | 'TELEGRAM', externalId: string) => {
  const source = await db.importSource.upsert({
    where: { provider_externalId: { provider, externalId } },
    create: {
      provider,
      externalId,
      name: externalId,
      url: 'https://example.test/synthetic',
      enabled: false,
    },
    update: {},
  })
  const snapshot = JSON.stringify({
    title: 'Synthetic unconfirmed offer',
    content: 'Validity unknown',
  })
  const hash = createHash('sha256').update(snapshot).digest('hex')
  const post = await db.importedPost.create({
    data: {
      sourceId: source.id,
      externalId: randomUUID(),
      url: source.url,
      rawContent: snapshot,
      contentHash: hash,
      processedContentHash: hash,
      status: 'NEEDS_REVIEW',
    },
  })
  const deal = await db.deal.create({
    data: {
      title: 'Synthetic unconfirmed offer',
      description: 'Synthetic evidence only',
      category: 'FOOD',
      offerType: 'OTHER',
      origin: 'IMPORTED',
      applicability: 'NO_FIXED_LOCATION',
      validFrom: null,
      validUntil: null,
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
  return { source, post, deal }
}
const stored = (id: string) =>
  db.deal.findUniqueOrThrow({ where: { id }, include: { sources: true, venues: true } })
const reviewBody = {
  expectedContentVersion: 1,
  decision: 'REJECT',
  note: 'Synthetic source evidence reviewed',
}
const pendingCount = async () =>
  (await http().get('/api/admin/overview')).data.counts.pendingImportedDrafts
const dashboardCounts = async () => (await http().get('/api/ingestion/dashboard')).data.counts

describe('bounded all-source admin review over real HTTP and disposable Mongo', () => {
  it.each(knownSources)(
    'queues known %s/%s without enabling ingestion',
    async (provider, externalId) => {
      const before = await pendingCount()
      const dashboardBefore = await dashboardCounts()
      const f = await fixture(provider, externalId)
      const queue = await http().get<IngestionDraftsResponse>('/api/ingestion/drafts?limit=50')
      expect(queue.status).toBe(200)
      expect(queue.data.items.find((row) => row.id === f.deal.id)).toMatchObject({
        sourceName: externalId,
        reviewReady: false,
        applicability: 'NO_FIXED_LOCATION',
      })
      expect(await pendingCount()).toBe(before + 1)
      expect((await dashboardCounts()).pending).toBe(dashboardBefore.pending + 1)
      expect(await db.importSource.findUniqueOrThrow({ where: { id: f.source.id } })).toEqual(
        f.source,
      )
      expect(listPosts).not.toHaveBeenCalled()
    },
  )

  it.each(knownSources)(
    'rejects known %s/%s with version and evidence fences',
    async (provider, externalId) => {
      const f = await fixture(provider, externalId)
      const before = await stored(f.deal.id)
      const path = `/api/ingestion/drafts/${f.deal.id}/review`
      const stale = await http().post(path, { ...reviewBody, expectedContentVersion: 2 })
      const approval = await http().post(path, { ...reviewBody, decision: 'APPROVE' })
      expect(await stored(f.deal.id)).toEqual(before)
      const response = await http().post(path, reviewBody)
      expect(response.status).toBe(200)
      expect(stale.status).toBe(409)
      expect(approval.status).toBe(412)
      expect(response.data).toEqual({
        id: f.deal.id,
        operationVersion: 1,
        reviewStatus: 'REJECTED',
      })
      const queue = await http().get<IngestionDraftsResponse>(
        '/api/ingestion/drafts?limit=50&status=REJECTED',
      )
      expect(queue.data.items.some((row) => row.id === f.deal.id)).toBe(true)
      const rejected = await stored(f.deal.id)
      expect(rejected).toMatchObject({
        reviewStatus: 'REJECTED',
        reviewedById: admin.id,
        reviewedVersion: 1,
        reviewNote: reviewBody.note,
        reviewedAt: now,
        publishedAt: null,
      })
      expect(rejected.sources).toEqual(before.sources)
      expect(
        (await db.importedPost.findUniqueOrThrow({ where: { id: f.post.id } })).updatedAt.getTime(),
      ).toBeGreaterThan(f.post.updatedAt.getTime())
      expect((await http().post(path, reviewBody)).status).toBe(409)
      expect(await stored(f.deal.id)).toEqual(rejected)
      expect(await db.importSource.findUniqueOrThrow({ where: { id: f.source.id } })).toEqual(
        f.source,
      )
    },
  )

  it.each(knownSources)(
    'approves ready no-location %s/%s without active-outlet authority',
    async (provider, externalId) => {
      const f = await fixture(provider, externalId)
      await db.deal.update({
        where: { id: f.deal.id },
        data: {
          offerType: 'FIXED_PRICE',
          priceMinor: 550,
          validFrom: new Date('2026-10-01T00:00:00Z'),
          validUntil: new Date('2026-12-31T00:00:00Z'),
        },
      })
      // Publication is a distinct positive control with explicitly confirmed synthetic scope.
      await seedSyntheticScope(db, f.deal.id, 'SOURCE_NONSPATIAL', {
        sourceUrl: f.post.url,
        sourceContentHash: f.post.contentHash,
      })
      const before = await stored(f.deal.id)
      const dashboardBefore = await dashboardCounts()
      const queue = await http().get<IngestionDraftsResponse>('/api/ingestion/drafts?limit=50')
      expect(queue.data.items.find((row) => row.id === f.deal.id)?.reviewReady).toBe(true)
      const response = await http().post(`/api/ingestion/drafts/${f.deal.id}/review`, {
        ...reviewBody,
        decision: 'APPROVE',
      })
      expect(response.status).toBe(200)
      expect(await stored(f.deal.id)).toMatchObject({
        reviewStatus: 'APPROVED',
        reviewedVersion: 1,
        reviewedById: admin.id,
        publishedAt: now,
        merchantId: null,
        venues: [],
        priceMinor: 550,
        sources: before.sources,
      })
      expect(await dashboardCounts()).toEqual({
        ...dashboardBefore,
        pending: dashboardBefore.pending - 1,
        approved: dashboardBefore.approved + 1,
      })
      expect(await db.importSource.findUniqueOrThrow({ where: { id: f.source.id } })).toEqual(
        f.source,
      )
      expect(listPosts).not.toHaveBeenCalled()
    },
  )

  it.each(knownSources)(
    'approves content but leaves unknown nonspatial scope unpublished for %s/%s',
    async (provider, externalId) => {
      const f = await fixture(provider, externalId)
      await db.deal.update({
        where: { id: f.deal.id },
        data: {
          offerType: 'FIXED_PRICE',
          priceMinor: 550,
          validFrom: new Date('2026-10-01T00:00:00Z'),
          validUntil: new Date('2026-12-31T00:00:00Z'),
        },
      })
      const before = await stored(f.deal.id)
      const response = await http().post(`/api/ingestion/drafts/${f.deal.id}/review`, {
        ...reviewBody,
        decision: 'APPROVE',
      })
      expect(response.status).toBe(200)
      const after = await stored(f.deal.id)
      expect(after).toMatchObject({
        reviewStatus: 'APPROVED',
        contentVersion: before.contentVersion,
        reviewedVersion: before.contentVersion,
        reviewedById: admin.id,
        publishedAt: null,
        scopeConfirmation: null,
        merchantId: null,
        venues: [],
      })
      expect(after.sources).toEqual(before.sources)
      expect(await db.importSource.findUniqueOrThrow({ where: { id: f.source.id } })).toEqual(
        f.source,
      )
      expect(listPosts).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['WORDPRESS', 'unknown.example'],
    ['TELEGRAM', 'UnknownChannel'],
    ['TELEGRAM', 'moneydigest.sg'],
    ['TELEGRAM', 'scoobifydaily.wordpress.com'],
    ['WORDPRESS', 'ThisCounted'],
    ['TELEGRAM', 'thiscounted'],
  ] as const)(
    'excludes unknown or mismatched %s/%s without writes',
    async (provider, externalId) => {
      const beforeCount = await pendingCount()
      const beforeDashboard = await dashboardCounts()
      const f = await fixture(provider, externalId)
      const before = await stored(f.deal.id)
      const queue = await http().get<IngestionDraftsResponse>('/api/ingestion/drafts?limit=50')
      expect(queue.data.items.some((row) => row.id === f.deal.id)).toBe(false)
      expect(await pendingCount()).toBe(beforeCount)
      expect(await dashboardCounts()).toEqual(beforeDashboard)
      expect(
        (await http().post(`/api/ingestion/drafts/${f.deal.id}/review`, reviewBody)).status,
      ).toBe(404)
      expect(await stored(f.deal.id)).toEqual(before)
      expect(await db.importedPost.findUniqueOrThrow({ where: { id: f.post.id } })).toEqual(f.post)
    },
  )

  it.each(['deleted', 'user-submitted'] as const)(
    'excludes %s deals even with known provenance',
    async (kind) => {
      const f = await fixture('TELEGRAM', 'ThisCounted')
      await db.deal.update({
        where: { id: f.deal.id },
        data: kind === 'deleted' ? { deletedAt: now } : { origin: 'USER_SUBMITTED' },
      })
      const before = await stored(f.deal.id)
      const queue = await http().get<IngestionDraftsResponse>('/api/ingestion/drafts?limit=50')
      expect(queue.data.items.some((row) => row.id === f.deal.id)).toBe(false)
      expect(
        (await http().post(`/api/ingestion/drafts/${f.deal.id}/review`, reviewBody)).status,
      ).toBe(404)
      expect(await stored(f.deal.id)).toEqual(before)
    },
  )

  it.each(knownSources)(
    'preserves unauthenticated, current-role and Origin guards for %s/%s',
    async (provider, externalId) => {
      const f = await fixture(provider, externalId)
      const before = await stored(f.deal.id)
      const path = `/api/ingestion/drafts/${f.deal.id}/review`
      expect((await http('').get('/api/ingestion/drafts')).status).toBe(401)
      expect((await http(member.cookie).get('/api/ingestion/drafts')).status).toBe(403)
      expect((await http('').post(path, reviewBody)).status).toBe(401)
      expect((await http(member.cookie).post(path, reviewBody)).status).toBe(403)
      expect((await http(admin.cookie, 'https://hostile.test').post(path, reviewBody)).status).toBe(
        403,
      )
      expect((await http(admin.cookie, '').post(path, reviewBody)).status).toBe(403)
      await db.user.update({ where: { id: admin.id }, data: { role: 'USER' } })
      try {
        expect((await http().get('/api/ingestion/drafts')).status).toBe(403)
        expect((await http().post(path, reviewBody)).status).toBe(403)
      } finally {
        await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
      }
      expect(await stored(f.deal.id)).toEqual(before)
      expect(await db.importedPost.findUniqueOrThrow({ where: { id: f.post.id } })).toEqual(f.post)
    },
  )
})
