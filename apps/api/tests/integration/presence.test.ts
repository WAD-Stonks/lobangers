import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parseConfig } from '@api/config'
import { MAX_FUZZ_METRES } from '@api/modules/presence/fuzz'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Hungry Nearby through real HTTP against a disposable replica set. Every person is SYNTHETIC.

const origin = 'http://localhost:5173'
const root = fileURLToPath(new URL('../../../../', import.meta.url))
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let db: typeof import('@broke-oclock/db').db
let baseURL = ''

type Account = { id: string; cookie: string; email: string; name: string }
const HERE = { lat: 1.3236, lng: 103.9273 }
const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  Math.hypot((a.lat - b.lat) * 111_320, (a.lng - b.lng) * 111_320 * Math.cos(0.0236))

let signUps = 1
const signUp = async (name: string): Promise<Account> => {
  const email = `nearby-${randomUUID()}@example.test`
  const response = await fetch(`${baseURL}/api/auth/sign-up/email`, {
    method: 'POST',
    // A distinct synthetic client address per sign-up keeps the auth rate limit per person.
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      'X-Forwarded-For': `10.${signUps >> 8}.${signUps++ & 255}.2`,
    },
    body: JSON.stringify({ name, email, password: randomBytes(24).toString('base64url') }),
  })
  expect(response.status).toBe(200)
  const body = await response.json()
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
  return { id: body.user.id as string, cookie, email, name }
}

const call = async (
  account: Account | null,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = { Origin: origin },
) => {
  const response = await fetch(`${baseURL}/api${path}`, {
    method,
    headers: {
      ...(account ? { Cookie: account.cookie } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null, response }
}

const list = (account: Account | null, centre = HERE) =>
  call(account, 'GET', `/presence?lat=${centre.lat}&lng=${centre.lng}`)

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const databaseUrl = mongo.getUri(`nearby_${randomUUID().replaceAll('-', '')}`)
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
}, 180_000)

afterAll(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  await db?.$disconnect()
  await mongo?.stop()
  vi.unstubAllEnvs()
})

describe('showing yourself', () => {
  it('needs a signed-in person', async () => {
    const shared = await call(null, 'PUT', '/presence', HERE)
    expect(shared.status).toBe(401)
    expect((await call(null, 'DELETE', '/presence')).status).toBe(401)
    expect(await db.nearbyPresence.count()).toBe(0)
  })

  it('stores only a fuzzed point and returns the viewer their own spot', async () => {
    const person = await signUp('Synthetic sharer')
    const shared = await call(person, 'PUT', '/presence', { ...HERE, avatar: 'kopi' })
    expect(shared.status).toBe(200)
    const { me } = shared.body
    expect(me.avatar).toBe('kopi')
    expect(me).not.toHaveProperty('userId')
    expect({ lat: me.lat, lng: me.lng }).not.toEqual(HERE)
    expect(metres(me, HERE)).toBeLessThanOrEqual(MAX_FUZZ_METRES + 1)
    const row = await db.nearbyPresence.findUniqueOrThrow({ where: { userId: person.id } })
    expect({ lat: row.lat, lng: row.lng }).toEqual({ lat: me.lat, lng: me.lng })
    expect(row.lat).not.toBe(HERE.lat)
    // The heartbeat keeps the same anonymous token for the session.
    await db.nearbyPresence.update({
      where: { userId: person.id },
      data: { updatedAt: new Date(Date.now() - 60_000) },
    })
    const again = await call(person, 'PUT', '/presence', HERE)
    expect(again.body.me.token).toBe(me.token)
    expect(again.body.me.avatar).toBe('kopi')
    const mine = await list(person)
    expect(mine.body.me.token).toBe(me.token)
    await call(person, 'DELETE', '/presence')
  })

  it('refuses bad input, other places and untrusted origins', async () => {
    const person = await signUp('Synthetic validator')
    for (const body of [
      { lat: 51.5, lng: -0.12 },
      { lat: 1.3, lng: 104.5 },
      { lat: '1.3', lng: 103.9 },
      { lat: 1.3, lng: 103.9, avatar: 'cat' },
      { lat: 1.3, lng: 103.9, userId: person.id },
      {},
    ])
      expect((await call(person, 'PUT', '/presence', body)).status).toBe(400)
    expect(
      (await call(person, 'PUT', '/presence', HERE, { Origin: 'https://evil.test' })).status,
    ).toBe(403)
    expect((await call(person, 'PUT', '/presence', HERE, {})).status).toBe(403)
    expect(
      (await call(person, 'DELETE', '/presence', undefined, { Origin: 'https://evil.test' }))
        .status,
    ).toBe(403)
    expect((await call(null, 'GET', '/presence?lat=51.5&lng=-0.1')).status).toBe(400)
    expect((await call(null, 'GET', '/presence?lat=1.3')).status).toBe(400)
    expect((await call(null, 'GET', '/presence?lat=1.3&lng=103.9&radius=99')).status).toBe(400)
    const post = await call(person, 'POST', '/presence', HERE)
    expect(post.status).toBe(405)
    expect(post.response.headers.get('Allow')).toBe('GET, PUT, DELETE')
    expect(await db.nearbyPresence.count({ where: { userId: person.id } })).toBe(0)
  })
})

