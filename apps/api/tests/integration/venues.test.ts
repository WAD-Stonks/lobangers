import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import {
  registerSyntheticOutletFixtureDatabase,
  seedSyntheticOutletProof,
  seedSyntheticScope,
} from '@api/../tests/fixtures/outlet-proof'
import { parseConfig } from '@api/config'
import { ApiClientError, createApiClient } from '@broke-oclock/api-client'
import axios from 'axios'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

const origin = 'http://localhost:5173'
const root = fileURLToPath(new URL('../../../../', import.meta.url))
const day = 24 * 60 * 60 * 1000
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let db: typeof import('@broke-oclock/db').db
let baseURL = ''

const http = () => axios.create({ baseURL, timeout: 10000, validateStatus: () => true })

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    instanceOpts: [{ launchTimeout: 60000 }],
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const databaseUrl = mongo.getUri(`venues_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  await promisify(execFile)('pnpm', ['--dir', 'packages/db', 'run', 'push', '--skip-generate'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    timeout: 60000,
  })
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
    ),
  )
}, 180000)

afterAll(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  await db?.$disconnect()
  await mongo?.stop()
  vi.unstubAllEnvs()
})

type DealData = Parameters<typeof db.deal.create>[0]['data']

const createVisibleDeal = (title: string, data: Record<string, unknown> = {}) =>
  db.deal.create({
    data: {
      title,
      description: `${title} description`,
      category: 'Food',
      offerType: 'FIXED_PRICE',
      priceMinor: 500,
      applicability: 'SELECTED_OUTLETS',
      reviewStatus: 'APPROVED',
      contentVersion: 1,
      reviewedVersion: 1,
      publishedAt: new Date(Date.now() - day),
      ...data,
    } as DealData,
  })

it('returns the venue with only publicly visible ongoing and past deals that apply to it', async () => {
  const now = Date.now()
  const uploader = await db.user.create({
    data: {
      name: 'Synthetic uploader',
      email: `${randomUUID()}@example.test`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  })
  const merchant = await db.merchant.create({ data: { name: 'Synthetic Kopi' } })
  const otherMerchant = await db.merchant.create({ data: { name: 'Synthetic Noodles' } })
  const venue = await db.venue.create({
    data: {
      merchantId: merchant.id,
      name: 'Synthetic Kopi Tampines',
      address: '1 Example Street',
      area: 'Tampines',
      latitude: 1.35,
      longitude: 103.94,
    },
  })
  const sibling = await db.venue.create({
    data: {
      merchantId: merchant.id,
      name: 'Synthetic Kopi Jurong',
      address: '2 Example Street',
      latitude: 1.33,
      longitude: 103.74,
    },
  })
  const link = (venueId: string) => ({ venues: { create: [{ venueId }] } })
  await seedSyntheticOutletProof(db, venue.id)
  await seedSyntheticOutletProof(db, sibling.id)

  const selected = await createVisibleDeal('Selected outlet deal', {
    merchantId: merchant.id,
    validFrom: new Date(now - day),
    validUntil: new Date(now + day),
    ...link(venue.id),
  })
  await db.uploadedFile.create({
    data: {
      key: `synthetic-${randomUUID()}`,
      url: 'https://example.test/deal.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1000,
      uploaderId: uploader.id,
      dealId: selected.id,
    },
  })
  const allOutlets = await createVisibleDeal('All outlets deal', {
    applicability: 'ALL_MERCHANT_OUTLETS',
    merchantId: merchant.id,
    offerType: 'PERCENT_OFF',
    priceMinor: null,
    discountPercent: 20,
    rawValidityText: 'While stocks last',
    publishedAt: new Date(now - 2 * day),
  })
  const pending = await createVisibleDeal('Pending deal', {
    merchantId: merchant.id,
    reviewStatus: 'PENDING',
    ...link(venue.id),
  })
  const staleReview = await createVisibleDeal('Edited after review', {
    merchantId: merchant.id,
    contentVersion: 2,
    ...link(venue.id),
  })
  const unpublished = await createVisibleDeal('Unpublished deal', {
    merchantId: merchant.id,
    publishedAt: null,
    ...link(venue.id),
  })
  const expired = await createVisibleDeal('Expired deal', {
    merchantId: merchant.id,
    validUntil: new Date(now - 1),
    ...link(venue.id),
  })
  const olderExpired = await createVisibleDeal('Older expired outlets deal', {
    applicability: 'ALL_MERCHANT_OUTLETS',
    merchantId: merchant.id,
    offerType: 'BUY_ONE_GET_ONE',
    priceMinor: null,
    validUntil: new Date(now - 3 * day),
  })
  // Pin reviewed positives only, after all final edges; never refresh reviewedVersion.
  await seedSyntheticScope(db, selected.id, 'SOURCE_SELECTED')
  await seedSyntheticScope(db, allOutlets.id, 'SOURCE_ALL')
  await seedSyntheticScope(db, expired.id, 'SOURCE_SELECTED')
  await seedSyntheticScope(db, olderExpired.id, 'SOURCE_ALL')
  const expiredPending = await createVisibleDeal('Expired pending deal', {
    merchantId: merchant.id,
    reviewStatus: 'PENDING',
    validUntil: new Date(now - day),
    ...link(venue.id),
  })
  const expiredDeleted = await createVisibleDeal('Expired deleted deal', {
    merchantId: merchant.id,
    deletedAt: new Date(),
    validUntil: new Date(now - day),
    ...link(venue.id),
  })
  const expiredSibling = await createVisibleDeal('Expired sibling deal', {
    merchantId: merchant.id,
    validUntil: new Date(now - day),
    ...link(sibling.id),
  })
  const future = await createVisibleDeal('Future deal', {
    merchantId: merchant.id,
    validFrom: new Date(now + day),
    ...link(venue.id),
  })
  const deleted = await createVisibleDeal('Deleted deal', {
    merchantId: merchant.id,
    deletedAt: new Date(),
    ...link(venue.id),
  })
  const siblingDeal = await createVisibleDeal('Sibling outlet deal', {
    merchantId: merchant.id,
    ...link(sibling.id),
  })
  const online = await createVisibleDeal('Online deal', {
    applicability: 'ONLINE',
    merchantId: merchant.id,
  })
  const otherMerchantDeal = await createVisibleDeal('Other merchant deal', {
    applicability: 'ALL_MERCHANT_OUTLETS',
    merchantId: otherMerchant.id,
  })
  // Positive scope prerequisites isolate each original moderation/time/selection negative.
  // The helper never touches reviewedVersion, reviewStatus, publication, deletion or edges.
  await seedSyntheticScope(db, pending.id, 'SOURCE_SELECTED')
  await seedSyntheticScope(db, staleReview.id, 'SOURCE_SELECTED')
  await seedSyntheticScope(db, unpublished.id, 'SOURCE_SELECTED')
  await seedSyntheticScope(db, expiredPending.id, 'SOURCE_SELECTED')
  await seedSyntheticScope(db, expiredDeleted.id, 'SOURCE_SELECTED')
  await seedSyntheticScope(db, expiredSibling.id, 'SOURCE_SELECTED')
  await seedSyntheticScope(db, future.id, 'SOURCE_SELECTED')
  await seedSyntheticScope(db, deleted.id, 'SOURCE_SELECTED')
  await seedSyntheticScope(db, siblingDeal.id, 'SOURCE_SELECTED')
  await seedSyntheticScope(db, online.id, 'SOURCE_NONSPATIAL')
  await seedSyntheticScope(db, otherMerchantDeal.id, 'SOURCE_ALL')
  // Preserve the old missing-merchant/unknown-scope shape as an explicit negative.
  await createVisibleDeal('Unconfirmed missing merchant deal', link(venue.id))

  const response = await http().get(`/api/venues/${venue.id}`)
  expect(response.status).toBe(200)
  expect(response.data).toEqual({
    venue: {
      id: venue.id,
      name: 'Synthetic Kopi Tampines',
      address: '1 Example Street',
      area: 'Tampines',
      postalCode: null,
      merchantName: 'Synthetic Kopi',
    },
    deals: [
      {
        id: selected.id,
        title: 'Selected outlet deal',
        category: 'Food',
        offerType: 'FIXED_PRICE',
        priceMinor: 500,
        currency: 'SGD',
        discountPercent: null,
        validUntil: new Date(now + day).toISOString(),
        rawValidityText: null,
        imageUrl: 'https://example.test/deal.jpg',
      },
      {
        id: allOutlets.id,
        title: 'All outlets deal',
        category: 'Food',
        offerType: 'PERCENT_OFF',
        priceMinor: null,
        currency: 'SGD',
        discountPercent: 20,
        validUntil: null,
        rawValidityText: 'While stocks last',
        imageUrl: null,
      },
    ],
    pastDeals: [
      {
        id: expired.id,
        title: 'Expired deal',
        offerType: 'FIXED_PRICE',
        priceMinor: 500,
        currency: 'SGD',
        discountPercent: null,
        validUntil: new Date(now - 1).toISOString(),
      },
      {
        id: olderExpired.id,
        title: 'Older expired outlets deal',
        offerType: 'BUY_ONE_GET_ONE',
        priceMinor: null,
        currency: 'SGD',
        discountPercent: null,
        validUntil: new Date(now - 3 * day).toISOString(),
      },
    ],
  })

  const client = createApiClient(`${baseURL}/api`)
  expect((await client.venues.get(venue.id)).deals.map((deal) => deal.id)).toEqual([
    selected.id,
    allOutlets.id,
  ])
})

it('treats a deal with no end date (null or missing) as ongoing, not past', async () => {
  const merchant = await db.merchant.create({ data: { name: 'Synthetic Hot Pot' } })
  const venue = await db.venue.create({
    data: {
      merchantId: merchant.id,
      name: 'Synthetic Hot Pot Bugis',
      address: '3 Example Street',
      latitude: 1.3,
      longitude: 103.85,
    },
  })
  // The importer stores an explicit null; Prisma's Mongo `lte` orders null before every date,
  // so a bare `validUntil <= now` would count an open-ended deal as already over.
  await seedSyntheticOutletProof(db, venue.id)
  const explicitNull = await createVisibleDeal('Null end outlets deal', {
    applicability: 'ALL_MERCHANT_OUTLETS',
    merchantId: merchant.id,
    validFrom: null,
    validUntil: null,
  })
  const missing = await createVisibleDeal('Missing end outlets deal', {
    applicability: 'ALL_MERCHANT_OUTLETS',
    merchantId: merchant.id,
    publishedAt: new Date(Date.now() - 2 * day),
  })
  await db.$runCommandRaw({
    update: 'Deal',
    updates: [{ q: { _id: { $oid: missing.id } }, u: { $unset: { validUntil: '' } } }],
  })
  // Explicit SYNTHETIC geography, occupancy and final-edge scope prerequisites, independent
  // of the null/unset date assertion. These receipts never change dates or moderation.
  await seedSyntheticScope(db, explicitNull.id, 'SOURCE_ALL')
  await seedSyntheticScope(db, missing.id, 'SOURCE_ALL')

  const response = await http().get(`/api/venues/${venue.id}`)
  expect(response.status).toBe(200)
  expect(response.data.deals.map((deal: { id: string }) => deal.id)).toEqual([
    explicitNull.id,
    missing.id,
  ])
  expect(response.data.pastDeals).toEqual([])
})

it('rejects missing, deleted and malformed venues and non-GET methods', async () => {
  const merchant = await db.merchant.create({ data: { name: 'Synthetic Closed' } })
  const deleted = await db.venue.create({
    data: {
      merchantId: merchant.id,
      name: 'Closed outlet',
      address: '3 Example Street',
      latitude: 1.3,
      longitude: 103.8,
      deletedAt: new Date(),
    },
  })
  const missing = await http().get('/api/venues/aaaaaaaaaaaaaaaaaaaaaaaa')
  expect(missing.status).toBe(404)
  expect(missing.data).toEqual({ error: { code: 'NOT_FOUND', message: 'Venue not found' } })
  expect((await http().get(`/api/venues/${deleted.id}`)).status).toBe(404)
  expect((await http().get('/api/venues/not-an-id')).status).toBe(400)
  const post = await http().post(`/api/venues/${deleted.id}`, {}, { headers: { Origin: origin } })
  expect(post.status).toBe(405)
  expect(post.headers.allow).toBe('GET')

  const client = createApiClient(`${baseURL}/api`)
  await expect(client.venues.get(deleted.id)).rejects.toMatchObject({
    constructor: ApiClientError,
    code: 'NOT_FOUND',
    status: 404,
  })
  expect(() => client.venues.get('not-an-id')).toThrow(ApiClientError)
})
