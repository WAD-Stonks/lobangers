import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { parseConfig } from '@api/config'
import {
  findEligibleCategories,
  findPublicBrowseResult,
  findPublicDealPins,
} from '@api/modules/deals/public-deals'
import {
  registerSyntheticOutletFixtureDatabase,
  seedSyntheticOutletProof,
  seedSyntheticScope,
} from '@api-tests/fixtures/outlet-proof'
import { type DealsQuery, dealsResponseSchema } from '@broke-oclock/contracts/deals'
import { PrismaClient } from '@broke-oclock/db/constructor'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

// Real app/HTTP and Prisma on a fresh loopback replica. No ambient DB, schema push,
// client generation, providers or production evidence. Receipts are synthetic controls.
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let db: PrismaClient
let baseURL = ''
const commands: string[] = []
const now = new Date()
const globals = globalThis as typeof globalThis & { __brokeOclockDb?: PrismaClient }

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const databaseUrl = mongo.getUri(`deals_${randomUUID().replaceAll('-', '')}`)
  if (new URL(databaseUrl).hostname !== '127.0.0.1') throw new Error('Disposable Mongo required')
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  expect(globals.__brokeOclockDb).toBeUndefined()
  const client = new PrismaClient({
    datasourceUrl: databaseUrl,
    log: [{ emit: 'event', level: 'query' }],
  })
  client.$on('query', (event) => commands.push(event.query))
  globals.__brokeOclockDb = client
  db = client
  registerSyntheticOutletFixtureDatabase(db, databaseUrl)

  const merchant = await db.merchant.create({ data: { name: 'Synthetic shared-outlet merchant' } })
  const outlets = []
  for (let index = 0; index < 8; index++) {
    const outlet = await db.venue.create({
      data: {
        merchantId: merchant.id,
        name: index === 0 ? 'Synthetic Changi Airport' : `Synthetic outlet ${index}`,
        address: `${index + 1} Synthetic Road`,
        latitude: 1.3 + index / 100,
        longitude: 103.8,
      },
    })
    outlets.push(outlet)
    await seedSyntheticOutletProof(db, outlet.id)
  }
  const deleted = await db.venue.create({
    data: {
      merchantId: merchant.id,
      name: 'Synthetic deleted selected reference',
      address: '9 Synthetic Road',
      latitude: 1.3,
      longitude: 103.8,
      deletedAt: now,
    },
  })
  for (let index = 0; index < 48; index++) {
    const selected = index % 2 === 0
    const deal = await db.deal.create({
      data: {
        merchantId: merchant.id,
        title: `Synthetic shared offer ${index}`,
        description: 'Synthetic performance fixture; no live data.',
        category: index % 3 === 0 ? 'DRINKS' : 'FOOD',
        offerType: 'FIXED_PRICE',
        priceMinor: 100 + index,
        applicability: selected ? 'SELECTED_OUTLETS' : 'ALL_MERCHANT_OUTLETS',
        reviewStatus: 'APPROVED',
        reviewedVersion: 1,
        publishedAt: new Date(now.getTime() - (index + 1) * 1000),
        ...(selected
          ? {
              venues: {
                create: [outlets[3], deleted, outlets[1], outlets[0]].map((outlet) => {
                  if (!outlet) throw new Error('Missing synthetic outlet')
                  return { venueId: outlet.id }
                }),
              },
            }
          : {}),
      },
    })
    await seedSyntheticScope(db, deal.id, selected ? 'SOURCE_SELECTED' : 'SOURCE_ALL')
  }
  // Category graph must not inherit current-date, price or category filters.
  await db.deal.create({
    data: {
      merchantId: merchant.id,
      title: 'Synthetic expired unconfirmed offer',
      description: 'Synthetic only',
      category: 'EXPIRED_ONLY',
      offerType: 'OTHER',
      applicability: 'ALL_MERCHANT_OUTLETS',
      reviewStatus: 'APPROVED',
      reviewedVersion: 1,
      publishedAt: new Date(now.getTime() - 100_000),
      validUntil: new Date(now.getTime() - 1000),
      terms: 'Not at Changi Airport.',
    },
  })
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
        BETTER_AUTH_SECRET: 'synthetic-test-secret-at-least-32-characters',
        BETTER_AUTH_URL: baseURL,
        WEB_ORIGIN: 'http://localhost:5173',
      }),
    ),
  )
})

