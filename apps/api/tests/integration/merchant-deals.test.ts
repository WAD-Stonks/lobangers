import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import {
  registerSyntheticOutletFixtureDatabase,
  seedSyntheticOccupancy,
  seedSyntheticOutletProof,
} from '@api/../tests/fixtures/outlet-proof'
import { parseConfig } from '@api/config'
import { createRateLimiter } from '@api/modules/assistant/runtime'
import type { PlacesRuntime } from '@api/modules/deals/community-stalls'
import { hasConfirmedOutletScope } from '@api/modules/deals/outlet-eligibility'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Merchant promotions (/api/merchant/...) and community submissions (POST /api/deals),
// through real HTTP against a disposable replica set. All stalls and receipts are SYNTHETIC.

const origin = 'http://localhost:5173'
const root = fileURLToPath(new URL('../../../../', import.meta.url))
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let db: typeof import('@broke-oclock/db').db
let baseURL = ''

const syntheticPlaces = [
  {
    placeId: 'SyntheticPlace_Hawker01',
    name: 'Synthetic Hawker Stall',
    address: '1 Synthetic Ave, #01-01, Singapore 000001',
    postalCode: '000001',
    latitude: 1.3,
    longitude: 103.85,
  },
  {
    placeId: 'SyntheticPlace_Imported3',
    name: 'Synthetic Noodle Bar (Synthetic Mall)',
    address: '3 Synthetic Ave, #02-02 Synthetic Mall, Singapore 000003',
    postalCode: null,
    latitude: 1.35,
    longitude: 103.9,
  },
  {
    placeId: 'SyntheticPlace_Bakery02',
    name: 'Synthetic Bakery',
    address: '2 Synthetic Ave, Singapore 000002',
    postalCode: '000002',
    latitude: 1.31,
    longitude: 103.86,
  },
]
const placeLookups: string[] = []
const fakePlaces: PlacesRuntime = {
  client: {
    search: async (query) =>
      syntheticPlaces.filter((place) => place.name.toLowerCase().includes(query.toLowerCase())),
    get: async (placeId) => {
      placeLookups.push(placeId)
      const place = syntheticPlaces.find((candidate) => candidate.placeId === placeId)
      if (!place) throw Object.assign(new Error('missing'), { code: 'NOT_FOUND' })
      return place
    },
  },
  limiter: createRateLimiter({ visitorLimit: 1_000, globalLimit: 1_000 }),
}

type Account = { id: string; cookie: string }
let merchant: Account
let otherMerchant: Account
let member: Account

