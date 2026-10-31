import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parseConfig } from '@api/config'
import { createApiClient } from '@broke-oclock/api-client'
import type { IngestionSourcesResponse } from '@broke-oclock/contracts/ingestion-sources'
import axios, { type AxiosResponse } from 'axios'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const origin = 'http://localhost:5173'
const root = fileURLToPath(new URL('../../../../', import.meta.url))
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let db: typeof import('@broke-oclock/db').db
let baseURL = ''
let databaseUrl = ''
let admin: { id: string; cookie: string }
let member: { id: string; cookie: string }
const signUp = async (name: string) => {
  const response = await fetch(`${baseURL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      name,
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
      .map((v) => v.split(';')[0])
      .join('; '),
  }
}
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  databaseUrl = mongo.getUri(`sources_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  await promisify(execFile)('pnpm', ['--dir', 'packages/db', 'run', 'push'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    timeout: 60_000,
  })
  db = (await import('@broke-oclock/db')).db
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
  admin = await signUp('Synthetic admin')
  member = await signUp('Synthetic member')
  await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
}, 180_000)
afterAll(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  await db?.$disconnect()
  await mongo?.stop()
  vi.unstubAllEnvs()
})
const http = (cookie = admin.cookie, requestOrigin = origin) =>
  axios.create({
    baseURL,
    validateStatus: () => true,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(requestOrigin ? { Origin: requestOrigin } : {}),
    },
  })
const add = (channel = `Source${randomBytes(6).toString('hex')}`) =>
  http().post('/api/ingestion/sources', {
    name: 'Synthetic source',
    previewUrl: `https://t.me/s/${channel}`,
  })