afterAll(async () => {
  vi.restoreAllMocks()
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  await db?.$disconnect()
  await mongo?.stop()
  delete globals.__brokeOclockDb
  expect(server?.listening ?? false).toBe(false)
  expect(mongo?.state).toBe('stopped')
  vi.unstubAllEnvs()
})

const originalSerial = async (query: DealsQuery) => ({
  items: await findPublicDealPins(db, query, now),
  categories: await findEligibleCategories(db),
})

it('serves the original public result over anonymous HTTP with unchanged projections', async () => {
  const query = { validNow: 'true', category: 'FOOD', priceMaxMinor: 130 } as const
  const expected = await originalSerial(query)
  const start = commands.length
  const response = await fetch(`${baseURL}/api/deals?validNow=true&category=FOOD&priceMaxMinor=130`)
  expect(response.status).toBe(200)
  expect(dealsResponseSchema.parse(await response.json())).toEqual(expected)
  expect(expected.categories).toEqual(['DRINKS', 'EXPIRED_ONLY', 'FOOD'])
  expect(commands.slice(start).every((query) => /^db\.\w+\.aggregate\(/.test(query))).toBe(true)
})

it('preserves unfiltered parity, deleted-edge confirmations and flagged exclusions without writes', async () => {
  const query = { validNow: 'false' } as const
  const expected = await originalSerial(query)
  const start = commands.length
  expect(await findPublicBrowseResult(db, query, now)).toEqual(expected)
  expect(expected.items).toHaveLength(49)
  expect(expected.items.filter((item) => item.outletUnconfirmed)).toHaveLength(1)
  const fallback = expected.items.find((item) => item.category === 'EXPIRED_ONLY')
  expect(fallback?.venues).toHaveLength(7)
  expect(fallback?.venues.some((venue) => venue.name.includes('Changi Airport'))).toBe(false)
  const head = await fetch(`${baseURL}/api/deals?validNow=false`, { method: 'HEAD' })
  expect(head.status).toBe(200)
  expect(await head.text()).toBe('')
  expect(commands.slice(start).length).toBeGreaterThan(0)
  expect(commands.slice(start).every((query) => /^db\.\w+\.aggregate\(/.test(query))).toBe(true)
})

// Opt-in timing evidence, never a flaky wall-clock CI assertion. Interleave warm runs and
// compare the original serial reads with the combined parallel reader.
it.skipIf(process.env.PUBLIC_QUERY_BENCHMARK !== '1')(
  'measures independent public queries run in parallel',
  async () => {
    const variants = [
      { name: 'serial-rich', run: originalSerial },
      {
        name: 'parallel-rich',
        run: (query: DealsQuery) => findPublicBrowseResult(db, query, now),
      },
    ]
    for (const query of [
      { validNow: 'true' },
      { validNow: 'true', category: 'FOOD', priceMaxMinor: 130 },
    ] satisfies DealsQuery[]) {
      const expected = await originalSerial(query)
      const samples = variants.map(() => [] as { milliseconds: number; commands: number }[])
      for (let iteration = 0; iteration < 9; iteration++) {
        for (let offset = 0; offset < variants.length; offset++) {
          const index = (iteration + offset) % variants.length
          const variant = variants[index]
          const group = samples[index]
          if (!variant || !group) throw new Error('Missing benchmark variant')
          const start = commands.length
          const time = performance.now()
          const result = await variant.run(query)
          const milliseconds = performance.now() - time
          expect(result).toEqual(expected)
          if (iteration >= 2) group.push({ milliseconds, commands: commands.length - start })
        }
      }
      console.info(
        'PUBLIC_QUERY_BENCHMARK',
        JSON.stringify({
          fixture: '48 shared-outlet deals, 8 active outlets, 1 deleted selected reference',
          query,
          items: expected.items.length,
          variants: variants.map((variant, index) => {
            const group = samples[index] ?? []
            const times = group.map((sample) => sample.milliseconds).sort((a, b) => a - b)
            return {
              name: variant.name,
              samples: group.length,
              medianMs: times[Math.floor(times.length / 2)],
              minMs: times[0],
              maxMs: times.at(-1),
              mongoCommands: [...new Set(group.map((sample) => sample.commands))],
            }
          }),
        }),
      )
    }
  },
)