describe('seeing who is nearby', () => {
  it('lets anyone list people, anonymously, without the viewer', async () => {
    const alice = await signUp('Synthetic Alice Tan')
    const bob = await signUp('Synthetic Bob Lim')
    await call(alice, 'PUT', '/presence', HERE)
    await call(bob, 'PUT', '/presence', { lat: HERE.lat + 0.002, lng: HERE.lng })

    const before = await db.nearbyPresence.findMany()
    const anonymous = await list(null)
    expect(anonymous.status).toBe(200)
    expect(anonymous.response.headers.get('Cache-Control')).toBe('no-store')
    expect(anonymous.body.me).toBeNull()
    expect(anonymous.body.items).toHaveLength(2)
    // GET never writes.
    expect(await db.nearbyPresence.findMany()).toEqual(before)

    const seen = await list(alice)
    expect(seen.body.items).toHaveLength(1)
    expect(seen.body.me).not.toBeNull()
    expect(seen.body.items[0].token).not.toBe(seen.body.me.token)
    const text = JSON.stringify(seen.body)
    for (const secret of [alice.id, bob.id, alice.name, bob.name, alice.email, bob.email])
      expect(text).not.toContain(secret)
    for (const item of seen.body.items)
      expect(Object.keys(item).sort()).toEqual(['avatar', 'lat', 'lng', 'token'])

    // Someone far away is not listed around here.
    const far = await list(null, { lat: 1.4361, lng: 103.7861 })
    expect(far.body.items).toHaveLength(0)

    await call(alice, 'DELETE', '/presence')
    await call(bob, 'DELETE', '/presence')
  })

  it('drops people whose heartbeat lapsed, and starts a new session after', async () => {
    const person = await signUp('Synthetic lapsed')
    const first = await call(person, 'PUT', '/presence', HERE)
    expect((await list(null)).body.items).toHaveLength(1)
    await db.nearbyPresence.update({
      where: { userId: person.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    expect((await list(null)).body.items).toHaveLength(0)
    expect((await list(person)).body.me).toBeNull()
    const back = await call(person, 'PUT', '/presence', HERE)
    expect(back.body.me.token).not.toBe(first.body.me.token)
    expect((await list(null)).body.items).toHaveLength(1)
    await call(person, 'DELETE', '/presence')
  })

  it('removes a person at once when they hide', async () => {
    const person = await signUp('Synthetic hider')
    await call(person, 'PUT', '/presence', HERE)
    expect((await list(null)).body.items).toHaveLength(1)
    const hidden = await call(person, 'DELETE', '/presence')
    expect(hidden.status).toBe(200)
    expect(hidden.body).toEqual({ ok: true })
    expect((await list(null)).body.items).toHaveLength(0)
    expect(await db.nearbyPresence.count({ where: { userId: person.id } })).toBe(0)
    // Hiding twice is fine.
    expect((await call(person, 'DELETE', '/presence')).status).toBe(200)
  })

  it('caps the list at the nearest sixty', async () => {
    const expiresAt = new Date(Date.now() + 60_000)
    await db.nearbyPresence.createMany({
      data: Array.from({ length: 70 }, (_, index) => ({
        userId: (index + 1).toString(16).padStart(24, 'c'),
        token: `synthetictoken${String(index).padStart(4, '0')}`,
        avatar: 'bao',
        lat: HERE.lat + index * 0.0001,
        lng: HERE.lng,
        offsetNorth: 50,
        offsetEast: 0,
        expiresAt,
      })),
    })
    const listed = await list(null)
    expect(listed.body.items).toHaveLength(60)
    expect(listed.body.items[0].token).toBe('synthetictoken0000')
    expect(listed.body.items.map((item: { token: string }) => item.token)).not.toContain(
      'synthetictoken0069',
    )
    await db.nearbyPresence.deleteMany({ where: { token: { startsWith: 'synthetictoken' } } })
  })
})
