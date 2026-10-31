import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parseConfig } from '@api/config'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Flash Drop through real HTTP against a disposable replica set: a merchant sends a drop, an
// admin reviews it, visitors claim codes. All stalls, deals and people are SYNTHETIC.

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
    // A distinct synthetic client address per sign-up keeps the auth rate limit per person.
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
  return { status: response.status, body: await response.json() }
}

// A synthetic stall with one outlet, granted to the merchant, and one priced deal there.
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
  const deal = await call(owner, 'POST', '/merchant/deals', {
    title: `Synthetic ${name} chicken rice`,
    description: 'Fake deal. Plain chicken rice.',
    category: 'FOOD',
    cuisine: 'CHINESE',
    outletIds: [outlet.id],
    offerType: 'FIXED_PRICE',
    discountPercent: null,
    priceCents: 400,
    startDate: '',
    endDate: '',
    terms: '',
  })
  expect(deal.status).toBe(201)
  return { outlet, dealId: deal.body.id as string }
}

const dropBody = (dealId: string, outletId: string, overrides: Record<string, unknown> = {}) => ({
  dealId,
  outletId,
  flashPriceCents: 150,
  startsAt: new Date().toISOString(),
  durationMinutes: 30,
  radiusMetres: 500,
  codeLimit: 10,
  ...overrides,
})

const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const databaseUrl = mongo.getUri(`flash_${randomUUID().replaceAll('-', '')}`)
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

describe('merchant flash drops', () => {
  it('sends a drop of their own deal for review', async () => {
    const { outlet, dealId } = await stall(merchant, 'Review')
    const created = await call(
      merchant,
      'POST',
      '/merchant/flash-drops',
      dropBody(dealId, outlet.id),
    )
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({
      dealId,
      outletId: outlet.id,
      status: 'IN_REVIEW',
      flashPriceCents: 150,
      usualPriceCents: 400,
      codeLimit: 10,
      claimedCount: 0,
      version: 1,
      demo: false,
    })
    const listed = await call(merchant, 'GET', '/merchant/flash-drops')
    expect(listed.body.items.map((item: { id: string }) => item.id)).toContain(created.body.id)
  })

  it('refuses visitors, members, other merchants and deals at other outlets', async () => {
    const { outlet, dealId } = await stall(merchant, 'Guarded')
    expect(
      (await call(null, 'POST', '/merchant/flash-drops', dropBody(dealId, outlet.id))).status,
    ).toBe(401)
    expect(
      (await call(member, 'POST', '/merchant/flash-drops', dropBody(dealId, outlet.id))).status,
    ).toBe(403)
    expect(
      (await call(otherMerchant, 'POST', '/merchant/flash-drops', dropBody(dealId, outlet.id)))
        .status,
    ).toBe(403)
    const other = await stall(otherMerchant, 'Elsewhere')
    expect(
      (
        await call(
          otherMerchant,
          'POST',
          '/merchant/flash-drops',
          dropBody(dealId, other.outlet.id),
        )
      ).status,
    ).toBe(404)
  })

  it('explains price, timing and overlap problems', async () => {
    const { outlet, dealId } = await stall(merchant, 'Rules')
    const dear = await call(
      merchant,
      'POST',
      '/merchant/flash-drops',
      dropBody(dealId, outlet.id, { flashPriceCents: 400 }),
    )
    expect(dear.status).toBe(400)
    expect(dear.body.error.message).toMatch(/lower than the usual price/)
    const past = await call(
      merchant,
      'POST',
      '/merchant/flash-drops',
      dropBody(dealId, outlet.id, { startsAt: inMinutes(-10) }),
    )
    expect(past.status).toBe(400)
    const odd = await call(
      merchant,
      'POST',
      '/merchant/flash-drops',
      dropBody(dealId, outlet.id, { durationMinutes: 45 }),
    )
    expect(odd.status).toBe(400)
    expect(
      (await call(merchant, 'POST', '/merchant/flash-drops', dropBody(dealId, outlet.id))).status,
    ).toBe(201)
    const twice = await call(
      merchant,
      'POST',
      '/merchant/flash-drops',
      dropBody(dealId, outlet.id, { startsAt: inMinutes(10) }),
    )
    expect(twice.status).toBe(409)
  })
})

