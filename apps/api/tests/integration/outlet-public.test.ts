import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { copyFile, mkdtemp, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parseConfig } from '@api/config'
import type { OutletPolicyVenue } from '@api/modules/deals/outlet-eligibility'
import {
  geographySubjectHash,
  occupancySubjectHash,
  outletScopeHash,
} from '@api/modules/deals/outlet-eligibility'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const origin = 'http://localhost:5173'
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let baseURL = ''
let db: typeof import('@broke-oclock/db').db
let user: { id: string; cookie: string }
const accountCall = (method: string, path: string, cookie = user.cookie, requestOrigin = origin) =>
  fetch(`${baseURL}/api${path}`, { method, headers: { Cookie: cookie, Origin: requestOrigin } })
const get = async (path: string) => {
  const response = await fetch(`${baseURL}/api${path}`)
  expect(response.status).toBe(200)
  return response.json()
}

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const databaseUrl = mongo.getUri(`outlet_public_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', databaseUrl)
  const receipts =
    process.env.OUTLET_PUBLIC_RECEIPTS ?? (await mkdtemp(resolve(tmpdir(), 'outlet-public-')))
  const schema = resolve(receipts, 'disposable-schema.prisma')
  await copyFile(resolve(root, 'packages/db/prisma/schema.prisma'), schema)
  // Direct pinned CLI, outside repo dotenv discovery, and never regenerate a shared client.
  const setupCommand = [
    resolve(root, 'packages/db/node_modules/prisma/build/index.js'),
    'db',
    'push',
    '--schema',
    schema,
    '--skip-generate',
  ]
  const setup = await promisify(execFile)(process.execPath, setupCommand, {
    cwd: receipts,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    timeout: 60_000,
  })
  await writeFile(
    resolve(receipts, `${process.env.OUTLET_PUBLIC_RUN_LABEL ?? process.pid}-schema-setup.json`),
    JSON.stringify(
      {
        command: [process.execPath, ...setupCommand],
        cwd: receipts,
        exitCode: 0,
        stdout: setup.stdout,
        stderr: setup.stderr,
      },
      null,
      2,
    ),
  )
  db = (await import('@broke-oclock/db')).db
  const { createApp } = await import('@api/app')
  server = createServer()
  await new Promise<void>((done) => server?.listen(0, '127.0.0.1', done))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No disposable HTTP address')
  baseURL = `http://127.0.0.1:${address.port}`
  server.on(
    'request',
    createApp(
      parseConfig({
        DATABASE_URL: databaseUrl,
        BETTER_AUTH_SECRET: 'outlet-public-synthetic-secret-at-least-32-characters',
        BETTER_AUTH_URL: baseURL,
        WEB_ORIGIN: origin,
      }),
    ),
  )
  const signup = await fetch(`${baseURL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Synthetic public reader',
      email: `outlet-${randomUUID()}@example.test`,
      password: randomBytes(24).toString('base64url'),
    }),
  })
  expect(signup.status).toBe(200)
  user = {
    id: (await signup.json()).user.id,
    cookie: signup.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; '),
  }
}, 180_000)

beforeEach(async () => {
  await db.user.update({ where: { id: user.id }, data: { role: 'USER' } })
  await db.stallGrant.deleteMany()
  await db.bookmark.deleteMany()
  await db.dealVenue.deleteMany()
  await db.deal.deleteMany()
  await db.venue.deleteMany()
  await db.merchant.deleteMany()
})

afterAll(async () => {
  if (server) {
    server.closeAllConnections()
    await new Promise<void>((done) => server?.close(() => done()))
  }
  await db?.$disconnect()
  await mongo?.stop()
  expect(server?.listening ?? false).toBe(false)
  expect(mongo?.state).toBe('stopped')
  console.info('Disposable HTTP and Mongo listeners closed; Prisma disconnected.')
  vi.unstubAllEnvs()
})

const venueFixture = async (merchantId?: string, verified = true) => {
  const merchant = merchantId
    ? { id: merchantId }
    : await db.merchant.create({ data: { name: 'Synthetic brand' } })
  const venue = await db.venue.create({
    data: {
      merchantId: merchant.id,
      name: 'Synthetic outlet',
      address: '1 Synthetic Street',
      latitude: 1.3,
      longitude: 103.8,
      geographyPrecision: 'PROPERTY',
      catalogueKey: `synthetic:${randomUUID()}`,
    },
  })
  if (!verified) return venue
  const evidence = {
    state: 'VERIFIED' as const,
    provider: 'OFFICIAL_MERCHANT' as const,
    reference: 'synthetic:verified',
    verifiedAt: new Date(),
  }
  return db.venue.update({
    where: { id: venue.id },
    data: {
      geographyEvidence: { ...evidence, subjectHash: geographySubjectHash(venue) },
      occupancyEvidence: { ...evidence, subjectHash: occupancySubjectHash(venue) },
    },
  })
}

const dealFixture = async (venue: OutletPolicyVenue, confirmed = true) => {
  const now = new Date()
  const deal = await db.deal.create({
    data: {
      merchantId: venue.merchantId,
      title: 'Synthetic campaign',
      description: 'Synthetic body',
      category: 'FOOD',
      offerType: 'OTHER',
      applicability: 'ALL_MERCHANT_OUTLETS',
      reviewStatus: 'APPROVED',
      reviewedVersion: 1,
      publishedAt: now,
      validFrom: new Date(now.getTime() - 60_000),
      validUntil: new Date(now.getTime() + 60_000),
    },
  })
  if (!confirmed) return deal
  return db.deal.update({
    where: { id: deal.id },
    data: {
      scopeConfirmation: {
        basis: 'SOURCE_ALL',
        contentVersion: 1,
        scopeHash: outletScopeHash({ ...deal, selectedVenueIds: [] }),
        evidenceRef: 'synthetic:campaign',
        retainedVenueIds: [],
        confirmedAt: now,
      },
    },
  })
}

it('map withholds unknown scope without changing approved content', async () => {
  const venue = await venueFixture()
  const unknown = await dealFixture(venue, false)
  const control = await dealFixture(venue)
  const body = await get('/deals')
  expect(body.items.map((row: { id: string }) => row.id)).toEqual([control.id])
  expect(await db.deal.findUniqueOrThrow({ where: { id: unknown.id } })).toMatchObject({
    reviewStatus: 'APPROVED',
    contentVersion: 1,
    reviewedVersion: 1,
    publishedAt: unknown.publishedAt,
  })
})

it('categories require actual public pins while remaining independent of visitor filters', async () => {
  const venue = await venueFixture()
  const unknown = await dealFixture(venue, false)
  await db.deal.update({ where: { id: unknown.id }, data: { category: 'UNKNOWN' } })
  const stale = await dealFixture(venue)
  await db.deal.update({ where: { id: stale.id }, data: { category: 'STALE', reviewedVersion: 0 } })
  const unverified = await dealFixture(await venueFixture(undefined, false))
  await db.deal.update({ where: { id: unverified.id }, data: { category: 'UNVERIFIED' } })
  const expired = await dealFixture(venue)
  await db.deal.update({
    where: { id: expired.id },
    data: { category: 'EXPIRED', validUntil: new Date(0) },
  })
  const body = await get('/deals?category=ABSENT&priceMaxMinor=0&validNow=true')
  expect(body.items).toEqual([])
  expect(body.categories).toEqual(['EXPIRED'])
})

it('venue ongoing and past feeds withhold campaigns with unknown scope', async () => {
  const venue = await venueFixture()
  const unknown = await dealFixture(venue, false)
  const unknownPast = await dealFixture(venue, false)
  await db.deal.update({ where: { id: unknownPast.id }, data: { validUntil: new Date(0) } })
  const current = await dealFixture(venue)
  const past = await dealFixture(venue)
  await db.deal.update({ where: { id: past.id }, data: { validUntil: new Date(0) } })
  const body = await get(`/venues/${venue.id}`)
  expect(body.deals.map((row: { id: string }) => row.id)).toEqual([current.id])
  expect(body.pastDeals.map((row: { id: string }) => row.id)).toEqual([past.id])
  expect(JSON.stringify(body)).not.toContain(unknown.id)
  expect(JSON.stringify(body)).not.toContain(unknownPast.id)
})

it('imported current claims require both known bounds without changing user open-ended policy', async () => {
  const venue = await venueFixture()
  const unknown = await dealFixture(venue)
  await db.deal.update({
    where: { id: unknown.id },
    data: { origin: 'IMPORTED', validFrom: null, validUntil: null },
  })
  const missingStart = await dealFixture(venue)
  await db.deal.update({
    where: { id: missingStart.id },
    data: { origin: 'IMPORTED', validFrom: { unset: true } },
  })
  const missingEnd = await dealFixture(venue)
  await db.deal.update({
    where: { id: missingEnd.id },
    data: { origin: 'IMPORTED', validUntil: { unset: true } },
  })
  const future = await dealFixture(venue)
  await db.deal.update({
    where: { id: future.id },
    data: {
      origin: 'IMPORTED',
      validFrom: new Date(Date.now() + 3_600_000),
      validUntil: new Date(Date.now() + 7_200_000),
    },
  })
  const expired = await dealFixture(venue)
  await db.deal.update({
    where: { id: expired.id },
    data: { origin: 'IMPORTED', validUntil: new Date(0) },
  })
  const known = await dealFixture(venue)
  await db.deal.update({ where: { id: known.id }, data: { origin: 'IMPORTED' } })
  const user = await dealFixture(venue)
  await db.deal.update({ where: { id: user.id }, data: { validFrom: null, validUntil: null } })
  const expected = [known.id, user.id].sort()
  expect(
    (await get('/deals?validNow=true')).items.map((row: { id: string }) => row.id).sort(),
  ).toEqual(expected)

  expect(
    (await get(`/venues/${venue.id}`)).deals.map((row: { id: string }) => row.id).sort(),
  ).toEqual(expected)
  expect((await get('/deals?validNow=false')).items).toHaveLength(7)
})

it('bookmarks retain shells but redact unknown campaign content', async () => {
  const venue = await venueFixture()
  const unknown = await dealFixture(venue, false)
  const control = await dealFixture(venue)
  for (const deal of [unknown, control])
    await db.bookmark.create({ data: { userId: user.id, dealId: deal.id } })
  const response = await accountCall('GET', '/account/bookmarks')
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body.items.find((row: { dealId: string }) => row.dealId === unknown.id)).toMatchObject({
    dealId: unknown.id,
    deal: null,
  })
  expect(body.items.find((row: { dealId: string }) => row.dealId === control.id).deal.title).toBe(
    control.title,
  )
  expect(await db.bookmark.count({ where: { userId: user.id } })).toBe(2)
  expect((await accountCall('PUT', `/account/bookmarks/${unknown.id}`)).status).toBe(404)
  expect((await accountCall('PUT', `/account/bookmarks/${control.id}`)).status).toBe(200)
})

it.each(['ONLINE', 'NO_FIXED_LOCATION'] as const)(
  'confirmed %s bookmarks need no fabricated map point',
  async (applicability) => {
    const venue = await venueFixture()
    const confirmed = await dealFixture(venue, false)
    const updated = await db.deal.update({
      where: { id: confirmed.id },
      data: { applicability, merchantId: null },
    })
    await db.deal.update({
      where: { id: updated.id },
      data: {
        scopeConfirmation: {
          basis: 'SOURCE_NONSPATIAL',
          contentVersion: 1,
          scopeHash: outletScopeHash({ ...updated, selectedVenueIds: [] }),
          evidenceRef: 'synthetic:online',
          retainedVenueIds: [],
          confirmedAt: new Date(),
        },
      },
    })
    const unknown = await dealFixture(venue, false)
    await db.deal.update({ where: { id: unknown.id }, data: { applicability, merchantId: null } })
    expect((await accountCall('PUT', `/account/bookmarks/${confirmed.id}`)).status).toBe(200)
    expect((await accountCall('PUT', `/account/bookmarks/${unknown.id}`)).status).toBe(404)
    const body = await (await accountCall('GET', '/account/bookmarks')).json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0].deal.title).toBe(confirmed.title)
    expect((await get('/deals')).items).toEqual([])
    expect((await get('/deals')).categories).toEqual([])
  },
)

it('public venue pages require outlet proofs even with no campaign', async () => {
  const unknown = await venueFixture(undefined, false)
  const verified = await venueFixture()
  expect((await fetch(`${baseURL}/api/venues/${unknown.id}`)).status).toBe(404)
  const body = await get(`/venues/${verified.id}`)
  expect(body.venue.id).toBe(verified.id)
  expect(body.deals).toEqual([])
  expect(body.pastDeals).toEqual([])
})

it('legacy receipts retain exact outlets without enrolling a new branch or lending source proof', async () => {
  const old = await venueFixture(undefined, false)
  const evidence = {
    state: 'LEGACY_RETAINED' as const,
    provider: 'DATABASE_SNAPSHOT' as const,
    reference: 'synthetic:baseline',
  }
  await db.venue.update({
    where: { id: old.id },
    data: {
      geographyEvidence: { ...evidence, subjectHash: geographySubjectHash(old) },
      occupancyEvidence: { ...evidence, subjectHash: occupancySubjectHash(old) },
    },
  })
  const campaign = await dealFixture(old, false)
  await db.deal.update({
    where: { id: campaign.id },
    data: {
      origin: 'IMPORTED',
      validFrom: null,
      validUntil: null,
      scopeConfirmation: {
        basis: 'LEGACY_RETAINED',
        contentVersion: 1,
        scopeHash: outletScopeHash({ ...campaign, selectedVenueIds: [] }),
        evidenceRef: 'synthetic:baseline:campaign',
        retainedVenueIds: [old.id],
      },
    },
  })
  const added = await venueFixture(old.merchantId)
  const freshCampaign = await dealFixture(old)
  const body = await get('/deals?validNow=false')
  expect(
    body.items
      .find((row: { id: string }) => row.id === campaign.id)
      .venues.map((row: { id: string }) => row.id),
  ).toEqual([old.id])
  expect(
    body.items
      .find((row: { id: string }) => row.id === freshCampaign.id)
      .venues.map((row: { id: string }) => row.id),
  ).toEqual([added.id])
  expect((await get(`/venues/${old.id}`)).deals).toEqual([])
  expect((await get(`/venues/${added.id}`)).deals.map((row: { id: string }) => row.id)).toEqual([
    freshCampaign.id,
  ])
  expect((await accountCall('PUT', `/account/bookmarks/${campaign.id}`)).status).toBe(200)
})

// Characterization coverage of the now-shared policy. These cases are not new feature REDs.
const selectedFixture = async () => {
  const venue = await venueFixture()
  const initial = await dealFixture(venue, false)
  const deal = await db.deal.update({
    where: { id: initial.id },
    data: { applicability: 'SELECTED_OUTLETS' },
  })
  await db.dealVenue.create({ data: { dealId: deal.id, venueId: venue.id } })
  const scopeConfirmation = {
    basis: 'SOURCE_SELECTED' as const,
    contentVersion: 1,
    scopeHash: outletScopeHash({ ...deal, selectedVenueIds: [venue.id] }),
    evidenceRef: 'synthetic:selected',
    retainedVenueIds: [],
    confirmedAt: new Date(),
  }
  return {
    venue,
    deal: await db.deal.update({ where: { id: deal.id }, data: { scopeConfirmation } }),
    scopeConfirmation,
  }
}

it.each([
  'scope missing',
  'scope null',
  'scope UNCONFIRMED',
  'scope stale version',
  'scope stale hash',
  'approval stale version',
  'approval pending',
  'publication null',
  'deal deleted',
  'geography missing',
  'geography null',
  'geography UNVERIFIED',
  'geography stale hash',
  'occupancy missing',
  'occupancy null',
  'occupancy ONEMAP',
  'occupancy GOOGLE_PLACES',
  'occupancy stale hash',
  'identity address drift',
  'invalid coordinates',
  'merchant deleted',
  'venue deleted',
  'merchant mismatch',
] as const)(
  'characterization: %s agrees across map, categories, venue history and bookmarks',
  async (failure) => {
    const { venue, deal, scopeConfirmation } = await selectedFixture()
    const geographyEvidence = venue.geographyEvidence
    const occupancyEvidence = venue.occupancyEvidence
    if (!geographyEvidence || !occupancyEvidence)
      throw new Error('Verified fixture requires both proofs')
    switch (failure) {
      case 'scope missing':
        await db.deal.update({
          where: { id: deal.id },
          data: { scopeConfirmation: { unset: true } },
        })
        break
      case 'scope null':
        await db.deal.update({ where: { id: deal.id }, data: { scopeConfirmation: null } })
        break
      case 'scope UNCONFIRMED':
        await db.deal.update({
          where: { id: deal.id },
          data: { scopeConfirmation: { ...scopeConfirmation, basis: 'UNCONFIRMED' } },
        })
        break
      case 'scope stale version':
        await db.deal.update({
          where: { id: deal.id },
          data: { scopeConfirmation: { ...scopeConfirmation, contentVersion: 2 } },
        })
        break
      case 'scope stale hash':
        await db.deal.update({
          where: { id: deal.id },
          data: { scopeConfirmation: { ...scopeConfirmation, scopeHash: '0'.repeat(64) } },
        })
        break
      case 'approval stale version':
        await db.deal.update({ where: { id: deal.id }, data: { reviewedVersion: 0 } })
        break
      case 'approval pending':
        await db.deal.update({ where: { id: deal.id }, data: { reviewStatus: 'PENDING' } })
        break
      case 'publication null':
        await db.deal.update({ where: { id: deal.id }, data: { publishedAt: null } })
        break
      case 'deal deleted':
        await db.deal.update({ where: { id: deal.id }, data: { deletedAt: new Date() } })
        break
      case 'geography missing':
        await db.venue.update({
          where: { id: venue.id },
          data: { geographyEvidence: { unset: true } },
        })
        break
      case 'geography null':
        await db.venue.update({ where: { id: venue.id }, data: { geographyEvidence: null } })
        break
      case 'geography UNVERIFIED':
        await db.venue.update({
          where: { id: venue.id },
          data: { geographyEvidence: { ...geographyEvidence, state: 'UNVERIFIED' } },
        })
        break
      case 'geography stale hash':
        await db.venue.update({
          where: { id: venue.id },
          data: { geographyEvidence: { ...geographyEvidence, subjectHash: '0'.repeat(64) } },
        })
        break
      case 'occupancy missing':
        await db.venue.update({
          where: { id: venue.id },
          data: { occupancyEvidence: { unset: true } },
        })
        break
      case 'occupancy null':
        await db.venue.update({ where: { id: venue.id }, data: { occupancyEvidence: null } })
        break
      case 'occupancy ONEMAP':
        await db.venue.update({
          where: { id: venue.id },
          data: { occupancyEvidence: { ...occupancyEvidence, provider: 'ONEMAP' } },
        })
        break
      case 'occupancy GOOGLE_PLACES':
        await db.venue.update({
          where: { id: venue.id },
          data: { occupancyEvidence: { ...occupancyEvidence, provider: 'GOOGLE_PLACES' } },
        })
        break
      case 'occupancy stale hash':
        await db.venue.update({
          where: { id: venue.id },
          data: { occupancyEvidence: { ...occupancyEvidence, subjectHash: '0'.repeat(64) } },
        })
        break
      case 'identity address drift':
        await db.venue.update({ where: { id: venue.id }, data: { address: '2 Different Street' } })
        break
      case 'invalid coordinates': {
        const changed = { ...venue, latitude: 91 }
        await db.venue.update({
          where: { id: venue.id },
          data: {
            latitude: changed.latitude,
            geographyEvidence: {
              ...geographyEvidence,
              subjectHash: geographySubjectHash(changed),
            },
            occupancyEvidence: {
              ...occupancyEvidence,
              subjectHash: occupancySubjectHash(changed),
            },
          },
        })
        break
      }
      case 'merchant deleted':
        await db.merchant.update({
          where: { id: venue.merchantId },
          data: { deletedAt: new Date() },
        })
        break
      case 'venue deleted':
        await db.venue.update({ where: { id: venue.id }, data: { deletedAt: new Date() } })
        break
      case 'merchant mismatch': {
        const other = await db.merchant.create({ data: { name: 'Other synthetic merchant' } })
        const changed = { ...venue, merchantId: other.id }
        await db.venue.update({
          where: { id: venue.id },
          data: {
            merchantId: other.id,
            geographyEvidence: {
              ...geographyEvidence,
              subjectHash: geographySubjectHash(changed),
            },
            occupancyEvidence: {
              ...occupancyEvidence,
              subjectHash: occupancySubjectHash(changed),
            },
          },
        })
        break
      }
    }
    await db.bookmark.create({ data: { userId: user.id, dealId: deal.id } })
    const map = await get('/deals?validNow=false')
    expect(map.items).toEqual([])
    expect(map.categories).toEqual([])
    const expectedVenueStatus =
      failure.startsWith('scope ') ||
      failure.startsWith('approval ') ||
      ['publication null', 'deal deleted', 'merchant mismatch'].includes(failure)
        ? 200
        : 404
    const page = await fetch(`${baseURL}/api/venues/${venue.id}`)
    expect(page.status).toBe(expectedVenueStatus)
    if (page.status === 200) {
      const body = await page.json()
      expect(body.deals).toEqual([])
      expect(body.pastDeals).toEqual([])
    }
    // The past path must independently apply the same publication policy.
    await db.deal.update({ where: { id: deal.id }, data: { validUntil: new Date(0) } })
    const past = await fetch(`${baseURL}/api/venues/${venue.id}`)
    expect(past.status).toBe(expectedVenueStatus)
    if (past.status === 200) expect((await past.json()).pastDeals).toEqual([])
    const bookmarks = await (await accountCall('GET', '/account/bookmarks')).json()
    expect(bookmarks.items).toHaveLength(1)
    expect(bookmarks.items[0]).toMatchObject({ dealId: deal.id, deal: null })
    expect((await accountCall('PUT', `/account/bookmarks/${deal.id}`)).status).toBe(404)
    expect(await db.bookmark.count({ where: { dealId: deal.id, userId: user.id } })).toBe(1)
  },
)

it('characterization: selected scope hashes include deleted edges before filtering public points', async () => {
  const { venue, deal, scopeConfirmation } = await selectedFixture()
  const closed = await venueFixture(venue.merchantId)
  await db.venue.update({ where: { id: closed.id }, data: { deletedAt: new Date() } })
  await db.dealVenue.create({ data: { dealId: deal.id, venueId: closed.id } })
  // The unchanged receipt must be invalidated even though this edge can never draw a pin.
  expect((await get('/deals?validNow=false')).items).toEqual([])
  expect((await accountCall('PUT', `/account/bookmarks/${deal.id}`)).status).toBe(404)
  await db.deal.update({
    where: { id: deal.id },
    data: {
      scopeConfirmation: {
        ...scopeConfirmation,
        scopeHash: outletScopeHash({ ...deal, selectedVenueIds: [closed.id, venue.id] }),
      },
    },
  })
  const map = await get('/deals?validNow=false')
  expect(map.items).toHaveLength(1)
  expect(map.items[0].venues.map((row: { id: string }) => row.id)).toEqual([venue.id])
  expect(map.categories).toEqual(['FOOD'])
  expect((await get(`/venues/${venue.id}`)).deals.map((row: { id: string }) => row.id)).toEqual([
    deal.id,
  ])
  expect((await accountCall('PUT', `/account/bookmarks/${deal.id}`)).status).toBe(200)
  expect(await db.bookmark.count({ where: { dealId: deal.id, userId: user.id } })).toBe(1)
})

it('characterization: imported finite window includes its start and excludes its end', async () => {
  const { findPublicDeals } = await import('@api/modules/deals/public-deals')
  const venue = await venueFixture()
  const now = new Date('2030-01-01T12:00:00.000Z')
  const atStart = await dealFixture(venue)
  const atEnd = await dealFixture(venue)
  const nullStart = await dealFixture(venue)
  await db.deal.update({
    where: { id: atStart.id },
    data: { origin: 'IMPORTED', validFrom: now, validUntil: new Date(now.getTime() + 1) },
  })
  await db.deal.update({
    where: { id: atEnd.id },
    data: { origin: 'IMPORTED', validFrom: new Date(now.getTime() - 1), validUntil: now },
  })
  await db.deal.update({
    where: { id: nullStart.id },
    data: { origin: 'IMPORTED', validFrom: null, validUntil: new Date(now.getTime() + 1) },
  })
  expect((await findPublicDeals(db, { validNow: 'true' }, now)).map((row) => row.id)).toEqual([
    atStart.id,
  ])
})

it('characterization: public holds preserve private submissions and existing grant history', async () => {
  const venue = await venueFixture(undefined, false)
  const deal = await dealFixture(venue, false)
  await db.deal.update({ where: { id: deal.id }, data: { submittedById: user.id } })
  const grant = await db.stallGrant.create({ data: { userId: user.id, venueId: venue.id } })
  const before = await db.deal.findUniqueOrThrow({ where: { id: deal.id } })
  expect((await get('/deals')).items).toEqual([])
  expect((await accountCall('PUT', `/account/bookmarks/${deal.id}`)).status).toBe(404)
  const submissions = await accountCall('GET', '/account/submissions')
  expect(submissions.status).toBe(200)
  expect((await submissions.json()).items).toEqual([
    expect.objectContaining({ id: deal.id, title: deal.title, reviewStatus: 'APPROVED' }),
  ])
  expect((await accountCall('GET', `/admin/accounts/${user.id}`)).status).toBe(403)
  await db.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } })
  const history = await accountCall('GET', `/admin/accounts/${user.id}`)
  expect(history.status).toBe(200)
  expect((await history.json()).grants).toEqual([
    expect.objectContaining({ id: grant.id, venueId: venue.id, venueName: venue.name }),
  ])
  expect(await db.stallGrant.findUniqueOrThrow({ where: { id: grant.id } })).toEqual(grant)
  expect(await db.deal.findUniqueOrThrow({ where: { id: deal.id } })).toEqual(before)
})

it('characterization: bookmark policy retains native authentication and trusted-origin guards', async () => {
  const deal = await dealFixture(await venueFixture())
  expect((await accountCall('GET', '/account/bookmarks', '')).status).toBe(401)
  expect((await accountCall('PUT', `/account/bookmarks/${deal.id}`, '')).status).toBe(401)
  expect(
    (
      await accountCall(
        'PUT',
        `/account/bookmarks/${deal.id}`,
        user.cookie,
        'https://untrusted.example',
      )
    ).status,
  ).toBe(403)
  expect(await db.bookmark.count()).toBe(0)
})