const signUp = async (name: string): Promise<Account> => {
  const response = await fetch(`${baseURL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      name,
      email: `deals-${randomUUID()}@example.test`,
      password: randomBytes(24).toString('base64url'),
    }),
  })
  expect(response.status).toBe(200)
  const body = await response.json()
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
  return { id: body.user.id as string, cookie }
}

const call = async (
  account: Account | null,
  method: string,
  path: string,
  body?: unknown,
  requestOrigin = origin,
) => {
  const response = await fetch(`${baseURL}/api${path}`, {
    method,
    headers: {
      ...(account ? { Cookie: account.cookie } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      Origin: requestOrigin,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  // Deleting answers 204 with no body.
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

const brand = async (name: string, outlets: number) => {
  const created = await db.merchant.create({ data: { name: `Synthetic ${name}` } })
  const venues = []
  for (let index = 0; index < outlets; index += 1) {
    venues.push(
      await db.venue.create({
        data: {
          merchantId: created.id,
          name: `Synthetic ${name} outlet ${index + 1}`,
          address: `${index + 1} Synthetic Road`,
          latitude: 1.3 + index / 100,
          longitude: 103.8,
        },
      }),
    )
  }
  return venues
}

const grant = (userId: string, venueId: string) =>
  db.stallGrant.create({ data: { userId, venueId } })

const dealBody = (outletIds: string[], overrides: Record<string, unknown> = {}) => ({
  title: '1-for-1 chicken rice',
  description: 'Buy one plate, get one free.',
  category: 'FOOD',
  cuisine: 'CHINESE',
  outletIds,
  offerType: 'BUY_ONE_GET_ONE',
  discountPercent: null,
  priceCents: null,
  startDate: '',
  endDate: '',
  terms: 'Dine-in only',
  photoKey: null,
  ...overrides,
})

const photo = async (uploaderId: string) =>
  db.uploadedFile.create({
    data: {
      key: `synthetic-${randomUUID()}`,
      url: 'https://synthetic.example.test/photo.webp',
      mimeType: 'image/webp',
      sizeBytes: 128,
      uploaderId,
    },
  })

const ids = (items: { id: string }[]) => items.map((item) => item.id)

const scopeOf = async (dealId: string) => {
  const deal = await db.deal.findUniqueOrThrow({
    where: { id: dealId },
    include: { venues: true },
  })
  return {
    deal,
    confirmed: hasConfirmedOutletScope({
      ...deal,
      selectedVenueIds: deal.venues.map((link) => link.venueId),
    }),
  }
}

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
    // Windows exposes pnpm as a .cmd shim, which only resolves through a shell.
    shell: process.platform === 'win32',
  })
  db = (await import('@broke-oclock/db')).db
  registerSyntheticOutletFixtureDatabase(db, databaseUrl)
  const { createApp } = await import('@api/app')
  server = createServer()
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing disposable HTTP listener')
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
      { places: fakePlaces },
    ),
  )
  merchant = await signUp('Synthetic merchant')
  otherMerchant = await signUp('Synthetic other merchant')
  member = await signUp('Synthetic member')
  await db.user.updateMany({
    where: { id: { in: [merchant.id, otherMerchant.id] } },
    data: { role: 'MERCHANT' },
  })
}, 180_000)

afterAll(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  await db?.$disconnect()
  await mongo?.stop()
  vi.unstubAllEnvs()
})

describe('merchant promotions', () => {
  it('lists only the outlets the merchant holds an active grant for', async () => {
    const [a, b] = await brand('Outlets', 2)
    const [elsewhere] = await brand('Elsewhere', 1)
    await grant(merchant.id, a.id)
    await grant(merchant.id, b.id)
    await grant(otherMerchant.id, elsewhere.id)
    await db.stallGrant.update({
      where: { userId_venueId: { userId: merchant.id, venueId: b.id } },
      data: { revokedAt: new Date() },
    })

    const outlets = await call(merchant, 'GET', '/merchant/outlets')
    expect(outlets.status).toBe(200)
    expect(outlets.body.items).toContainEqual({ id: a.id, name: a.name, address: a.address })
    expect(outlets.body.items.map((item: { id: string }) => item.id)).not.toContain(b.id)
    expect(outlets.body.items.map((item: { id: string }) => item.id)).not.toContain(elsewhere.id)
  })

  it('refuses visitors, non-merchants and unknown query fields', async () => {
    expect((await call(null, 'GET', '/merchant/deals')).status).toBe(401)
    expect((await call(member, 'GET', '/merchant/outlets')).status).toBe(403)
    expect((await call(member, 'GET', '/merchant/deals')).status).toBe(403)
    expect((await call(merchant, 'GET', '/merchant/deals?all=true')).status).toBe(400)
    expect((await call(merchant, 'DELETE', '/merchant/deals')).status).toBe(405)
  })

  it('publishes a deal at several granted outlets with a confirmed scope', async () => {
    const [a, b] = await brand('Publish', 2)
    await grant(merchant.id, a.id)
    await grant(merchant.id, b.id)

    const created = await call(
      merchant,
      'POST',
      '/merchant/deals',
      dealBody([a.id, b.id], { startDate: '2026-11-01', endDate: '2099-11-30' }),
    )
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({
      title: '1-for-1 chicken rice',
      category: 'FOOD',
      cuisine: 'CHINESE',
      outletIds: [a.id, b.id],
      startDate: '2026-11-01',
      endDate: '2099-11-30',
      endedAt: null,
    })

    const { deal, confirmed } = await scopeOf(created.body.id)
    expect(confirmed).toBe(true)
    expect(deal).toMatchObject({
      reviewStatus: 'APPROVED',
      contentVersion: 1,
      reviewedVersion: 1,
      submittedById: merchant.id,
      merchantId: a.merchantId,
      applicability: 'SELECTED_OUTLETS',
    })
    expect(deal.publishedAt).toBeInstanceOf(Date)
    // Singapore days become the first instant and the exclusive end.
    expect(deal.validFrom?.toISOString()).toBe('2026-10-31T16:00:00.000Z')
    expect(deal.validUntil?.toISOString()).toBe('2099-11-30T16:00:00.000Z')

    const listed = await call(merchant, 'GET', '/merchant/deals')
    expect(listed.body.items.map((item: { id: string }) => item.id)).toContain(created.body.id)
    const theirs = await call(otherMerchant, 'GET', '/merchant/deals')
    expect(theirs.body.items.map((item: { id: string }) => item.id)).not.toContain(created.body.id)
  })

  it('appears on the public map once the outlet is verified, and leaves it when ended', async () => {
    const [outlet] = await brand('Public', 1)
    await seedSyntheticOutletProof(db, outlet.id)
    await grant(merchant.id, outlet.id)
    const created = await call(merchant, 'POST', '/merchant/deals', dealBody([outlet.id]))
    expect(created.status).toBe(201)

    const publicIds = async () =>
      (await call(null, 'GET', '/deals')).body.items.map((item: { id: string }) => item.id)
    expect(await publicIds()).toContain(created.body.id)

    const ended = await call(merchant, 'POST', `/merchant/deals/${created.body.id}/end`)
    expect(ended.status).toBe(200)
    expect(ended.body.endedAt).not.toBeNull()
    expect(await publicIds()).not.toContain(created.body.id)
  })

  it('refuses outlets without a grant and outlets of different merchants, writing nothing', async () => {
    const [mine] = await brand('Mine', 1)
    const [notMine] = await brand('Not mine', 1)
    const [secondBrand] = await brand('Second brand', 1)
    await grant(merchant.id, mine.id)
    await grant(merchant.id, secondBrand.id)
    const before = await db.deal.count()

    expect(
      (await call(merchant, 'POST', '/merchant/deals', dealBody([mine.id, notMine.id]))).status,
    ).toBe(403)
    const mixed = await call(
      merchant,
      'POST',
      '/merchant/deals',
      dealBody([mine.id, secondBrand.id]),
    )
    expect(mixed.status).toBe(400)
    expect(mixed.body.error.message).toBe('All outlets must belong to the same merchant')
    expect(await db.deal.count()).toBe(before)
  })

  it('rejects untrusted origins and invalid bodies', async () => {
    const [outlet] = await brand('Validation', 1)
    await grant(merchant.id, outlet.id)
    const post = (body: unknown, requestOrigin?: string) =>
      call(merchant, 'POST', '/merchant/deals', body, requestOrigin)

    expect((await post(dealBody([outlet.id]), 'https://evil.example')).status).toBe(403)
    for (const body of [
      dealBody([outlet.id], { discountPercent: 20 }), // discount without % off
      dealBody([outlet.id], { offerType: 'FIXED_PRICE' }), // fixed price without a price
      dealBody([outlet.id], { startDate: '2099-05-02', endDate: '2099-05-01' }),
      dealBody([outlet.id], { endDate: '2099-02-30' }), // no such day
      dealBody([outlet.id, outlet.id]),
      dealBody([]),
      dealBody([outlet.id], { category: 'PIZZA' }),
      { ...dealBody([outlet.id]), reviewStatus: 'APPROVED' }, // unknown field
    ])
      expect((await post(body)).status).toBe(400)
    const past = await post(dealBody([outlet.id], { endDate: '2020-01-01' }))
    expect(past.status).toBe(400)
    expect(past.body.error.message).toBe('The last day cannot be in the past')
  })

  it('edits a live deal as a new approved version, but only for its own merchant', async () => {
    const [a, b] = await brand('Edit', 2)
    await grant(merchant.id, a.id)
    await grant(merchant.id, b.id)
    const created = await call(merchant, 'POST', '/merchant/deals', dealBody([a.id]))

    const edited = await call(
      merchant,
      'PATCH',
      `/merchant/deals/${created.body.id}`,
      dealBody([b.id], { offerType: 'PERCENT_OFF', discountPercent: 30, cuisine: null }),
    )
    expect(edited.status).toBe(200)
    expect(edited.body).toMatchObject({
      outletIds: [b.id],
      offerType: 'PERCENT_OFF',
      discountPercent: 30,
      cuisine: null,
    })
    const { deal, confirmed } = await scopeOf(created.body.id)
    expect(confirmed).toBe(true)
    expect(deal).toMatchObject({ contentVersion: 2, reviewedVersion: 2 })
    expect(deal.venues.map((link) => link.venueId)).toEqual([b.id])

    // Someone else's deal looks missing; a member gets no merchant access at all.
    const path = `/merchant/deals/${created.body.id}`
    expect((await call(otherMerchant, 'PATCH', path, dealBody([b.id]))).status).toBe(404)
    expect((await call(member, 'POST', `${path}/end`)).status).toBe(403)
    expect(
      (await call(merchant, 'PATCH', `/merchant/deals/${'0'.repeat(24)}`, dealBody([b.id]))).status,
    ).toBe(404)
  })

  it('ends a deal once, then keeps it read-only', async () => {
    const [outlet] = await brand('End', 1)
    await grant(merchant.id, outlet.id)
    const created = await call(merchant, 'POST', '/merchant/deals', dealBody([outlet.id]))
    const path = `/merchant/deals/${created.body.id}`

    const ended = await call(merchant, 'POST', `${path}/end`)
    expect(ended.status).toBe(200)
    const again = await call(merchant, 'POST', `${path}/end`)
    expect(again.body.endedAt).toBe(ended.body.endedAt)
    expect((await scopeOf(created.body.id)).deal.contentVersion).toBe(2)

    const edit = await call(merchant, 'PATCH', path, dealBody([outlet.id]))
    expect(edit.status).toBe(412)
    expect(edit.body.error.message).toBe('Ended deals cannot be edited')
  })

  it('deletes a scheduled or ended deal, but a live one has to be ended first', async () => {
    const [outlet] = await brand('Delete', 1)
    await seedSyntheticOutletProof(db, outlet.id)
    await grant(merchant.id, outlet.id)
    const create = async (overrides: Record<string, unknown> = {}) =>
      (await call(merchant, 'POST', '/merchant/deals', dealBody([outlet.id], overrides))).body
    const listed = async () => ids((await call(merchant, 'GET', '/merchant/deals')).body.items)
    const remove = (id: string, account = merchant) =>
      call(account, 'DELETE', `/merchant/deals/${id}`)

    const live = await create()
    const refused = await remove(live.id)
    expect(refused.status).toBe(412)
    expect(refused.body.error.message).toBe('End this deal before deleting it')

    const scheduled = await create({ startDate: '2099-01-01' })
    expect((await remove(scheduled.id, otherMerchant)).status).toBe(404)
    expect((await remove(scheduled.id, member)).status).toBe(403)
    expect((await remove(scheduled.id)).status).toBe(204)
    expect(await listed()).not.toContain(scheduled.id)
    expect(
      (await db.deal.findUniqueOrThrow({ where: { id: scheduled.id } })).deletedAt,
    ).toBeInstanceOf(Date)
    // A deleted deal is gone for the merchant: no edits, no second delete.
    expect(
      (await call(merchant, 'PATCH', `/merchant/deals/${scheduled.id}`, dealBody([outlet.id])))
        .status,
    ).toBe(404)
    expect((await remove(scheduled.id)).status).toBe(404)

    // Ending a live deal keeps it in history; it can be deleted after that.
    await call(merchant, 'POST', `/merchant/deals/${live.id}/end`)
    expect(await listed()).toContain(live.id)
    expect((await remove(live.id)).status).toBe(204)
    expect(await listed()).not.toContain(live.id)
    const publicIds = ids((await call(null, 'GET', '/deals')).body.items)
    expect(publicIds).not.toContain(live.id)
  })

  it('hides and locks deals at an outlet whose grant was revoked', async () => {
    const [outlet] = await brand('Revoked', 1)
    const access = await grant(merchant.id, outlet.id)
    const created = await call(merchant, 'POST', '/merchant/deals', dealBody([outlet.id]))
    await db.stallGrant.update({ where: { id: access.id }, data: { revokedAt: new Date() } })

    const listed = await call(merchant, 'GET', '/merchant/deals')
    expect(listed.body.items.map((item: { id: string }) => item.id)).not.toContain(created.body.id)
    expect((await call(merchant, 'POST', `/merchant/deals/${created.body.id}/end`)).status).toBe(
      403,
    )
  })
})

describe('merchant deal photos', () => {
  it('saves a deal with the merchant’s own unused photo', async () => {
    const [outlet] = await brand('Photo create', 1)
    await grant(merchant.id, outlet.id)
    const file = await photo(merchant.id)

    const created = await call(
      merchant,
      'POST',
      '/merchant/deals',
      dealBody([outlet.id], { photoKey: file.key }),
    )
    expect(created.status).toBe(201)
    expect(created.body.photo).toEqual({ key: file.key, url: file.url })
    const stored = await db.uploadedFile.findUniqueOrThrow({ where: { key: file.key } })
    expect(stored.dealId).toBe(created.body.id)

    const listed = await call(merchant, 'GET', '/merchant/deals')
    const item = listed.body.items.find((deal: { id: string }) => deal.id === created.body.id)
    expect(item.photo).toEqual({ key: file.key, url: file.url })
  })

  it('saves a deal without a photo, since it is optional', async () => {
    const [outlet] = await brand('Photo none', 1)
    await grant(merchant.id, outlet.id)
    const created = await call(merchant, 'POST', '/merchant/deals', dealBody([outlet.id]))
    expect(created.status).toBe(201)
    expect(created.body.photo).toBeNull()
  })

  it('refuses someone else’s, a used or an unknown photo, writing nothing', async () => {
    const [outlet] = await brand('Photo refuse', 1)
    await grant(merchant.id, outlet.id)
    const someoneElses = await photo(member.id)
    const used = await photo(merchant.id)
    expect(
      (
        await call(
          merchant,
          'POST',
          '/merchant/deals',
          dealBody([outlet.id], { photoKey: used.key }),
        )
      ).status,
    ).toBe(201)
    const before = await db.deal.count()

    for (const photoKey of [someoneElses.key, used.key, 'never-uploaded']) {
      const refused = await call(
        merchant,
        'POST',
        '/merchant/deals',
        dealBody([outlet.id], { photoKey }),
      )
      expect(refused.status).toBe(400)
      expect(refused.body.error.message).toBe('The photo was not found. Please upload it again.')
    }
    expect(await db.deal.count()).toBe(before)
    expect(
      (await db.uploadedFile.findUniqueOrThrow({ where: { key: someoneElses.key } })).dealId,
    ).toBeNull()
  })

  it('keeps, replaces and removes the photo when editing', async () => {
    const [outlet] = await brand('Photo edit', 1)
    await grant(merchant.id, outlet.id)
    const first = await photo(merchant.id)
    const created = await call(
      merchant,
      'POST',
      '/merchant/deals',
      dealBody([outlet.id], { photoKey: first.key }),
    )
    const path = `/merchant/deals/${created.body.id}`

    // Sending the current key, or leaving the field out, keeps the photo as it is.
    const kept = await call(merchant, 'PATCH', path, dealBody([outlet.id], { photoKey: first.key }))
    expect(kept.status).toBe(200)
    expect(kept.body.photo).toEqual({ key: first.key, url: first.url })
    const { photoKey: _left, ...withoutPhoto } = dealBody([outlet.id])
    const untouched = await call(merchant, 'PATCH', path, withoutPhoto)
    expect(untouched.status).toBe(200)
    expect(untouched.body.photo).toEqual({ key: first.key, url: first.url })
    expect((await db.uploadedFile.findUniqueOrThrow({ where: { key: first.key } })).deletedAt).toBe(
      null,
    )

    // A new key replaces it; the old photo is marked deleted but stays linked for history.
    const second = await photo(merchant.id)
    const replaced = await call(
      merchant,
      'PATCH',
      path,
      dealBody([outlet.id], { photoKey: second.key }),
    )
    expect(replaced.status).toBe(200)
    expect(replaced.body.photo).toEqual({ key: second.key, url: second.url })
    const old = await db.uploadedFile.findUniqueOrThrow({ where: { key: first.key } })
    expect(old.deletedAt).toBeInstanceOf(Date)
    expect(old.dealId).toBe(created.body.id)

    // A refused new photo leaves the current one in place.
    const someoneElses = await photo(member.id)
    expect(
      (await call(merchant, 'PATCH', path, dealBody([outlet.id], { photoKey: someoneElses.key })))
        .status,
    ).toBe(400)
    expect(
      (await db.uploadedFile.findUniqueOrThrow({ where: { key: second.key } })).deletedAt,
    ).toBe(null)

    // null removes it.
    const removed = await call(merchant, 'PATCH', path, dealBody([outlet.id], { photoKey: null }))
    expect(removed.status).toBe(200)
    expect(removed.body.photo).toBeNull()
    expect(
      (await db.uploadedFile.findUniqueOrThrow({ where: { key: second.key } })).deletedAt,
    ).toBeInstanceOf(Date)
  })
})

describe('community deal submission', () => {
  const submission = (stallIds: string[], photoKey: string, overrides = {}) => ({
    title: '50% off kopi',
    description: 'Half-price kopi all day.',
    category: 'DRINKS',
    cuisine: null,
    offerType: 'PERCENT_OFF',
    discountPercent: 50,
    priceCents: null,
    stallIds,
    startDate: '2026-11-01',
    endDate: '2099-11-30',
    terms: 'Takeaway only',
    photoKey,
    ...overrides,
  })

  const selectableStalls = async (name: string, count: number) => {
    const venues = await brand(name, count)
    for (const venue of venues) await seedSyntheticOccupancy(db, venue.id)
    return venues
  }

  it('saves a pending deal with its photo and lists it as the member’s submission', async () => {
    const [a] = await selectableStalls('Submit', 1)
    const file = await photo(member.id)

    const created = await call(member, 'POST', '/deals', submission([a.id], file.key))
    expect(created.status).toBe(201)
    expect(created.body).toEqual({ id: created.body.id, reviewStatus: 'PENDING' })

    const deal = await db.deal.findUniqueOrThrow({
      where: { id: created.body.id },
      include: { venues: true, images: true },
    })
    expect(deal).toMatchObject({
      reviewStatus: 'PENDING',
      origin: 'USER_SUBMITTED',
      submittedById: member.id,
      merchantId: a.merchantId,
      discountPercent: 50,
      cuisine: null,
    })
    expect(deal.publishedAt).toBeNull()
    expect(deal.venues.map((link) => link.venueId)).toEqual([a.id])
    expect(deal.images.map((image) => image.key)).toEqual([file.key])

    const mine = await call(member, 'GET', '/account/submissions')
    expect(mine.body.items[0]).toMatchObject({ id: created.body.id, reviewStatus: 'PENDING' })
    const publicIds = (await call(null, 'GET', '/deals')).body.items.map(
      (item: { id: string }) => item.id,
    )
    expect(publicIds).not.toContain(created.body.id)
  })

  it('accepts only this member’s unused photo, and writes nothing otherwise', async () => {
    const [stall] = await selectableStalls('Photo', 1)
    const someoneElses = await photo(merchant.id)
    const before = await db.deal.count()

    const stolen = await call(member, 'POST', '/deals', submission([stall.id], someoneElses.key))
    expect(stolen.status).toBe(400)
    expect(stolen.body.error.message).toBe('The photo was not found. Please upload it again.')
    expect(
      (await call(member, 'POST', '/deals', submission([stall.id], 'never-uploaded'))).status,
    ).toBe(400)
    expect(await db.deal.count()).toBe(before)

    const mine = await photo(member.id)
    expect((await call(member, 'POST', '/deals', submission([stall.id], mine.key))).status).toBe(
      201,
    )
    expect((await call(member, 'POST', '/deals', submission([stall.id], mine.key))).status).toBe(
      400,
    )
  })

  it('accepts stalls not verified yet, and refuses archived stalls, a second stall and past deals', async () => {
    const [verified, sameBrand] = await selectableStalls('Verified', 2)
    const [unverified, archived] = await brand('Unverified', 2)
    await db.venue.update({ where: { id: archived.id }, data: { deletedAt: new Date() } })
    const file = await photo(member.id)

    const gone = await call(member, 'POST', '/deals', submission([archived.id], file.key))
    expect(gone.status).toBe(412)
    const twoStalls = await call(
      member,
      'POST',
      '/deals',
      submission([verified.id, sameBrand.id], file.key),
    )
    expect(twoStalls.status).toBe(400)
    expect((await call(member, 'POST', '/deals', submission([], file.key))).status).toBe(400)
    const past = await call(
      member,
      'POST',
      '/deals',
      submission([verified.id], file.key, { startDate: '2020-01-01', endDate: '2020-01-31' }),
    )
    expect(past.status).toBe(400)
    // The photo is still unused after every refusal.
    expect(
      (await db.uploadedFile.findUniqueOrThrow({ where: { key: file.key } })).dealId,
    ).toBeNull()

    const pending = await call(member, 'POST', '/deals', submission([unverified.id], file.key))
    expect(pending.status).toBe(201)
  })

  it('requires a session, a trusted origin and every field', async () => {
    const [stall] = await selectableStalls('Required', 1)
    const file = await photo(member.id)
    const body = submission([stall.id], file.key)

    expect((await call(null, 'POST', '/deals', body)).status).toBe(401)
    expect((await call(member, 'POST', '/deals', body, 'https://evil.example')).status).toBe(403)
    for (const field of ['title', 'terms', 'startDate', 'endDate', 'photoKey', 'stallIds']) {
      const { [field]: _removed, ...missing } = body as Record<string, unknown>
      expect((await call(member, 'POST', '/deals', missing)).status).toBe(400)
    }
    expect((await call(member, 'POST', '/deals', { ...body, terms: '  ' })).status).toBe(400)
    expect((await call(member, 'PUT', '/deals', body)).status).toBe(405)
  })

  it('lists every detail of a submission, including its stalls and photo', async () => {
    const [a] = await selectableStalls('Details', 1)
    const file = await photo(member.id)
    const created = await call(member, 'POST', '/deals', submission([a.id], file.key))

    const mine = await call(member, 'GET', '/account/submissions')
    const listed = mine.body.items.find((item: { id: string }) => item.id === created.body.id)
    expect(listed).toMatchObject({
      title: '50% off kopi',
      description: 'Half-price kopi all day.',
      category: 'DRINKS',
      cuisine: null,
      offerType: 'PERCENT_OFF',
      discountPercent: 50,
      priceCents: null,
      startDate: '2026-11-01',
      endDate: '2099-11-30',
      terms: 'Takeaway only',
      photoUrl: 'https://synthetic.example.test/photo.webp',
      reviewStatus: 'PENDING',
    })
    expect(listed.stalls).toEqual([{ id: a.id, name: a.name, address: a.address }])
  })

  it('deletes only the member’s own submission while it is still pending', async () => {
    const [stall] = await selectableStalls('Delete', 1)
    const pending = await call(
      member,
      'POST',
      '/deals',
      submission([stall.id], (await photo(member.id)).key),
    )
    const reviewed = await call(
      member,
      'POST',
      '/deals',
      submission([stall.id], (await photo(member.id)).key),
    )
    await db.deal.update({ where: { id: reviewed.body.id }, data: { reviewStatus: 'APPROVED' } })
    const path = (id: string) => `/account/submissions/${id}`

    expect((await call(null, 'DELETE', path(pending.body.id))).status).toBe(401)
    expect(
      (await call(member, 'DELETE', path(pending.body.id), undefined, 'https://evil.example'))
        .status,
    ).toBe(403)
    expect((await call(merchant, 'DELETE', path(pending.body.id))).status).toBe(404)
    const approved = await call(member, 'DELETE', path(reviewed.body.id))
    expect(approved.status).toBe(412)
    expect(approved.body.error.message).toBe(
      'Only a deal that is still pending review can be deleted',
    )
    expect((await call(member, 'GET', path(pending.body.id))).status).toBe(405)

    const deleted = await call(member, 'DELETE', path(pending.body.id))
    expect(deleted).toEqual({ status: 200, body: { deleted: true } })
    expect(
      (await db.deal.findUniqueOrThrow({ where: { id: pending.body.id } })).deletedAt,
    ).not.toBeNull()
    expect(
      (await db.deal.findUniqueOrThrow({ where: { id: reviewed.body.id } })).deletedAt,
    ).toBeNull()
    expect((await call(member, 'DELETE', path(pending.body.id))).status).toBe(404)
    const listed = ids((await call(member, 'GET', '/account/submissions')).body.items)
    expect(listed).not.toContain(pending.body.id)
    expect(listed).toContain(reviewed.body.id)
  })

  it('never deletes a deal an admin approved, even once it is back in review', async () => {
    const [stall] = await selectableStalls('Reopened', 1)
    const fresh = await call(
      member,
      'POST',
      '/deals',
      submission([stall.id], (await photo(member.id)).key),
    )
    const reopened = await call(
      member,
      'POST',
      '/deals',
      submission([stall.id], (await photo(member.id)).key),
    )
    await db.platformAudit.create({
      data: {
        actorName: 'Synthetic admin',
        action: 'DEAL_APPROVED',
        subjectType: 'DEAL',
        subjectId: reopened.body.id,
        note: 'Synthetic approval before a correction',
      },
    })

    const mine = (await call(member, 'GET', '/account/submissions')).body.items as {
      id: string
      reviewStatus: string
      deletable: boolean
    }[]
    expect(mine.find((item) => item.id === reopened.body.id)).toMatchObject({
      reviewStatus: 'PENDING',
      deletable: false,
    })
    expect(mine.find((item) => item.id === fresh.body.id)).toMatchObject({ deletable: true })

    const refused = await call(member, 'DELETE', `/account/submissions/${reopened.body.id}`)
    expect(refused.status).toBe(412)
    expect(
      (await db.deal.findUniqueOrThrow({ where: { id: reopened.body.id } })).deletedAt,
    ).toBeNull()
  })
})

describe('stalls for a community deal', () => {
  it('finds live stalls by stall or merchant name, verified or not', async () => {
    const [stall, archived] = await brand('Stall search', 2)
    await db.venue.update({ where: { id: archived.id }, data: { deletedAt: new Date() } })

    const byStall = await call(member, 'GET', '/deals/stalls?search=stall%20search%20outlet')
    expect(byStall.status).toBe(200)
    expect(byStall.body).toEqual([
      {
        id: stall.id,
        name: stall.name,
        merchantName: 'Synthetic Stall search',
        address: stall.address,
      },
    ])
    const byMerchant = await call(member, 'GET', '/deals/stalls?search=synthetic%20stall%20search')
    expect(ids(byMerchant.body)).toEqual([stall.id])

    const [west, east] = await brand('Combo Burger', 2)
    await db.venue.update({ where: { id: west.id }, data: { address: '1 Synthetic Clementi Rd' } })
    await db.venue.update({ where: { id: east.id }, data: { area: 'Synthetic Tampines' } })
    const byAddress = await call(member, 'GET', '/deals/stalls?search=combo%20burger%20clementi')
    expect(ids(byAddress.body)).toEqual([west.id])
    const byArea = await call(member, 'GET', '/deals/stalls?search=tampines%20%20combo')
    expect(ids(byArea.body)).toEqual([east.id])
    const noMatch = await call(member, 'GET', '/deals/stalls?search=combo%20burger%20jurong')
    expect(noMatch.body).toEqual([])
    expect((await call(null, 'GET', '/deals/stalls')).status).toBe(401)
    expect((await call(member, 'GET', '/deals/stalls?bogus=1')).status).toBe(400)
  })

  it('searches the map and adds a picked place once, from Google’s own details', async () => {
    const found = await call(member, 'GET', '/deals/places?search=hawker')
    expect(found.status).toBe(200)
    expect(found.body).toEqual([
      {
        placeId: 'SyntheticPlace_Hawker01',
        name: 'Synthetic Hawker Stall',
        address: '1 Synthetic Ave, #01-01, Singapore 000001',
        latitude: 1.3,
        longitude: 103.85,
        stall: null,
      },
    ])

    const added = await call(member, 'POST', '/deals/stalls', {
      placeId: 'SyntheticPlace_Hawker01',
      merchantName: 'Synthetic Hawker Brand',
    })
    expect(added.status).toBe(201)
    expect(added.body).toMatchObject({
      name: 'Synthetic Hawker Stall',
      merchantName: 'Synthetic Hawker Brand',
      address: '1 Synthetic Ave, #01-01, Singapore 000001',
    })
    expect(placeLookups).toContain('SyntheticPlace_Hawker01')
    const venue = await db.venue.findUniqueOrThrow({ where: { id: added.body.id } })
    expect(venue).toMatchObject({
      postalCode: '000001',
      latitude: 1.3,
      longitude: 103.85,
      catalogueKey: 'google-places:SyntheticPlace_Hawker01',
      geographyPrecision: 'OUTLET',
      geographyEvidence: { state: 'VERIFIED', provider: 'GOOGLE_PLACES' },
      occupancyEvidence: { state: 'UNVERIFIED', provider: 'GOOGLE_PLACES' },
    })

    const again = await call(member, 'POST', '/deals/stalls', {
      placeId: 'SyntheticPlace_Hawker01',
      merchantName: 'Anything',
    })
    expect(again).toEqual({ status: 200, body: added.body })
    expect((await call(member, 'GET', '/deals/places?search=hawker')).body[0].stall).toEqual(
      added.body,
    )

    const bakery = await call(member, 'POST', '/deals/stalls', {
      placeId: 'SyntheticPlace_Bakery02',
      merchantName: 'synthetic hawker BRAND',
    })
    expect(bakery.status).toBe(201)
    expect(bakery.body.merchantName).toBe('Synthetic Hawker Brand')

    const file = await photo(member.id)
    const deal = await call(member, 'POST', '/deals', {
      title: 'Synthetic set meal',
      description: 'Synthetic.',
      category: 'FOOD',
      cuisine: null,
      offerType: 'OTHER',
      discountPercent: null,
      priceCents: null,
      stallIds: [bakery.body.id],
      startDate: '2026-11-01',
      endDate: '2099-11-30',
      terms: 'Synthetic',
      photoKey: file.key,
    })
    expect(deal.status).toBe(201)
  })

  it('recognises a stall imported under another name nearby, and never adds it again', async () => {
    const imported = await db.merchant.create({ data: { name: 'Synthetic Noodle Bar Singapore' } })
    const listed = await db.venue.create({
      data: {
        merchantId: imported.id,
        name: 'Synthetic Mall',
        address: '3 Synthetic Ave',
        latitude: 1.3505,
        longitude: 103.9,
      },
    })
    const expected = {
      id: listed.id,
      name: 'Synthetic Mall',
      merchantName: 'Synthetic Noodle Bar Singapore',
      address: '3 Synthetic Ave',
    }

    const found = await call(member, 'GET', '/deals/places?search=noodle')
    expect(found.body[0]).toMatchObject({ placeId: 'SyntheticPlace_Imported3', stall: expected })
    const before = await db.venue.count()
    const added = await call(member, 'POST', '/deals/stalls', {
      placeId: 'SyntheticPlace_Imported3',
      merchantName: 'Synthetic Noodle Bar',
    })
    expect(added).toEqual({ status: 200, body: expected })
    expect(await db.venue.count()).toBe(before)
  })

  it('refuses unknown places, untrusted origins and anonymous visitors', async () => {
    const body = { placeId: 'SyntheticPlace_Missing', merchantName: 'Synthetic' }
    expect((await call(member, 'POST', '/deals/stalls', body)).status).toBe(404)
    expect((await call(member, 'POST', '/deals/stalls', body, 'https://evil.example')).status).toBe(
      403,
    )
    expect((await call(null, 'POST', '/deals/stalls', body)).status).toBe(401)
    expect((await call(null, 'GET', '/deals/places?search=hawker')).status).toBe(401)
    expect((await call(member, 'GET', '/deals/places?search=x')).status).toBe(400)
    expect(
      (await call(member, 'POST', '/deals/stalls', { placeId: '../../x', merchantName: 'S' }))
        .status,
    ).toBe(400)
  })
})