describe('admin review and claims', () => {
  it('sends back with a note, then approves the fixed version and logs both', async () => {
    const { outlet, dealId } = await stall(merchant, 'Lifecycle')
    const drop = (
      await call(merchant, 'POST', '/merchant/flash-drops', dropBody(dealId, outlet.id))
    ).body

    expect((await call(member, 'GET', '/admin/flash-drops')).status).toBe(403)
    const queue = await call(admin, 'GET', '/admin/flash-drops?view=review')
    expect(queue.status).toBe(200)
    const listed = queue.body.items.find((item: { id: string }) => item.id === drop.id)
    expect(listed.checks).toMatchObject({
      merchantHoldsOutlet: true,
      priceLower: true,
      manyCodes: false,
    })
    expect(queue.body.counts.review).toBeGreaterThan(0)

    const noNote = await call(admin, 'POST', `/admin/flash-drops/${drop.id}/decision`, {
      decision: 'SEND_BACK',
      note: '',
      version: 1,
    })
    expect(noNote.status).toBe(400)
    const back = await call(admin, 'POST', `/admin/flash-drops/${drop.id}/decision`, {
      decision: 'SEND_BACK',
      note: 'Please use a 300 m radius.',
      version: 1,
    })
    expect(back.status).toBe(200)
    expect(back.body).toMatchObject({
      status: 'SENT_BACK',
      reviewNote: 'Please use a 300 m radius.',
    })

    const stale = await call(admin, 'POST', `/admin/flash-drops/${drop.id}/decision`, {
      decision: 'APPROVE',
      note: '',
      version: 1,
    })
    expect(stale.status).toBe(409)

    const resent = await call(merchant, 'PUT', `/merchant/flash-drops/${drop.id}`, {
      ...dropBody(dealId, outlet.id, { radiusMetres: 300 }),
      version: 2,
    })
    expect(resent.status).toBe(200)
    expect(resent.body).toMatchObject({
      status: 'IN_REVIEW',
      radiusMetres: 300,
      reviewNote: null,
      version: 3,
    })

    const approved = await call(admin, 'POST', `/admin/flash-drops/${drop.id}/decision`, {
      decision: 'APPROVE',
      note: '',
      version: 3,
    })
    expect(approved.body.status).toBe('LIVE')
    const audit = await db.platformAudit.findMany({
      where: { subjectId: drop.id },
      orderBy: { id: 'asc' },
    })
    expect(audit.map((entry) => entry.action)).toEqual([
      'FLASH_DROP_SENT_BACK',
      'FLASH_DROP_APPROVED',
    ])

    const overview = await call(admin, 'GET', '/admin/overview')
    expect(overview.body.counts.liveFlashDrops).toBeGreaterThan(0)
  })

  it('gives each person one code, never more codes than the limit, and stops cleanly', async () => {
    const { outlet, dealId } = await stall(merchant, 'Claims', 1.36)
    const drop = (
      await call(merchant, 'POST', '/merchant/flash-drops', dropBody(dealId, outlet.id))
    ).body
    expect((await call(member, 'POST', `/flash-drops/${drop.id}/claims`)).status).toBe(404)
    await call(admin, 'POST', `/admin/flash-drops/${drop.id}/decision`, {
      decision: 'APPROVE',
      note: '',
      version: 1,
    })

    const active = await call(null, 'GET', '/flash-drops/active')
    const shown = active.body.items.find((item: { id: string }) => item.id === drop.id)
    expect(shown).toMatchObject({ codesLeft: 10, flashPriceCents: 150, demo: false })

    expect((await call(null, 'POST', `/flash-drops/${drop.id}/claims`)).status).toBe(401)
    const first = await call(member, 'POST', `/flash-drops/${drop.id}/claims`)
    expect(first.status).toBe(201)
    expect(first.body.code).toMatch(/^LB-[A-Z2-9]{6}$/)
    const again = await call(member, 'POST', `/flash-drops/${drop.id}/claims`)
    expect(again.status).toBe(200)
    expect(again.body.code).toBe(first.body.code)

    // Fifteen people tap at once for the nine codes left.
    const crowd = await Promise.all(
      Array.from({ length: 15 }, (_, index) => signUp(`Synthetic crowd ${index}`)),
    )
    const results = await Promise.all(
      crowd.map((person) => call(person, 'POST', `/flash-drops/${drop.id}/claims`)),
    )
    expect(results.filter((result) => result.status === 201)).toHaveLength(9)
    expect(results.every((result) => [201, 409].includes(result.status))).toBe(true)
    const stored = await db.flashDrop.findUniqueOrThrow({ where: { id: drop.id } })
    expect(stored.claimedCount).toBe(10)
    expect(await db.flashDropClaim.count({ where: { dropId: drop.id } })).toBe(10)

    const mine = await call(member, 'GET', '/flash-drops/codes')
    expect(mine.body.items[0]).toMatchObject({ code: first.body.code, active: true })
    const gone = await call(null, 'GET', '/flash-drops/active')
    expect(gone.body.items.map((item: { id: string }) => item.id)).not.toContain(drop.id)
  })

  it('stops a live drop for everyone and voids its codes', async () => {
    const { outlet, dealId } = await stall(merchant, 'Stop', 1.4)
    const drop = (
      await call(merchant, 'POST', '/merchant/flash-drops', dropBody(dealId, outlet.id))
    ).body
    await call(admin, 'POST', `/admin/flash-drops/${drop.id}/decision`, {
      decision: 'APPROVE',
      note: '',
      version: 1,
    })
    await call(member, 'POST', `/flash-drops/${drop.id}/claims`)
    const stopped = await call(admin, 'POST', `/admin/flash-drops/${drop.id}/decision`, {
      decision: 'STOP',
      note: 'Stall ran out early.',
      version: 2,
    })
    expect(stopped.body.status).toBe('STOPPED')
    const active = await call(null, 'GET', '/flash-drops/active')
    expect(active.body.items.map((item: { id: string }) => item.id)).not.toContain(drop.id)
    const codes = await call(member, 'GET', '/flash-drops/codes')
    expect(
      codes.body.items.find((item: { dropId: string }) => item.dropId === drop.id).active,
    ).toBe(false)
    const ownView = await call(merchant, 'GET', '/merchant/flash-drops')
    expect(ownView.body.items.find((item: { id: string }) => item.id === drop.id)).toMatchObject({
      status: 'STOPPED',
      reviewNote: 'Stall ran out early.',
    })
  })

  it('lets the merchant withdraw a drop in review', async () => {
    const { outlet, dealId } = await stall(merchant, 'Withdraw', 1.42)
    const drop = (
      await call(merchant, 'POST', '/merchant/flash-drops', dropBody(dealId, outlet.id))
    ).body
    const ended = await call(merchant, 'POST', `/merchant/flash-drops/${drop.id}/end`, {
      version: 1,
    })
    expect(ended.body.status).toBe('ENDED')
    const late = await call(admin, 'POST', `/admin/flash-drops/${drop.id}/decision`, {
      decision: 'APPROVE',
      note: '',
      version: 2,
    })
    expect(late.status).toBe(412)
  })
})
