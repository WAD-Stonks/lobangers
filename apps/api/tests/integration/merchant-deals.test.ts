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
  return { status: response.status, body: await response.json() }
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
  ...overrides,
})

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

describe('community deal submission', () => {
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
    const [a, b] = await selectableStalls('Submit', 2)
    const file = await photo(member.id)

    const created = await call(member, 'POST', '/deals', submission([a.id, b.id], file.key))
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
    expect(deal.venues.map((link) => link.venueId).sort()).toEqual([a.id, b.id].sort())
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

  it('refuses unselectable stalls, mixed merchants and past deals', async () => {
    const [verified] = await selectableStalls('Verified', 1)
    const [otherBrand] = await selectableStalls('Other brand', 1)
    const [unverified] = await brand('Unverified', 1)
    const file = await photo(member.id)

    const hidden = await call(member, 'POST', '/deals', submission([unverified.id], file.key))
    expect(hidden.status).toBe(412)
    const mixed = await call(
      member,
      'POST',
      '/deals',
      submission([verified.id, otherBrand.id], file.key),
    )
    expect(mixed.status).toBe(400)
    expect(mixed.body.error.message).toContain('same merchant')
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
})
