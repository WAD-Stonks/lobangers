import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import {
  registerSyntheticOutletFixtureDatabase,
  seedSyntheticOutletProof,
  seedSyntheticScope,
} from '@api/../tests/fixtures/outlet-proof'
import { parseConfig } from '@api/config'
import type { DealsResponse } from '@broke-oclock/contracts/deals'
import axios from 'axios'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const DAY_MS = 86_400_000
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let baseURL = ''
let db: typeof import('@broke-oclock/db').db

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const databaseUrl = mongo.getUri(`deals_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  await promisify(execFile)('pnpm', ['--dir', 'packages/db', 'run', 'push'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    timeout: 60_000,
  })
  db = (await import('@broke-oclock/db')).db
  registerSyntheticOutletFixtureDatabase(db, databaseUrl)
  const { createApp } = await import('@api/app')
  server = createServer()
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No disposable HTTP address')
  baseURL = `http://127.0.0.1:${address.port}`
  server.on(
    'request',
    createApp(
      parseConfig({
        DATABASE_URL: databaseUrl,
        BETTER_AUTH_SECRET: 'test-only-shared-secret-at-least-32-characters',
        BETTER_AUTH_URL: baseURL,
        WEB_ORIGIN: 'http://localhost:5173',
      }),
    ),
  )

  const now = new Date()
  const merchant = await db.merchant.create({ data: { name: 'Test Kopi' } })
  const venue = await db.venue.create({
    data: {
      merchantId: merchant.id,
      name: 'Kopi Bedok',
      address: '1 Test Rd',
      latitude: 1.32,
      longitude: 103.93,
    },
  })
  const approved = {
    reviewStatus: 'APPROVED' as const,
    reviewedVersion: 1,
    publishedAt: now,
    validFrom: new Date(now.getTime() - DAY_MS),
  }
  const visible = await db.deal.create({
    data: {
      title: 'Kopi $1',
      description: 'Seed',
      category: 'DRINKS',
      offerType: 'FIXED_PRICE',
      priceMinor: 100,
      applicability: 'ALL_MERCHANT_OUTLETS',
      merchantId: merchant.id,
      ...approved,
    },
  })
  const expired = await db.deal.create({
    data: {
      title: 'Old toast',
      description: 'Seed',
      category: 'FOOD',
      offerType: 'OTHER',
      applicability: 'SELECTED_OUTLETS',
      merchantId: merchant.id,
      ...approved,
      validUntil: new Date(now.getTime() - DAY_MS),
    },
  })
  await db.dealVenue.create({
    data: { dealId: expired.id, venueId: venue.id },
  })
  // Explicit reviewed physical positives; preserve genuine user open-ended validity.
  await seedSyntheticOutletProof(db, venue.id)
  await seedSyntheticScope(db, visible.id, 'SOURCE_ALL')
  await seedSyntheticScope(db, expired.id, 'SOURCE_SELECTED')
  await db.deal.create({
    data: {
      title: 'Pending teh',
      description: 'Seed',
      category: 'DRINKS',
      offerType: 'OTHER',
      applicability: 'ALL_MERCHANT_OUTLETS',
      merchantId: merchant.id,
    },
  })
  // Community evidence: one alive vote, one visible comment and one hidden comment.
  const stamp = { createdAt: now, updatedAt: now }
  const voter = await db.user.create({
    data: { name: 'Voter', email: 'voter@test.local', emailVerified: true, ...stamp },
  })
  await db.dealVote.create({
    data: { dealId: visible.id, userId: voter.id, value: 'ALIVE' },
  })
  await db.comment.create({
    data: { dealId: visible.id, authorId: voter.id, body: 'Still $1 today' },
  })
  await db.comment.create({
    data: { dealId: visible.id, authorId: voter.id, body: 'spam', hiddenAt: now },
  })
}, 180_000)

afterAll(async () => {
  await db?.$disconnect()
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
  await mongo?.stop()
})

const client = () => axios.create({ baseURL, timeout: 5_000, validateStatus: () => true })

