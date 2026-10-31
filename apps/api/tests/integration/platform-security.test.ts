import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { copyFile, mkdir } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parseConfig } from '@api/config'
import { createPlatformSecurityClient } from '@broke-oclock/api-client/platform-security'
import axios from 'axios'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const origin = 'http://localhost:5173'
const root = fileURLToPath(new URL('../../../../', import.meta.url))
const scratch = resolve(tmpdir(), 'lobangers-app-security')
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let db: typeof import('@broke-oclock/db').db
let baseURL = ''
let admin: { id: string; cookie: string }
let member: { id: string; cookie: string }
const httpFor = (cookie = admin.cookie, requestOrigin = origin) =>
  axios.create({
    baseURL: `${baseURL}/api`,
    headers: { Origin: requestOrigin, Cookie: cookie },
    validateStatus: () => true,
  })
const signUp = async (name: string, signIn = false) => {
  const email = `synthetic-${randomUUID()}@example.test`
  const password = randomBytes(24).toString('hex')
  const response = await fetch(`${baseURL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ name, email, password }),
  })
  expect(response.status).toBe(200)
  const body = await response.json()
  if (signIn) {
    const cookie = response.headers
      .getSetCookie()
      .map((v) => v.split(';')[0])
      .join('; ')
    expect(
      (
        await fetch(`${baseURL}/api/auth/sign-out`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie },
          body: '{}',
        })
      ).status,
    ).toBe(200)
  }
  const login = signIn
    ? await fetch(`${baseURL}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({ email, password }),
      })
    : response
  expect(login.status).toBe(200)
  return {
    id: body.user.id as string,
    cookie: login.headers
      .getSetCookie()
      .map((v) => v.split(';')[0])
      .join('; '),
  }
}
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const databaseUrl = mongo.getUri(`platform_security_${randomUUID().replaceAll('-', '')}`)
  if (!databaseUrl.startsWith('mongodb://127.0.0.1:'))
    throw new Error('Disposable loopback database required')
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  await mkdir(scratch, { recursive: true })
  await copyFile(`${root}/packages/db/prisma/schema.prisma`, `${scratch}/schema.prisma`)
  await promisify(execFile)(
    `${root}/packages/db/node_modules/.bin/prisma`,
    ['db', 'push', '--schema', `${scratch}/schema.prisma`, '--skip-generate'],
    {
      cwd: scratch,
      env: { PATH: process.env.PATH, DATABASE_URL: databaseUrl, HOME: scratch, TMPDIR: scratch },
      timeout: 60_000,
    },
  )
  db = (await import('@broke-oclock/db')).db
  const { createApp } = await import('@api/app')
  server = createServer()
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing local server')
  baseURL = `http://127.0.0.1:${address.port}`
  const config = parseConfig({
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    BETTER_AUTH_URL: baseURL,
    WEB_ORIGIN: origin,
  })
  server.on('request', createApp(config))
  admin = await signUp('Synthetic security administrator', true)
  member = await signUp('Synthetic security member', true)
  await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
}, 180_000)
afterAll(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  await db?.$disconnect()
  await mongo?.stop()
  vi.unstubAllEnvs()
})
describe('platform account security HTTP', () => {
  it('paginates only active generation sessions without leaking secrets through the exported client', async () => {
    const session = await db.session.findFirstOrThrow({ where: { userId: member.id } })
    await db.session.update({
      where: { id: session.id },
      data: {
        userAgent: 'Chrome/123 Macintosh secret-ua-sentinel',
        ipAddress: 'secret-ip-sentinel',
      },
    })
    const now = new Date()
    for (const [authVersion, expiresAt] of [
      [0, new Date(now.getTime() + 60_000)],
      [1, new Date(now.getTime() + 60_000)],
      [0, new Date(now.getTime() - 1)],
    ] as const)
      await db.session.create({
        data: {
          userId: member.id,
          token: randomBytes(24).toString('hex'),
          authVersion,
          createdAt: now,
          updatedAt: now,
          expiresAt,
        },
      })
    const client = createPlatformSecurityClient(
      axios.create({
        baseURL: `${baseURL}/api`,
        headers: { Cookie: admin.cookie, Origin: origin },
      }),
    )
    const first = await client.sessions(member.id, { limit: 1 })
    expect(first.items).toHaveLength(1)
    expect(first.nextCursor).not.toBeNull()
    if (!first.nextCursor) throw new Error('Missing continuation cursor')
    const second = await client.sessions(member.id, { limit: 1, cursor: first.nextCursor })
    expect(second.items).toHaveLength(1)
    expect(second.nextCursor).toBeNull()
    const firstRow = first.items[0]
    const secondRow = second.items[0]
    if (!firstRow || !secondRow) throw new Error('Missing session rows')
    expect(firstRow.id < secondRow.id).toBe(true)
    expect(Object.keys(firstRow).sort()).toEqual(['createdAt', 'deviceLabel', 'expiresAt', 'id'])
    expect(JSON.stringify([first, second])).not.toMatch(
      /secret-|token|userAgent|ipAddress|authVersion|loginAt/,
    )
    for (const query of ['limit=0', 'limit=101', 'limit=1.5', 'limit=1&limit=2', 'cursor=bad'])
      expect((await httpFor().get(`/admin/accounts/${member.id}/sessions?${query}`)).status).toBe(
        400,
      )
  })
  it('keeps all GET and HEAD reads side-effect free and enforces the router method allowlist', async () => {
    const snapshot = async () => ({
      users: await db.user.findMany({ orderBy: { id: 'asc' } }),
      sessions: await db.session.findMany({ orderBy: { id: 'asc' } }),
      audits: await db.platformAudit.findMany(),
      fence: await db.platformAccessFence.findMany(),
    })
    const before = await snapshot()
    for (const path of [
      `/admin/accounts/${member.id}/security`,
      `/admin/accounts/${member.id}/sessions`,
      '/admin/security-context',
    ]) {
      expect((await httpFor().get(path)).status).toBe(200)
      expect((await httpFor().head(path)).status).toBe(200)
      const response = await httpFor().put(path, {})
      expect(response.status).toBe(405)
      expect(response.headers['cache-control']).toBe('no-store')
    }
    expect(await snapshot()).toEqual(before)
  })
  it('checks exact origin, confirmation, reason, method, current role and expired actor', async () => {
    const target = await db.user.create({
      data: {
        name: 'Synthetic control target',
        email: `controls-${randomUUID()}@example.test`,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })
    const path = `/admin/accounts/${target.id}/suspend`
    const valid = { expectedVersion: 0, note: 'Synthetic controls', confirmed: true }
    for (const badOrigin of ['', 'https://untrusted.example', `${origin}/`])
      expect((await httpFor(admin.cookie, badOrigin).post(path, valid)).status).toBe(403)
    for (const body of [
      { expectedVersion: 0, note: 'No confirmation' },
      { ...valid, confirmed: false },
      { ...valid, note: ' ' },
      { ...valid, userId: admin.id },
      { ...valid, expectedVersion: -1 },
    ])
      expect((await httpFor().post(path, body)).status).toBe(400)
    expect((await httpFor('').post(path, valid)).status).toBe(401)
    expect((await httpFor(member.cookie).post(path, valid)).status).toBe(403)
    expect((await httpFor().get(path)).status).toBe(405)
    const session = await db.session.findFirstOrThrow({
      where: { userId: admin.id },
      orderBy: { id: 'desc' },
    })
    await db.session.update({ where: { id: session.id }, data: { expiresAt: new Date(0) } })
    expect((await httpFor().post(path, valid)).status).toBe(401)
    await db.session.update({ where: { id: session.id }, data: { expiresAt: session.expiresAt } })
    expect(await db.platformAudit.count({ where: { targetUserId: target.id } })).toBe(0)
  })

  it('suspends another account atomically and invalidates its cookie', async () => {
    const target = await signUp('Synthetic suspension target')
    const response = await httpFor().post(`/admin/accounts/${target.id}/suspend`, {
      expectedVersion: 0,
      confirmed: true,
      note: 'Synthetic suspension',
    })
    expect(response.status).toBe(200)
    expect(response.data).toEqual({ id: target.id, version: 1, affectedSessionCount: 1 })
    expect(await db.session.count({ where: { userId: target.id } })).toBe(0)
    expect((await httpFor(target.cookie).get('/me')).data).toEqual({ error: 'Unauthorized' })
    expect(await db.user.findUnique({ where: { id: target.id } })).toMatchObject({
      suspendedAt: expect.any(Date),
      authVersion: 1,
      platformVersion: 1,
      role: 'USER',
    })
    expect(await db.platformAudit.findMany({ where: { targetUserId: target.id } })).toMatchObject([
      { action: 'ACCOUNT_SUSPENDED', note: 'Synthetic suspension' },
    ])
  })
  it('serves a no-store allowlisted account security view', async () => {
    const response = await httpFor().get(`/admin/accounts/${member.id}/security`)
    expect(response.status).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.data).toEqual({
      userId: member.id,
      version: 0,
      emailVerified: false,
      state: 'ACTIVE',
      suspendedAt: null,
      methods: { passwordConfigured: true, googleLinked: false, emailOtpAvailable: false },
    })
  })
  it('runs confirmed versioned security lifecycle through the exported client, preserving retained account data', async () => {
    const now = new Date()
    const user = await db.user.create({
      data: {
        name: 'Synthetic retained merchant',
        email: `retained-${randomUUID()}@example.test`,
        emailVerified: true,
        role: 'MERCHANT',
        createdAt: now,
        updatedAt: now,
      },
    })
    const merchant = await db.merchant.create({ data: { name: 'Synthetic preserved merchant' } })
    const venue = await db.venue.create({
      data: {
        merchantId: merchant.id,
        name: 'Synthetic preserved venue',
        address: 'Synthetic address',
        latitude: 1.3,
        longitude: 103.8,
      },
    })
    await db.stallGrant.create({ data: { userId: user.id, venueId: venue.id } })
    await db.merchantAccessRequest.create({
      data: {
        userId: user.id,
        venueId: venue.id,
        userName: user.name,
        userEmail: user.email,
        venueName: venue.name,
        merchantName: merchant.name,
        message: 'Retain pending request',
      },
    })
    await db.account.create({
      data: {
        userId: user.id,
        providerId: 'google',
        accountId: 'synthetic-preserved-provider-id',
        accessToken: 'secret-provider-sentinel',
        createdAt: now,
        updatedAt: now,
      },
    })
    await db.deal.create({
      data: {
        title: 'Synthetic preserved submission',
        description: 'Preserve all content',
        category: 'food',
        offerType: 'OTHER',
        applicability: 'NO_FIXED_LOCATION',
        submittedById: user.id,
      },
    })
    const session = await db.session.create({
      data: {
        userId: user.id,
        token: randomBytes(24).toString('hex'),
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + 60_000),
      },
    })
    const second = await db.session.create({
      data: {
        userId: user.id,
        token: randomBytes(24).toString('hex'),
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + 60_000),
      },
    })
    const other = await db.session.findFirstOrThrow({
      where: { userId: admin.id },
      orderBy: { id: 'desc' },
    })
    const retained = async () => ({
      accounts: await db.account.findMany({ where: { userId: user.id } }),
      grants: await db.stallGrant.findMany({ where: { userId: user.id } }),
      requests: await db.merchantAccessRequest.findMany({ where: { userId: user.id } }),
      content: await db.deal.findMany({ where: { submittedById: user.id } }),
    })
    const before = await retained()
    const client = createPlatformSecurityClient(
      axios.create({
        baseURL: `${baseURL}/api`,
        headers: { Cookie: admin.cookie, Origin: origin },
      }),
    )
    const context = await client.context()
    expect(context).toEqual({
      actorUserId: admin.id,
      freshLoginUntil: expect.any(String),
      reauthenticationRequired: false,
    })
    const input = {
      expectedVersion: 0,
      note: 'Synthetic exact-one revocation',
      confirmed: true as const,
    }
    expect(await client.revokeSession(user.id, session.id, input)).toEqual({
      id: user.id,
      version: 1,
      affectedSessionCount: 1,
    })
    expect(await db.session.findUnique({ where: { id: second.id } })).toEqual(second)
    expect(await db.user.findUnique({ where: { id: user.id } })).toMatchObject({
      authVersion: null,
      platformVersion: 1,
    })
    await expect(
      client.revokeSession(user.id, session.id, { ...input, expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    await expect(
      client.revokeSession(user.id, other.id, { ...input, expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(await db.session.findUnique({ where: { id: other.id } })).not.toBeNull()
    expect(await client.revokeSessions(user.id, { ...input, expectedVersion: 1 })).toEqual({
      id: user.id,
      version: 2,
      affectedSessionCount: 1,
    })
    expect(await client.revokeSessions(user.id, { ...input, expectedVersion: 2 })).toEqual({
      id: user.id,
      version: 3,
      affectedSessionCount: 0,
    })
    expect(await client.suspend(user.id, { ...input, expectedVersion: 3 })).toEqual({
      id: user.id,
      version: 4,
      affectedSessionCount: 0,
    })
    await expect(client.suspend(user.id, { ...input, expectedVersion: 4 })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect((await client.account(user.id)).state).toBe('SUSPENDED')
    expect(await client.reinstate(user.id, { ...input, expectedVersion: 4 })).toEqual({
      id: user.id,
      version: 5,
      affectedSessionCount: 0,
    })
    await expect(client.reinstate(user.id, { ...input, expectedVersion: 5 })).rejects.toMatchObject(
      { code: 'CONFLICT' },
    )
    await expect(client.suspend(user.id, { ...input, expectedVersion: 0 })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    await expect(client.revokeSessions(admin.id, input)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(await db.user.findUnique({ where: { id: user.id } })).toMatchObject({
      role: 'MERCHANT',
      suspendedAt: null,
      authVersion: 4,
      platformVersion: 5,
    })
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0)
    expect(await retained()).toEqual(before)
    const audit = await db.platformAudit.findMany({
      where: { targetUserId: user.id },
      orderBy: { id: 'asc' },
    })
    expect(audit.map((row) => row.action)).toEqual([
      'SESSION_REVOKED',
      'SESSIONS_REVOKED',
      'SESSIONS_REVOKED',
      'ACCOUNT_SUSPENDED',
      'ACCOUNT_REINSTATED',
    ])
    expect(audit.map((row) => row.detailsJson)).toEqual([
      { sessionId: session.id, revokedSessionCount: 1 },
      { revokedSessionCount: 1 },
      { revokedSessionCount: 0 },
      { revokedSessionCount: 0, previousStatus: 'ACTIVE', newStatus: 'SUSPENDED' },
      { revokedSessionCount: 0, previousStatus: 'SUSPENDED', newStatus: 'ACTIVE' },
    ])
    expect(JSON.stringify(audit)).not.toContain('secret-provider-sentinel')
  })
  it.each(['suspend', 'reinstate', 'one', 'all'] as const)(
    'rolls back the full security transaction when audit persistence fails: %s',
    async (operation) => {
      const now = new Date()
      const target = await db.user.create({
        data: {
          name: 'Synthetic rollback target',
          email: `rollback-${randomUUID()}@example.test`,
          emailVerified: false,
          createdAt: now,
          updatedAt: now,
          ...(operation === 'reinstate' ? { suspendedAt: now } : {}),
        },
      })
      const session = await db.session.create({
        data: {
          userId: target.id,
          token: randomBytes(24).toString('hex'),
          createdAt: now,
          updatedAt: now,
          expiresAt: new Date(now.getTime() + 60_000),
        },
      })
      const snapshot = async () => ({
        users: await db.user.findMany({ orderBy: { id: 'asc' } }),
        sessions: await db.session.findMany({ orderBy: { id: 'asc' } }),
        audit: await db.platformAudit.findMany({ orderBy: { id: 'asc' } }),
        fence: await db.platformAccessFence.findMany(),
      })
      const before = await snapshot()
      const transact = db.$transaction.bind(db)
      let inserted = false
      const spy = vi.spyOn(db, '$transaction').mockImplementation((work, options) =>
        transact(
          async (tx) =>
            work(
              new Proxy(tx, {
                get(transaction, property, receiver) {
                  if (property !== 'platformAudit')
                    return Reflect.get(transaction, property, receiver)
                  return new Proxy(transaction.platformAudit, {
                    get(delegate, method, delegateReceiver) {
                      if (method !== 'create')
                        return Reflect.get(delegate, method, delegateReceiver)
                      return async (...args: Parameters<typeof delegate.create>) => {
                        await delegate.create(...args)
                        inserted = true
                        throw new Error('secret-audit-failure-sentinel')
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
        const path = `/admin/accounts/${target.id}/${operation === 'suspend' || operation === 'reinstate' ? operation : operation === 'one' ? `sessions/${session.id}` : 'sessions'}`
        const body = { expectedVersion: 0, note: 'Synthetic audit rollback', confirmed: true }
        const response =
          operation === 'suspend' || operation === 'reinstate'
            ? await httpFor().post(path, body)
            : await httpFor().delete(path, { data: body })
        expect(response.status).toBe(500)
        expect(JSON.stringify(response.data)).not.toContain('secret-audit-failure-sentinel')
        expect(inserted).toBe(true)
      } finally {
        spy.mockRestore()
      }
      expect(await snapshot()).toEqual(before)
    },
  )
  it('denies revoked-generation cookies across existing protected families while public community becomes anonymous', async () => {
    const now = new Date()
    const deal = await db.deal.create({
      data: {
        title: 'Synthetic public community',
        description: 'Synthetic content',
        category: 'food',
        offerType: 'OTHER',
        applicability: 'NO_FIXED_LOCATION',
        contentVersion: 1,
        reviewedVersion: 1,
        reviewStatus: 'APPROVED',
        publishedAt: now,
      },
    })
    const comment = await httpFor(member.cookie).post(`/deals/${deal.id}/comments`, {
      body: 'Synthetic preserved comment',
    })
    expect(comment.status).toBe(201)
    expect(
      (await httpFor(member.cookie).put(`/deals/${deal.id}/vote`, { value: 'ALIVE' })).status,
    ).toBe(200)
    expect((await httpFor(member.cookie).get(`/deals/${deal.id}/community`)).data.myVote).toBe(
      'ALIVE',
    )
    await db.user.update({ where: { id: member.id }, data: { authVersion: 1 } })
    const paths = [
      '/account/profile',
      '/account/bookmarks',
      '/account/submissions',
      '/account/venues',
      '/account/merchant-requests',
      '/admin/accounts',
      '/admin/overview',
      '/ingestion/dashboard',
      '/ingestion/accounts',
      '/ingestion/drafts',
      '/ingestion/runs',
      '/ingestion/sources',
      '/ingestion/locations',
    ]
    for (const path of paths)
      expect((await httpFor(member.cookie).get(path)).status, path).toBe(401)
    const writes: ['post' | 'put' | 'patch' | 'delete', string, unknown][] = [
      ['put', `/account/bookmarks/${deal.id}`, {}],
      ['delete', `/account/bookmarks/${deal.id}`, {}],
      ['post', '/account/merchant-requests', { venueId: deal.id, message: 'Synthetic request' }],
      ['put', `/deals/${deal.id}/vote`, { value: 'DEAD' }],
      ['delete', `/deals/${deal.id}/vote`, {}],
      ['post', `/deals/${deal.id}/comments`, { body: 'Denied comment' }],
      ['delete', `/comments/${comment.data.id}`, {}],
      ['post', `/deals/${deal.id}/reports`, { reason: 'SPAM' }],
      ['post', `/comments/${comment.data.id}/reports`, { reason: 'SPAM' }],
      [
        'patch',
        `/admin/accounts/${admin.id}/role`,
        { expectedVersion: 0, role: 'USER', note: 'Denied role', confirmed: true },
      ],
      [
        'post',
        '/admin/stall-grants',
        {
          userId: admin.id,
          venueId: deal.id,
          expectedUserVersion: 0,
          note: 'Denied grant',
          confirmed: true,
        },
      ],
      [
        'delete',
        `/admin/stall-grants/${deal.id}`,
        { expectedVersion: 0, note: 'Denied revoke', confirmed: true },
      ],
      [
        'post',
        `/admin/merchant-requests/${deal.id}/review`,
        { expectedVersion: 0, decision: 'REJECT', note: 'Denied review', confirmed: true },
      ],
      [
        'post',
        '/ingestion/sources',
        { name: 'Denied source', previewUrl: 'https://t.me/s/synthetic' },
      ],
      ['patch', `/ingestion/sources/${deal.id}`, {}],
      ['patch', `/ingestion/drafts/${deal.id}/outlet`, {}],
      ['patch', `/ingestion/drafts/${deal.id}/category`, {}],
      ['post', `/ingestion/drafts/${deal.id}/review`, {}],
      ['post', '/ingestion/runs', {}],
    ]
    for (const [method, path, body] of writes) {
      const response =
        method === 'delete'
          ? await httpFor(member.cookie).delete(path, { data: body })
          : await httpFor(member.cookie)[method](path, body)
      expect(response.status, `${method} ${path}`).toBe(401)
    }
    expect((await httpFor(member.cookie).get('/me')).data).toEqual({ error: 'Unauthorized' })
    const summary = await httpFor(member.cookie).get(`/deals/${deal.id}/community`)
    expect(summary.status).toBe(200)
    expect(summary.data).toMatchObject({ myVote: null, alive: 1 })
    const comments = await httpFor(member.cookie).get(`/deals/${deal.id}/comments`)
    expect(comments.status).toBe(200)
    expect(comments.data.items).toMatchObject([{ id: comment.data.id, canDelete: false }])
    expect(await db.comment.count({ where: { dealId: deal.id } })).toBe(1)
    await db.user.update({ where: { id: member.id }, data: { authVersion: null } })
  })
  it('serializes mutually suspending administrators and excludes suspended administrators from the active count', async () => {
    await db.user.update({ where: { id: member.id }, data: { role: 'ADMIN' } })
    const dormant = await db.user.create({
      data: {
        name: 'Synthetic suspended administrator',
        email: `dormant-${randomUUID()}@example.test`,
        role: 'ADMIN',
        suspendedAt: new Date(),
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })
    const results = await Promise.all([
      httpFor(admin.cookie).post(`/admin/accounts/${member.id}/suspend`, {
        expectedVersion: 0,
        note: 'Synthetic race A',
        confirmed: true,
      }),
      httpFor(member.cookie).post(`/admin/accounts/${admin.id}/suspend`, {
        expectedVersion: 0,
        note: 'Synthetic race B',
        confirmed: true,
      }),
    ])
    expect(results.filter((r) => r.status === 200)).toHaveLength(1)
    expect(results.filter((r) => [401, 409].includes(r.status))).toHaveLength(1)
    const { activeAccount } = await import('@api/modules/account/security-access')
    expect(await db.user.count({ where: { role: 'ADMIN', ...activeAccount } })).toBe(1)
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: dormant.id } })).suspendedAt,
    ).not.toBeNull()
  })
})

describe('persisted session helper invariants (not native-login fixtures)', () => {
  const fixture = async () => {
    const now = new Date()
    const user = await db.user.create({
      data: {
        name: 'Synthetic helper administrator',
        email: `helper-${randomUUID()}@example.test`,
        role: 'ADMIN',
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      },
    })
    const session = await db.session.create({
      data: {
        userId: user.id,
        token: `secret-fixture-${randomUUID()}`,
        createdAt: now,
        loginAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + 3_600_000),
      },
    })
    return { user, session, actor: { userId: user.id, sessionId: session.id }, now }
  }
  it('supports null/missing zero generations read-only and touches only mutable timestamps for writes', async () => {
    const { readActiveSession, requireActiveSessionWrite } = await import(
      '@api/modules/account/security-access'
    )
    const f = await fixture()
    await db.user.update({
      where: { id: f.user.id },
      data: { authVersion: { unset: true }, suspendedAt: { unset: true } },
    })
    await db.session.update({ where: { id: f.session.id }, data: { authVersion: null } })
    const beforeUser = await db.user.findUniqueOrThrow({ where: { id: f.user.id } })
    const before = await db.session.findUniqueOrThrow({ where: { id: f.session.id } })
    await expect(readActiveSession(db, f.actor, f.now)).resolves.toMatchObject({
      user: { id: f.user.id },
      session: { id: f.session.id },
    })
    expect(await db.session.findUnique({ where: { id: f.session.id } })).toEqual(before)
    expect(await db.user.findUnique({ where: { id: f.user.id } })).toEqual(beforeUser)
    await db.$transaction((tx) => requireActiveSessionWrite(tx, f.actor, f.now))
    const after = await db.session.findUniqueOrThrow({ where: { id: f.session.id } })
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime())
    expect({ ...after, updatedAt: before.updatedAt }).toEqual(before)
  })
  it.each(['missing-login', 'old', 'future', 'renewed', 'nonfinite'] as const)(
    'requires primary trusted sign-in for sensitive writes: %s',
    async (mode) => {
      const { requireRecentAdminWrite } = await import('@api/modules/account/security-access')
      const f = await fixture()
      if (mode === 'missing-login')
        await db.session.update({ where: { id: f.session.id }, data: { loginAt: { unset: true } } })
      if (mode === 'old')
        await db.session.update({
          where: { id: f.session.id },
          data: {
            loginAt: new Date(f.now.getTime() - 300_001),
            createdAt: new Date(f.now.getTime() - 300_001),
          },
        })
      if (mode === 'future')
        await db.session.update({
          where: { id: f.session.id },
          data: {
            loginAt: new Date(f.now.getTime() + 1),
            createdAt: new Date(f.now.getTime() + 1),
          },
        })
      if (mode === 'renewed')
        await db.session.update({
          where: { id: f.session.id },
          data: { createdAt: new Date(f.now.getTime() - 1) },
        })
      await expect(
        db.$transaction((tx) =>
          requireRecentAdminWrite(tx, f.actor, mode === 'nonfinite' ? new Date(Number.NaN) : f.now),
        ),
      ).rejects.toMatchObject({
        code: mode === 'nonfinite' ? 'UNAUTHORIZED' : 'PRECONDITION_FAILED',
      })
    },
  )
  it('accepts exactly the five-minute boundary without renewing primary-login origin', async () => {
    const { requireRecentAdminWrite } = await import('@api/modules/account/security-access')
    const f = await fixture()
    await expect(
      db.$transaction((tx) =>
        requireRecentAdminWrite(tx, f.actor, new Date(f.now.getTime() + 300_000)),
      ),
    ).resolves.toMatchObject({ id: f.user.id })
    const session = await db.session.findUniqueOrThrow({ where: { id: f.session.id } })
    expect(session.loginAt).toEqual(f.session.loginAt)
    expect(session.createdAt).toEqual(f.session.createdAt)
    expect(session.expiresAt).toEqual(f.session.expiresAt)
  })
  it('rolls back a write when its exact actor session is deleted after the authorization read', async () => {
    const { requireActiveSessionWrite } = await import('@api/modules/account/security-access')
    const f = await fixture()
    let signal!: () => void
    let release!: () => void
    const reached = new Promise<void>((resolve) => {
      signal = resolve
    })
    const resume = new Promise<void>((resolve) => {
      release = resolve
    })
    const before = await db.user.findUniqueOrThrow({ where: { id: f.user.id } })
    const pending = db
      .$transaction(async (tx) => {
        await requireActiveSessionWrite(
          new Proxy(tx, {
            get(transaction, property, receiver) {
              if (property !== 'session') return Reflect.get(transaction, property, receiver)
              return new Proxy(transaction.session, {
                get(delegate, method, delegateReceiver) {
                  if (method !== 'updateMany')
                    return Reflect.get(delegate, method, delegateReceiver)
                  return async (...args: Parameters<typeof delegate.updateMany>) => {
                    signal()
                    await resume
                    return delegate.updateMany(...args)
                  }
                },
              })
            },
          }),
          f.actor,
          f.now,
        )
        return tx.user.update({
          where: { id: f.user.id },
          data: { name: 'Forbidden committed name' },
        })
      })
      .then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      )
    try {
      await reached
      await db.session.delete({ where: { id: f.session.id } })
      release()
      expect(await pending).toMatchObject({ error: { code: 'P2034' } })
      expect(await db.user.findUnique({ where: { id: f.user.id } })).toEqual(before)
      expect(await db.session.findUnique({ where: { id: f.session.id } })).toBeNull()
    } finally {
      release()
      await pending
    }
  })
  it.each(['wrong-owner', 'expired', 'generation', 'suspended', 'deleted', 'id-only'] as const)(
    'rejects invalid persisted actors: %s',
    async (mode) => {
      const { readActiveSession, requireActiveSessionWrite } = await import(
        '@api/modules/account/security-access'
      )
      const f = await fixture()
      let actor: unknown = f.actor
      if (mode === 'wrong-owner') actor = { ...f.actor, userId: member.id }
      if (mode === 'expired')
        await db.session.update({ where: { id: f.session.id }, data: { expiresAt: f.now } })
      if (mode === 'generation')
        await db.user.update({ where: { id: f.user.id }, data: { authVersion: 1 } })
      if (mode === 'suspended')
        await db.user.update({ where: { id: f.user.id }, data: { suspendedAt: f.now } })
      if (mode === 'deleted') await db.session.delete({ where: { id: f.session.id } })
      if (mode === 'id-only') actor = f.user.id
      await expect(readActiveSession(db, actor as typeof f.actor, f.now)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      })
      await expect(
        db.$transaction((tx) => requireActiveSessionWrite(tx, actor as typeof f.actor, f.now)),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    },
  )
})