describe('source administration: native HTTP/auth and disposable Mongo', () => {
  it('adds a disabled source without fetching a provider and lists only public fields', async () => {
    const response = await add('ThisCounted')
    expect(response.status).toBe(201)
    expect(response.data).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{24}$/),
      name: 'Synthetic source',
      provider: 'TELEGRAM',
      externalId: 'thiscounted',
      url: 'https://t.me/s/ThisCounted',
      enabled: false,
      updatedAt: expect.any(String),
    })
    const stored = await db.importSource.findUniqueOrThrow({ where: { id: response.data.id } })
    expect(stored).toMatchObject({ enabled: false, cursor: null, leaseToken: null })
    const page = await http().get('/api/ingestion/sources')
    expect(page.status).toBe(200)
    expect(page.data.items).toContainEqual(response.data)
    expect(page.data.nextCursor).toBeNull()
  })

  it('enables only with explicit reuse confirmation, compares timestamps, and preserves history/leases on disable', async () => {
    const created = await add()
    expect(created.status).toBe(201)
    const path = `/api/ingestion/sources/${created.data.id}`
    const input = { enabled: true, expectedUpdatedAt: created.data.updatedAt }
    expect((await http().patch(path, input)).status).toBe(400)
    const enabled = await http().patch(path, { ...input, reuseConfirmed: true })
    expect(enabled.status).toBe(200)
    expect(enabled.data.enabled).toBe(true)
    expect(enabled.data.updatedAt).not.toBe(created.data.updatedAt)
    expect((await http().patch(path, { ...input, reuseConfirmed: true })).status).toBe(409)
    const leaseUntil = new Date(Date.now() + 60_000)
    const leased = await db.importSource.update({
      where: { id: created.data.id },
      data: { cursor: 'preserve-history', leaseToken: 'other-worker', leaseExpiresAt: leaseUntil },
    })
    const disabled = await http().patch(path, {
      enabled: false,
      expectedUpdatedAt: leased.updatedAt.toISOString(),
    })
    expect(disabled.status).toBe(200)
    expect(disabled.data.enabled).toBe(false)
    expect(
      await db.importSource.findUniqueOrThrow({ where: { id: created.data.id } }),
    ).toMatchObject({
      cursor: 'preserve-history',
      leaseToken: 'other-worker',
      leaseExpiresAt: leaseUntil,
    })
  })
  it('characterization: rejects malformed literal URLs before provider I/O and rejects extra create controls', async () => {
    const before = await db.importSource.count()
    for (const previewUrl of [
      'http://t.me/s/channel',
      'https://t.me:443/s/channel',
      'https://u:p@t.me/s/channel',
      'https://t.me.evil.test/s/channel',
      'https://telegram.me/s/channel',
      'https://t.me/s/channel?before=2',
      'https://t.me/s/channel#x',
      'https://t.me/c/123',
      'https://t.me/+invite',
      'https://t.me/s/%63hannel',
      'https://t.me/s/../channel',
      'https://t.me/s/channel/1',
      'https://t.me/s/channel%2fother',
      ' https://t.me/s/channel',
      'https://t.me/s/channel\n',
      'https://t.me/s/channel/',
      'https://t.me/s/c',
      'https://t.me/s/JOINCHAT',
      `https://t.me/s/${'a'.repeat(33)}`,
    ])
      expect(
        (await http().post('/api/ingestion/sources', { name: 'Fixture', previewUrl })).status,
        previewUrl,
      ).toBe(400)
    expect(
      (
        await http().post('/api/ingestion/sources', {
          name: 'Fixture',
          previewUrl: 'https://t.me/s/channel',
          enabled: true,
        })
      ).status,
    ).toBe(400)
    expect(await db.importSource.count()).toBe(before)
    const short = await add('Ab3')
    expect(short.status).toBe(201)
    expect(short.data.externalId).toBe('ab3')
  })
  it('characterization: detects mixed-case legacy identity without replacing it and serializes concurrent case variants', async () => {
    const legacy = await db.importSource.create({
      data: {
        provider: 'TELEGRAM',
        externalId: 'LegacyCounted',
        name: 'Legacy',
        url: 'https://t.me/s/LegacyCounted',
        cursor: 'legacy-history',
        enabled: false,
      },
    })
    expect((await add('legacycounted')).status).toBe(409)
    expect(await db.importSource.findUniqueOrThrow({ where: { id: legacy.id } })).toEqual(legacy)
    const channel = `Concurrent${randomBytes(4).toString('hex')}`
    const results = await Promise.all([add(channel), add(channel.toUpperCase())])
    expect(results.map((r) => r.status).sort()).toEqual([201, 409])
    expect(
      await db.importSource.count({
        where: { provider: 'TELEGRAM', externalId: { equals: channel, mode: 'insensitive' } },
      }),
    ).toBe(1)
  })

  it('characterization: enforces current admin and exact origin on both writes; GET and HEAD never mutate', async () => {
    const created = await add()
    const path = `/api/ingestion/sources/${created.data.id}`
    const body = { enabled: true, reuseConfirmed: true, expectedUpdatedAt: created.data.updatedAt }
    const addBody = { name: 'Forbidden', previewUrl: 'https://t.me/s/ForbiddenChannel' }
    for (const client of [
      http(''),
      http(member.cookie),
      http(admin.cookie, 'https://hostile.test'),
      http(admin.cookie, ''),
    ]) {
      expect((await client.post('/api/ingestion/sources', addBody)).status).toBe(
        client.defaults.headers.Cookie ? 403 : 401,
      )
      expect((await client.patch(path, body)).status).toBe(
        client.defaults.headers.Cookie ? 403 : 401,
      )
    }
    expect((await http('').get('/api/ingestion/sources')).status).toBe(401)
    expect((await http(member.cookie).get('/api/ingestion/sources')).status).toBe(403)
    const before = await Promise.all([
      db.importSource.findMany(),
      db.user.findMany(),
      db.session.findMany(),
      db.platformAccessFence.findMany(),
    ])
    expect((await http().get('/api/ingestion/sources')).status).toBe(200)
    expect((await http().head('/api/ingestion/sources')).status).toBe(200)
    for (const method of ['get', 'head', 'post', 'put', 'delete']) {
      const response = await http().request({ method, url: path })
      expect(response.status).toBe(405)
      expect(response.headers.allow).toBe('PATCH')
    }
    expect(
      await Promise.all([
        db.importSource.findMany(),
        db.user.findMany(),
        db.session.findMany(),
        db.platformAccessFence.findMany(),
      ]),
    ).toEqual(before)
    await db.user.update({ where: { id: admin.id }, data: { role: 'USER' } })
    try {
      expect((await http().get('/api/ingestion/sources')).status).toBe(403)
      expect((await http().patch(path, body)).status).toBe(403)
      expect((await http().post('/api/ingestion/sources', addBody)).status).toBe(403)
    } finally {
      await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
    }
    expect(
      await db.importSource.findUniqueOrThrow({ where: { id: created.data.id } }),
    ).toMatchObject({ enabled: false, updatedAt: new Date(created.data.updatedAt) })
  })
  it('characterization: lists bounded registered rows only, excludes arbitrary sources, and keeps WordPress read-only', async () => {
    const fixed = await db.importSource.create({
      data: {
        provider: 'WORDPRESS',
        externalId: 'moneydigest.sg',
        url: 'https://www.moneydigest.sg/',
        name: 'MoneyDigest',
      },
    })
    const excluded = await Promise.all([
      db.importSource.create({
        data: {
          provider: 'WORDPRESS',
          externalId: 'arbitrary.test',
          url: 'https://arbitrary.test/',
          name: 'Arbitrary',
        },
      }),
      db.importSource.create({
        data: {
          provider: 'TELEGRAM',
          externalId: 'mismatch',
          url: 'https://t.me/s/channel',
          name: 'Mismatch',
        },
      }),
      db.importSource.create({
        data: {
          provider: 'TELEGRAM',
          externalId: 'private',
          url: 'https://t.me/c/123',
          name: 'Private',
        },
      }),
    ])
    const all: { id: string }[] = []
    let cursor: string | null = null
    const seen = new Set<string>()
    do {
      const page: AxiosResponse<IngestionSourcesResponse> = await http().get(
        '/api/ingestion/sources',
        { params: { limit: 2, ...(cursor ? { cursor } : {}) } },
      )
      expect(page.status).toBe(200)
      expect(page.data.items.length).toBeLessThanOrEqual(2)
      all.push(...page.data.items)
      cursor = page.data.nextCursor
      if (cursor) {
        expect(seen.has(cursor)).toBe(false)
        seen.add(cursor)
      }
    } while (cursor)
    expect(all.map((row) => row.id)).toContain(fixed.id)
    expect(all.map((row) => row.id)).not.toEqual(
      expect.arrayContaining(excluded.map((row) => row.id)),
    )
    for (const row of excluded) expect(all.map((item) => item.id)).not.toContain(row.id)
    const before = await db.importSource.findUniqueOrThrow({ where: { id: fixed.id } })
    expect(
      (
        await http().patch(`/api/ingestion/sources/${fixed.id}`, {
          enabled: true,
          reuseConfirmed: true,
          expectedUpdatedAt: fixed.updatedAt.toISOString(),
        })
      ).status,
    ).toBe(403)
    expect(await db.importSource.findUniqueOrThrow({ where: { id: fixed.id } })).toEqual(before)
    for (const params of [
      { limit: 51 },
      { limit: 0 },
      { limit: '2x' },
      { cursor: 'not-an-id' },
      { provider: 'WORDPRESS' },
    ])
      expect((await http().get('/api/ingestion/sources', { params })).status).toBe(400)
  })
  it('characterization: the public typed Axios client talks to actual Express/auth/Prisma without provider I/O', async () => {
    const client = createApiClient(`${baseURL}/api`)
    client.http.defaults.headers.common.Cookie = admin.cookie
    client.http.defaults.headers.common.Origin = origin
    const network = vi.spyOn(globalThis, 'fetch')
    try {
      const created = await client.ingestion.addSource({
        name: 'Typed source',
        previewUrl: `https://t.me/s/Typed${randomBytes(4).toString('hex')}`,
      })
      expect(created.enabled).toBe(false)
      const enabled = await client.ingestion.setSourceEnabled(created.id, {
        enabled: true,
        reuseConfirmed: true,
        expectedUpdatedAt: created.updatedAt,
      })
      expect(enabled.enabled).toBe(true)
      const disabled = await client.ingestion.setSourceEnabled(created.id, {
        enabled: false,
        expectedUpdatedAt: enabled.updatedAt,
      })
      expect(disabled.enabled).toBe(false)
      expect((await client.ingestion.sources({ limit: 50 })).items).toContainEqual(disabled)
      expect(network).not.toHaveBeenCalled()
    } finally {
      network.mockRestore()
    }
  })
  it('characterization: conflicts on source changes or out-of-band actor demotion during the transaction', async () => {
    const { PrismaClient } = await import('@broke-oclock/db')
    const concurrent = new PrismaClient({ datasourceUrl: databaseUrl })
    for (const target of ['importSource', 'user'] as const) {
      const created = await add()
      const before = await db.importSource.findUniqueOrThrow({ where: { id: created.data.id } })
      const transact = db.$transaction.bind(db)
      let armed = true
      const spy = vi.spyOn(db, '$transaction').mockImplementation((operation, options) =>
        transact(
          async (tx) =>
            operation(
              new Proxy(tx, {
                get(transaction, property, receiver) {
                  if (property !== target) return Reflect.get(transaction, property, receiver)
                  return new Proxy(transaction[target], {
                    get(delegate, method, receiver) {
                      if (method !== 'findUnique') return Reflect.get(delegate, method, receiver)
                      return async (...args: unknown[]) => {
                        const result = await Reflect.apply(
                          Reflect.get(delegate, method),
                          delegate,
                          args,
                        )
                        if (armed) {
                          armed = false
                          if (target === 'user')
                            await concurrent.user.update({
                              where: { id: admin.id },
                              data: { role: 'USER' },
                            })
                          else
                            await concurrent.importSource.update({
                              where: { id: before.id },
                              data: { cursor: 'concurrent-history' },
                            })
                        }
                        return result
                      }
                    },
                  })
                },
              }),
            ),
          options,
        ),
      )
      try {
        const result = await http().patch(`/api/ingestion/sources/${before.id}`, {
          enabled: true,
          reuseConfirmed: true,
          expectedUpdatedAt: before.updatedAt.toISOString(),
        })
        expect(result.status, target).toBe(409)
        expect(await db.importSource.findUniqueOrThrow({ where: { id: before.id } })).toMatchObject(
          { enabled: false, cursor: target === 'importSource' ? 'concurrent-history' : null },
        )
      } finally {
        spy.mockRestore()
        await concurrent.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
      }
    }
    await concurrent.$disconnect()
  })
  it('characterization: simultaneous stale-version toggles commit at most once and never retry intent', async () => {
    const created = await add()
    const path = `/api/ingestion/sources/${created.data.id}`
    const results = await Promise.all(
      [true, false].map((enabled) =>
        http().patch(path, {
          enabled,
          reuseConfirmed: enabled,
          expectedUpdatedAt: created.data.updatedAt,
        }),
      ),
    )
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    const winner = results.find((r) => r.status === 200)
    expect(
      await db.importSource.findUniqueOrThrow({ where: { id: created.data.id } }),
    ).toMatchObject({ enabled: winner?.data.enabled, updatedAt: new Date(winner?.data.updatedAt) })
  })
})