describe('GET /api/deals', () => {
  it('lists only approved, current deals with one pin per outlet', async () => {
    const response = await client().get<DealsResponse>('/api/deals')
    expect(response.status).toBe(200)
    expect(response.data.items.map((deal) => deal.title)).toEqual(['Kopi $1'])
    expect(response.data.items[0]?.label).toBe('$1')
    expect(response.data.items[0]?.venues).toHaveLength(1)
    expect(response.data.categories).toEqual(['DRINKS', 'FOOD'])
  })

  it('includes the deal details and read-only review counts for the drawer', async () => {
    const response = await client().get<DealsResponse>('/api/deals')
    const kopi = response.data.items[0]
    expect(kopi?.description).toBe('Seed')
    expect(kopi?.offerType).toBe('FIXED_PRICE')
    expect(kopi?.priceMinor).toBe(100)
    expect(kopi?.terms).toBeNull()
    expect(kopi?.validUntil).toBeNull()
    expect(kopi?.votes).toEqual({ alive: 1, dead: 0, status: 'UNCERTAIN' })
    expect(kopi?.commentCount).toBe(1)
  })

  it('includes expired deals when validNow is off', async () => {
    const response = await client().get<DealsResponse>('/api/deals', {
      params: { validNow: 'false' },
    })
    expect(response.data.items.map((deal) => deal.title).sort()).toEqual(['Kopi $1', 'Old toast'])
  })

  it('rejects unknown query keys and other methods', async () => {
    expect((await client().get('/api/deals', { params: { bogus: 1 } })).status).toBe(400)
    // POST is community submission (merchant-deals.test.ts); everything else is refused.
    const remove = await client().delete('/api/deals')
    expect(remove.status).toBe(405)
    expect(remove.headers.allow).toBe('GET, POST')
  })

  it('derives verification from distinct recent voters, the ratio, approval and expiry', async () => {
    const merchant = await db.merchant.findFirstOrThrow()
    const deal = await db.deal.create({
      data: {
        title: 'Synthetic freshness fixture',
        description: 'Test only',
        category: 'FOOD',
        offerType: 'OTHER',
        applicability: 'ALL_MERCHANT_OUTLETS',
        merchantId: merchant.id,
        reviewStatus: 'APPROVED',
        reviewedVersion: 1,
        publishedAt: new Date(Date.now() - 2 * DAY_MS),
      },
    })
    await seedSyntheticScope(db, deal.id, 'SOURCE_ALL')
    const users = []
    try {
      for (let index = 0; index < 5; index++) {
        const user = await db.user.create({
          data: {
            name: 'Synthetic voter',
            email: `${randomUUID()}@example.test`,
            emailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        })
        users.push(user)
        await db.dealVote.create({
          data: { dealId: deal.id, userId: user.id, value: index === 3 ? 'DEAD' : 'ALIVE' },
        })
      }
      const read = async () =>
        (
          await client().get<DealsResponse>('/api/deals', { params: { validNow: 'false' } })
        ).data.items.find((item) => item.id === deal.id)?.votes
      expect(await read()).toEqual({ alive: 4, dead: 1, status: 'LIKELY_STILL_ON' })
      await db.dealVote.updateMany({
        where: { dealId: deal.id, userId: users[4]?.id },
        data: { updatedAt: new Date(Date.now() - 25 * 3600000) },
      })
      expect(await read()).toEqual({ alive: 3, dead: 1, status: 'UNCERTAIN' })
      await db.deal.update({
        where: { id: deal.id },
        data: { reviewedAt: new Date(Date.now() + 1000) },
      })
      expect(await read()).toEqual({ alive: 0, dead: 0, status: 'NO_RECENT_REPORTS' })
      await db.deal.update({
        where: { id: deal.id },
        data: { validUntil: new Date(Date.now() - 1000) },
      })
      expect((await read())?.status).toBe('EXPIRED')
    } finally {
      await db.dealVote.deleteMany({ where: { dealId: deal.id } })
      await db.deal.delete({ where: { id: deal.id } })
      await db.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } })
    }
  })
})
