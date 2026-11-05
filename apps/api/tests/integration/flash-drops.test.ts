import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import {
  registerSyntheticOutletFixtureDatabase,
  seedSyntheticOutletProof,
} from '@api/../tests/fixtures/outlet-proof'
import { parseConfig } from '@api/config'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const origin = 'http://localhost:5173'
const root = fileURLToPath(new URL('../../../../', import.meta.url))
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let db: typeof import('@broke-oclock/db').db
let baseURL = ''

type Account = { id: string; cookie: string }
let merchant: Account
let otherMerchant: Account
let admin: Account
let member: Account

let signUps = 1
const signUp = async (name: string): Promise<Account> => {
  const response = await fetch(`${baseURL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      'X-Forwarded-For': `10.${signUps >> 8}.${signUps++ & 255}.1`,
    },
    body: JSON.stringify({
      name,
      email: `flash-${randomUUID()}@example.test`,
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

const call = async (account: Account | null, method: string, path: string, body?: unknown) => {
  const response = await fetch(`${baseURL}/api${path}`, {
    method,
    headers: {
      ...(account ? { Cookie: account.cookie } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      Origin: origin,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

const stall = async (owner: Account, name: string, lat = 1.3236) => {
  const brand = await db.merchant.create({ data: { name: `Synthetic ${name}` } })
  const outlet = await db.venue.create({
    data: {
      merchantId: brand.id,
      name: `Synthetic ${name} outlet`,
      address: '1 Synthetic Road',
      latitude: lat,
      longitude: 103.9273,
    },
  })
  await db.stallGrant.create({ data: { userId: owner.id, venueId: outlet.id } })
  return { outlet }
}

const dropBody = (outletId: string, overrides: Record<string, unknown> = {}) => ({
  title: 'Synthetic chicken rice',
  description: 'Fake deal. Plain chicken rice.',
  category: 'FOOD',
  cuisine: 'CHINESE',
  offerType: 'FIXED_PRICE',
  discountPercent: null,
  priceCents: 150,
  usualPriceCents: 400,
  terms: '',
  outletId,
  startsAt: null,
  durationMinutes: 30,
  radiusMetres: 500,
  codeLimit: 10,
  ...overrides,
})

const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()

const draft = async (outletId: string, overrides: Record<string, unknown> = {}) => {
  const saved = await call(merchant, 'POST', '/merchant/flash-drops', dropBody(outletId, overrides))
  expect(saved.status).toBe(201)
  return saved.body
}

const goLive = (drop: { id: string; version: number }, account: Account = merchant) =>
  call(account, 'POST', `/merchant/flash-drops/${drop.id}/go-live`, { version: drop.version })

const ids = (items: { id: string }[]) => items.map((item) => item.id)

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
  admin = await signUp('Synthetic admin')
  member = await signUp('Synthetic member')
  await db.user.updateMany({
    where: { id: { in: [merchant.id, otherMerchant.id] } },
    data: { role: 'MERCHANT' },
  })
  await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
}, 180_000)

afterAll(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  await db?.$disconnect()
  await mongo?.stop()
  vi.unstubAllEnvs()
})

describe('merchant flash deal drafts', () => {
  it('saves a flash deal as a draft only its merchant can see', async () => {
    const { outlet } = await stall(merchant, 'Draft')
    const saved = await draft(outlet.id)
    expect(saved).toMatchObject({
      outletId: outlet.id,
      status: 'DRAFT',
      startsOnGoLive: true,
      flashPriceCents: 150,
      usualPriceCents: 400,
      codeLimit: 10,
      claimedCount: 0,
      version: 1,
      demo: false,
      dealTitle: 'Synthetic chicken rice',
      offerType: 'FIXED_PRICE',
      discountPercent: null,
      deal: { title: 'Synthetic chicken rice', offerType: 'FIXED_PRICE', priceCents: 150 },
    })

    expect(ids((await call(merchant, 'GET', '/merchant/flash-drops')).body.items)).toContain(
      saved.id,
    )
    expect(
      ids((await call(otherMerchant, 'GET', '/merchant/flash-drops')).body.items),
    ).not.toContain(saved.id)
    expect(ids((await call(null, 'GET', '/flash-drops/active')).body.items)).not.toContain(saved.id)
    expect(ids((await call(merchant, 'GET', '/merchant/deals')).body.items)).not.toContain(
      saved.dealId,
    )
    for (const view of ['scheduled', 'live', 'ended']) {
      const tab = await call(admin, 'GET', `/admin/flash-drops?view=${view}`)
      expect(ids(tab.body.items)).not.toContain(saved.id)
    }
    const deal = await db.deal.findUniqueOrThrow({ where: { id: saved.dealId } })
    expect(deal).toMatchObject({ reviewStatus: 'APPROVED', publishedAt: null })
  })

  it('refuses visitors, members and merchants without the outlet', async () => {
    const { outlet } = await stall(merchant, 'Guarded')
    expect((await call(null, 'POST', '/merchant/flash-drops', dropBody(outlet.id))).status).toBe(
      401,
    )
    expect((await call(member, 'POST', '/merchant/flash-drops', dropBody(outlet.id))).status).toBe(
      403,
    )
    expect(
      (await call(otherMerchant, 'POST', '/merchant/flash-drops', dropBody(outlet.id))).status,
    ).toBe(403)

    const mine = await draft(outlet.id)
    const path = `/merchant/flash-drops/${mine.id}`
    expect(
      (await call(otherMerchant, 'PUT', path, { ...dropBody(outlet.id), version: 1 })).status,
    ).toBe(404)
    expect((await goLive(mine, otherMerchant)).status).toBe(404)
    expect((await call(otherMerchant, 'DELETE', path, { version: 1 })).status).toBe(404)
  })

  it('explains price and timing problems', async () => {
    const { outlet } = await stall(merchant, 'Rules')
    const save = (overrides: Record<string, unknown>) =>
      call(merchant, 'POST', '/merchant/flash-drops', dropBody(outlet.id, overrides))
    expect((await save({ usualPriceCents: 150 })).status).toBe(400)
    expect(
      (await save({ offerType: 'BUY_ONE_GET_ONE', priceCents: null, usualPriceCents: 400 })).status,
    ).toBe(400)
    expect((await save({ usualPriceCents: null })).status).toBe(201)
    expect((await save({ startsAt: inMinutes(-10) })).status).toBe(400)
    expect((await save({ startsAt: inMinutes(8 * 24 * 60) })).status).toBe(400)
    expect((await save({ durationMinutes: 45 })).status).toBe(400)
    expect((await save({ offerType: 'PERCENT_OFF' })).status).toBe(400)
  })

  it('takes the same offer types as a deal: 1-for-1, % off and other', async () => {
    const { outlet } = await stall(merchant, 'Offers', 1.32)
    const save = (overrides: Record<string, unknown>) =>
      call(
        merchant,
        'POST',
        '/merchant/flash-drops',
        dropBody(outlet.id, { priceCents: null, usualPriceCents: null, ...overrides }),
      )
    const bogo = await save({ offerType: 'BUY_ONE_GET_ONE' })
    expect(bogo.status).toBe(201)
    expect(bogo.body).toMatchObject({
      offerType: 'BUY_ONE_GET_ONE',
      discountPercent: null,
      flashPriceCents: null,
      usualPriceCents: null,
    })
    const off = await save({ offerType: 'PERCENT_OFF', discountPercent: 30 })
    expect(off.body).toMatchObject({ offerType: 'PERCENT_OFF', discountPercent: 30 })
    expect((await save({ offerType: 'OTHER' })).body.offerType).toBe('OTHER')

    await goLive(bogo.body)
    const active = await call(null, 'GET', '/flash-drops/active')
    expect(
      active.body.items.find((item: { id: string }) => item.id === bogo.body.id),
    ).toMatchObject({ offerType: 'BUY_ONE_GET_ONE', flashPriceCents: null, usualPriceCents: null })
    const code = await call(member, 'POST', `/flash-drops/${bogo.body.id}/claims`)
    expect(code.body).toMatchObject({ offerType: 'BUY_ONE_GET_ONE', flashPriceCents: null })
  })

  it('reads a flash deal made before offer types as a fixed flash price', async () => {
    const { outlet } = await stall(merchant, 'Legacy', 1.31)
    const saved = await draft(outlet.id)
    await db.flashDrop.update({
      where: { id: saved.id },
      data: { offerType: null, usualPriceMinor: null, flashPriceMinor: 150 },
    })
    await db.deal.update({ where: { id: saved.dealId }, data: { priceMinor: 400 } })
    const listed = await call(merchant, 'GET', '/merchant/flash-drops')
    expect(listed.body.items.find((item: { id: string }) => item.id === saved.id)).toMatchObject({
      offerType: 'FIXED_PRICE',
      flashPriceCents: 150,
      usualPriceCents: 400,
    })
  })

  it('edits a draft, then sends it live at its saved time', async () => {
    const { outlet } = await stall(merchant, 'Scheduled', 1.33)
    const saved = await draft(outlet.id, { startsAt: inMinutes(60) })
    expect(saved.startsOnGoLive).toBe(false)
    const path = `/merchant/flash-drops/${saved.id}`

    const edited = await call(merchant, 'PUT', path, {
      ...dropBody(outlet.id, { title: 'Synthetic duck rice', startsAt: inMinutes(90) }),
      version: 1,
    })
    expect(edited.status).toBe(200)
    expect(edited.body).toMatchObject({
      status: 'DRAFT',
      dealTitle: 'Synthetic duck rice',
      version: 2,
    })
    expect((await call(merchant, 'PUT', path, { ...dropBody(outlet.id), version: 1 })).status).toBe(
      409,
    )

    const live = await goLive(edited.body)
    expect(live.status).toBe(200)
    expect(live.body).toMatchObject({ status: 'SCHEDULED', version: 3 })
    expect(Date.parse(live.body.startsAt)).toBe(Date.parse(edited.body.startsAt))
    expect(ids((await call(null, 'GET', '/flash-drops/active')).body.items)).not.toContain(saved.id)
    expect(
      ids((await call(admin, 'GET', '/admin/flash-drops?view=scheduled')).body.items),
    ).toContain(saved.id)

    expect((await call(merchant, 'PUT', path, { ...dropBody(outlet.id), version: 3 })).status).toBe(
      412,
    )
    expect((await goLive(live.body)).status).toBe(412)

    const rival = await draft(outlet.id, { startsAt: inMinutes(95) })
    const clash = await goLive(rival)
    expect(clash.status).toBe(409)
    expect(clash.body.error.message).toMatch(/already covers that time/)
  })

  it('refuses Go live once a saved start time has passed', async () => {
    const { outlet } = await stall(merchant, 'Late', 1.34)
    const saved = await draft(outlet.id, { startsAt: inMinutes(5) })
    await db.flashDrop.update({
      where: { id: saved.id },
      data: { startsAt: new Date(Date.now() - 10 * 60_000) },
    })
    const late = await goLive(saved)
    expect(late.status).toBe(400)
    expect(late.body.error.message).toMatch(/start time has passed/)
  })

  it('deletes a draft for good, and a past flash deal from the history', async () => {
    const { outlet } = await stall(merchant, 'Delete', 1.35)
    const saved = await draft(outlet.id)
    const path = `/merchant/flash-drops/${saved.id}`
    expect((await call(merchant, 'POST', `${path}/end`, { version: 1 })).status).toBe(412)
    expect((await call(merchant, 'DELETE', path, { version: 1 })).status).toBe(204)
    expect(ids((await call(merchant, 'GET', '/merchant/flash-drops')).body.items)).not.toContain(
      saved.id,
    )
    expect(await db.flashDrop.findUnique({ where: { id: saved.id } })).toBeNull()
    expect(
      (await db.deal.findUniqueOrThrow({ where: { id: saved.dealId } })).deletedAt,
    ).toBeInstanceOf(Date)

    const live = (await goLive(await draft(outlet.id))).body
    const livePath = `/merchant/flash-drops/${live.id}`
    expect((await call(merchant, 'DELETE', livePath, { version: live.version })).status).toBe(412)
    await call(member, 'POST', `/flash-drops/${live.id}/claims`)
    const ended = (await call(merchant, 'POST', `${livePath}/end`, { version: live.version })).body

    expect((await call(otherMerchant, 'DELETE', livePath, { version: ended.version })).status).toBe(
      404,
    )
    expect((await call(merchant, 'DELETE', livePath, { version: ended.version })).status).toBe(204)
    expect(ids((await call(merchant, 'GET', '/merchant/flash-drops')).body.items)).not.toContain(
      live.id,
    )
    const kept = await db.flashDrop.findUniqueOrThrow({ where: { id: live.id } })
    expect(kept.deletedAt).toBeInstanceOf(Date)
    const codes = await call(member, 'GET', '/flash-drops/codes')
    expect(codes.body.items.map((item: { dropId: string }) => item.dropId)).toContain(live.id)
    expect((await call(merchant, 'DELETE', livePath, { version: kept.version })).status).toBe(404)
  })
})

describe('live flash deals', () => {
  it('goes live at once, shows its deal on the map for the window, and ends early', async () => {
    const { outlet } = await stall(merchant, 'Live', 1.37)
    await seedSyntheticOutletProof(db, outlet.id)
    const saved = await draft(outlet.id)
    const publicDealIds = async () => ids((await call(null, 'GET', '/deals')).body.items)
    expect(await publicDealIds()).not.toContain(saved.dealId)

    const live = await goLive(saved)
    expect(live.status).toBe(200)
    expect(live.body.status).toBe('LIVE')
    const active = await call(null, 'GET', '/flash-drops/active')
    expect(active.body.items.find((item: { id: string }) => item.id === saved.id)).toMatchObject({
      dealId: saved.dealId,
      offerType: 'FIXED_PRICE',
      flashPriceCents: 150,
      usualPriceCents: 400,
      codesLeft: 10,
    })
    expect(await publicDealIds()).toContain(saved.dealId)
    expect(ids((await call(merchant, 'GET', '/merchant/deals')).body.items)).not.toContain(
      saved.dealId,
    )
    const deal = await db.deal.findUniqueOrThrow({ where: { id: saved.dealId } })
    expect(deal.validUntil?.toISOString()).toBe(live.body.endsAt)

    const ended = await call(merchant, 'POST', `/merchant/flash-drops/${saved.id}/end`, {
      version: live.body.version,
    })
    expect(ended.body.status).toBe('ENDED')
    expect(ids((await call(null, 'GET', '/flash-drops/active')).body.items)).not.toContain(saved.id)
    expect(await publicDealIds()).not.toContain(saved.dealId)
    const again = await call(merchant, 'POST', `/merchant/flash-drops/${saved.id}/end`, {
      version: ended.body.version,
    })
    expect(again.body.status).toBe('ENDED')
  })

  it('gives each person one code, never more codes than the limit', async () => {
    const { outlet } = await stall(merchant, 'Claims', 1.36)
    const saved = await draft(outlet.id)
    expect((await call(member, 'POST', `/flash-drops/${saved.id}/claims`)).status).toBe(404)
    await goLive(saved)

    expect((await call(null, 'POST', `/flash-drops/${saved.id}/claims`)).status).toBe(401)
    const first = await call(member, 'POST', `/flash-drops/${saved.id}/claims`)
    expect(first.status).toBe(201)
    expect(first.body.code).toMatch(/^LB-[A-Z2-9]{6}$/)
    const again = await call(member, 'POST', `/flash-drops/${saved.id}/claims`)
    expect(again.status).toBe(200)
    expect(again.body.code).toBe(first.body.code)

    const crowd = await Promise.all(
      Array.from({ length: 15 }, (_, index) => signUp(`Synthetic crowd ${index}`)),
    )
    const results = await Promise.all(
      crowd.map((person) => call(person, 'POST', `/flash-drops/${saved.id}/claims`)),
    )
    expect(results.filter((result) => result.status === 201)).toHaveLength(9)
    expect(results.every((result) => [201, 409].includes(result.status))).toBe(true)
    const stored = await db.flashDrop.findUniqueOrThrow({ where: { id: saved.id } })
    expect(stored.claimedCount).toBe(10)
    expect(await db.flashDropClaim.count({ where: { dropId: saved.id } })).toBe(10)

    const mine = await call(member, 'GET', '/flash-drops/codes')
    expect(mine.body.items[0]).toMatchObject({ code: first.body.code, active: true })
    expect(ids((await call(null, 'GET', '/flash-drops/active')).body.items)).not.toContain(saved.id)
  })
})

describe('claimed codes', () => {
  it('keeps codes working after claiming closes, even when the merchant ends early', async () => {
    const { outlet } = await stall(merchant, 'Codes outlive', 1.38)
    const saved = await draft(outlet.id, { codeValidity: 'THREE_DAYS' })
    expect(saved.codeValidity).toBe('THREE_DAYS')
    const live = (await goLive(saved)).body
    const threeDaysAfter = new Date(Date.parse(live.endsAt) + 3 * 86_400_000).toISOString()
    expect(live.codesExpireAt).toBe(threeDaysAfter)
    const active = await call(null, 'GET', '/flash-drops/active')
    expect(
      active.body.items.find((item: { id: string }) => item.id === saved.id).codesExpireAt,
    ).toBe(threeDaysAfter)

    const claimed = await call(member, 'POST', `/flash-drops/${saved.id}/claims`)
    expect(claimed.body).toMatchObject({ active: true, expiresAt: threeDaysAfter })

    const ended = await call(merchant, 'POST', `/merchant/flash-drops/${saved.id}/end`, {
      version: live.version,
    })
    expect(ended.body.status).toBe('ENDED')
    expect((await call(otherMerchant, 'POST', `/flash-drops/${saved.id}/claims`)).status).toBe(412)
    const codes = await call(member, 'GET', '/flash-drops/codes')
    expect(
      codes.body.items.find((item: { dropId: string }) => item.dropId === saved.id),
    ).toMatchObject({ active: true, expiresAt: threeDaysAfter })
  })

  it('lasts until the end of the day when the merchant picks nothing', async () => {
    const { outlet } = await stall(merchant, 'Default validity', 1.39)
    const saved = await draft(outlet.id)
    expect(saved.codeValidity).toBe('END_OF_DAY')
    const live = (await goLive(saved)).body
    expect(live.codesExpireAt).toMatch(/T15:59:59\.999Z$/)
    expect(Date.parse(live.codesExpireAt)).toBeGreaterThan(Date.parse(live.endsAt))
  })

  it('ends older codes with their window, as before', async () => {
    const { outlet } = await stall(merchant, 'Legacy codes', 1.41)
    const saved = await draft(outlet.id)
    await goLive(saved)
    await db.flashDrop.update({
      where: { id: saved.id },
      data: { codeValidity: null, codesExpireAt: null },
    })
    const claimed = await call(member, 'POST', `/flash-drops/${saved.id}/claims`)
    expect(claimed.body.expiresAt).toBe(claimed.body.endsAt)
  })
})

describe('live updates', () => {
  type Push = { channels: string[]; event: string; data: unknown }
  let pushes: Push[] = []

  const usePublisher = async () => {
    const realtime = await import('@api/modules/flash-drops/realtime')
    pushes = []
    realtime.setFlashPublisher({
      trigger: async (channels, event, data) => {
        pushes.push({ channels, event, data })
      },
      authorizeChannel: (socketId, channel) => ({ auth: `signed:${socketId}:${channel}` }),
    })
    return () => realtime.setFlashPublisher(null)
  }

  it('says when live updates are off, so browsers keep polling', async () => {
    const config = await call(null, 'GET', '/flash-drops/realtime')
    expect(config).toMatchObject({ status: 200, body: { pusher: null } })
    const auth = await call(merchant, 'POST', '/merchant/flash-drops/realtime/auth', {
      socketId: '1.2',
      channel: `private-merchant-flash-${merchant.id}`,
    })
    expect(auth.status).toBe(412)
  })

  it('signs a merchant into their own channel only', async () => {
    const stop = await usePublisher()
    try {
      const sign = (account: Account | null, owner: Account) =>
        call(account, 'POST', '/merchant/flash-drops/realtime/auth', {
          socketId: '1.2',
          channel: `private-merchant-flash-${owner.id}`,
        })
      const own = await sign(merchant, merchant)
      expect(own.status).toBe(200)
      expect(own.body.auth).toBe(`signed:1.2:private-merchant-flash-${merchant.id}`)
      expect((await sign(merchant, otherMerchant)).status).toBe(403)
      expect((await sign(member, member)).status).toBe(403)
      expect((await sign(null, merchant)).status).toBe(401)
      const malformed = await call(merchant, 'POST', '/merchant/flash-drops/realtime/auth', {
        socketId: '1.2',
        channel: 'private-squad-ABCD',
      })
      expect(malformed.status).toBe(400)
    } finally {
      stop()
    }
  })

  it('pushes go live, each new claim, ending and removal to the map and the merchant', async () => {
    const stop = await usePublisher()
    try {
      const both = ['flash-drops', `private-merchant-flash-${merchant.id}`]
      const kinds = () => pushes.map((push) => (push.data as { kind: string }).kind)
      const { outlet } = await stall(merchant, 'Pushed', 1.42)
      const saved = await draft(outlet.id)
      expect(pushes).toEqual([])

      const live = (await goLive(saved)).body
      expect(pushes[0]).toEqual({
        channels: both,
        event: 'changed',
        data: { dropId: saved.id, kind: 'LIVE' },
      })
      await call(member, 'POST', `/flash-drops/${saved.id}/claims`)
      await call(member, 'POST', `/flash-drops/${saved.id}/claims`)
      expect(kinds()).toEqual(['LIVE', 'CLAIMED'])

      await call(merchant, 'POST', `/merchant/flash-drops/${saved.id}/end`, {
        version: live.version,
      })
      expect(kinds()).toEqual(['LIVE', 'CLAIMED', 'ENDED'])

      const other = await draft(outlet.id)
      const otherLive = (await goLive(other)).body
      await call(admin, 'POST', `/admin/flash-drops/${other.id}/decision`, {
        decision: 'STOP',
        note: 'Synthetic removal.',
        version: otherLive.version,
      })
      expect(pushes.at(-1)).toEqual({
        channels: both,
        event: 'changed',
        data: { dropId: other.id, kind: 'STOPPED' },
      })
    } finally {
      stop()
    }
  })

  it('never fails the write when a push fails', async () => {
    const realtime = await import('@api/modules/flash-drops/realtime')
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    realtime.setFlashPublisher({
      trigger: async () => {
        throw new Error('Synthetic Pusher outage')
      },
      authorizeChannel: () => ({ auth: 'unused' }),
    })
    try {
      const { outlet } = await stall(merchant, 'Push outage', 1.43)
      const saved = await draft(outlet.id)
      expect((await goLive(saved)).status).toBe(200)
      expect(errors).toHaveBeenCalledWith(
        'Flash realtime publish failed',
        expect.objectContaining({ dropId: saved.id, kind: 'LIVE' }),
      )
    } finally {
      realtime.setFlashPublisher(null)
      errors.mockRestore()
    }
  })
})

describe('admin removal', () => {
  it('lets admins remove a live flash deal with a note, voiding its codes, and logs it', async () => {
    const { outlet } = await stall(merchant, 'Remove', 1.4)
    const saved = await draft(outlet.id)
    const live = (await goLive(saved)).body
    await call(member, 'POST', `/flash-drops/${saved.id}/claims`)

    expect((await call(member, 'GET', '/admin/flash-drops')).status).toBe(403)
    const tab = await call(admin, 'GET', '/admin/flash-drops')
    expect(tab.status).toBe(200)
    const listed = tab.body.items.find((item: { id: string }) => item.id === saved.id)
    expect(listed.checks).toMatchObject({ merchantHoldsOutlet: true, priceLower: true })
    expect(tab.body.counts.live).toBeGreaterThan(0)

    const decide = (body: Record<string, unknown>) =>
      call(admin, 'POST', `/admin/flash-drops/${saved.id}/decision`, body)
    expect((await decide({ decision: 'STOP', note: '', version: live.version })).status).toBe(400)
    expect((await decide({ decision: 'APPROVE', note: '', version: live.version })).status).toBe(
      400,
    )
    expect((await decide({ decision: 'STOP', note: 'x', version: 1 })).status).toBe(409)
    const removed = await decide({
      decision: 'STOP',
      note: 'Misleading price.',
      version: live.version,
    })
    expect(removed.status).toBe(200)
    expect(removed.body.status).toBe('STOPPED')

    expect(ids((await call(null, 'GET', '/flash-drops/active')).body.items)).not.toContain(saved.id)
    const codes = await call(member, 'GET', '/flash-drops/codes')
    expect(
      codes.body.items.find((item: { dropId: string }) => item.dropId === saved.id).active,
    ).toBe(false)
    const ownView = await call(merchant, 'GET', '/merchant/flash-drops')
    expect(ownView.body.items.find((item: { id: string }) => item.id === saved.id)).toMatchObject({
      status: 'STOPPED',
      reviewNote: 'Misleading price.',
    })
    expect(
      (await db.deal.findUniqueOrThrow({ where: { id: saved.dealId } })).publishedAt,
    ).toBeNull()
    const audit = await db.platformAudit.findMany({ where: { subjectId: saved.id } })
    expect(audit.map((entry) => entry.action)).toEqual(['FLASH_DROP_STOPPED'])
  })

  it('cannot see or remove a draft', async () => {
    const { outlet } = await stall(merchant, 'Private', 1.42)
    const saved = await draft(outlet.id)
    const attempt = await call(admin, 'POST', `/admin/flash-drops/${saved.id}/decision`, {
      decision: 'STOP',
      note: 'Not allowed.',
      version: 1,
    })
    expect(attempt.status).toBe(404)
  })

  it('counts live and scheduled flash deals on the admin overview', async () => {
    const { outlet } = await stall(merchant, 'Overview', 1.44)
    await goLive(await draft(outlet.id, { startsAt: inMinutes(120) }))
    const overview = await call(admin, 'GET', '/admin/overview')
    expect(overview.body.counts.pendingFlashDrops).toBeGreaterThan(0)
    expect(overview.body.counts.liveFlashDrops).toBeGreaterThan(0)
  })
})
