import { execFile } from 'node:child_process'
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { NativeDatabaseHooks } from '@broke-oclock/auth/server'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const scratch = resolve(tmpdir(), 'lobangers-native-security')
const origin = 'http://localhost:5173'
const nativeFetch = globalThis.fetch
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = {
  ...publicKey.export({ format: 'jwk' }),
  kid: 'native-security-test',
  alg: 'RS256',
  use: 'sig',
}
const googleToken = (email: string, subject: string) => {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const payload = `${encode({ alg: 'RS256', kid: jwk.kid })}.${encode({ iss: 'https://accounts.google.com', aud: 'native-security.apps.googleusercontent.com', sub: subject, email, email_verified: true, name: 'Controlled Google', iat: now, exp: now + 300 })}`
  return `${payload}.${sign('RSA-SHA256', Buffer.from(payload), privateKey).toString('base64url')}`
}
const grants = new Map<string, { email: string; subject: string; challenge: string }>()
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let baseURL = ''
let db!: typeof import('@broke-oclock/db').db
let auth!: ReturnType<typeof import('@broke-oclock/auth/server').createAuth>
const mail = new Map<string, string>()
let ip = 1
type SessionBefore = NonNullable<
  NonNullable<NonNullable<NativeDatabaseHooks['session']>['create']>['before']
>
type NativeContext = Parameters<SessionBefore>[1]
let contextTransform: (ctx: NativeContext) => NativeContext = (ctx) => ctx
let bypassSessionStamp = false
let creationObserver: (data: Record<string | symbol, unknown>) => Promise<void> = async () => {}
let accountUpdateObserver: () => Promise<void> = async () => {}
let accountObserver: () => Promise<void> = async () => {}
let deletionObserver: (path: string | undefined) => Promise<void> = async () => {}
let userObserver: () => Promise<void> = async () => {}
let updateObserver: () => Promise<void> = async () => {}
const barrier = () => {
  let arrived!: () => void
  let release!: () => void
  const waiting = new Promise<void>((resolve) => {
    arrived = resolve
  })
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  return {
    waiting,
    release,
    pause: async () => {
      arrived()
      await gate
    },
  }
}
const observeTransaction = <T extends object>(
  tx: T,
  model: 'user' | 'session',
  before: () => Promise<void>,
): T =>
  new Proxy(tx, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver)
      if (key !== model || typeof value !== 'object' || value === null) return value
      return new Proxy(value, {
        get(delegate, method, delegateReceiver) {
          const original: unknown = Reflect.get(delegate, method, delegateReceiver)
          if (method === 'updateMany' && typeof original === 'function')
            return async (...args: unknown[]) => {
              await before()
              return Reflect.apply(original, delegate, args)
            }
          return typeof original === 'function' ? original.bind(delegate) : original
        },
      })
    },
  })
const request = (path: string, body?: object, cookie = '', method = body ? 'POST' : 'GET') =>
  nativeFetch(`${baseURL}/api/auth${path}`, {
    method,
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      Cookie: cookie,
      'X-Forwarded-For': `198.51.100.${ip++}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'manual',
  })
const cookieOf = (r: Response) =>
  r.headers
    .getSetCookie()
    .map((h) => h.split(';')[0])
    .join('; ')
const identity = async () => {
  const email = `native-security-${randomUUID()}@example.test`
  const password = randomBytes(24).toString('base64url')
  const signup = await request('/sign-up/email', {
    email,
    password,
    name: 'Disposable native identity',
  })
  expect(signup.status).toBe(200)
  const user = await db.user.findUniqueOrThrow({ where: { email } })
  return { email, password, user, cookie: cookieOf(signup) }
}
const primary = async (
  local: Awaited<ReturnType<typeof identity>>,
  method: 'password' | 'otp' | 'google-direct' | 'google-callback',
) => {
  if (method === 'password')
    return request('/sign-in/email', { email: local.email, password: local.password })
  if (method === 'otp') {
    expect(
      (await request('/email-otp/send-verification-otp', { email: local.email, type: 'sign-in' }))
        .status,
    ).toBe(200)
    return request('/sign-in/email-otp', { email: local.email, otp: mail.get(local.email) })
  }
  const subject = randomUUID()
  if (method === 'google-direct')
    return request('/sign-in/social', {
      provider: 'google',
      idToken: { token: googleToken(local.email, subject) },
    })
  const start = await request('/sign-in/social', {
    provider: 'google',
    callbackURL: `${origin}/admin`,
    disableRedirect: true,
  })
  expect(start.status).toBe(200)
  const authorization = new URL((await start.json()).url)
  const code = randomBytes(24).toString('base64url')
  grants.set(code, {
    email: local.email,
    subject,
    challenge: authorization.searchParams.get('code_challenge') ?? '',
  })
  return request(
    `/callback/google?${new URLSearchParams({ code, state: authorization.searchParams.get('state') ?? '' })}`,
    undefined,
    cookieOf(start),
  )
}
const suspend = async (id: string) =>
  db.$runCommandRaw({
    update: 'User',
    updates: [
      {
        q: { _id: { $oid: id } },
        u: {
          $set: {
            suspendedAt: { $date: new Date().toISOString() },
            authVersion: 1,
            platformVersion: 1,
          },
        },
      },
    ],
  })

beforeAll(async () => {
  if (process.env.DATABASE_URL)
    throw new Error('Native security fixture refuses ambient DATABASE_URL')
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const databaseUrl = mongo.getUri(`native_security_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  // Scratch cwd/schema prevents dotenv discovery and shared generation.
  await mkdir(scratch, { recursive: true })
  await copyFile(`${root}/packages/db/prisma/schema.prisma`, `${scratch}/schema.prisma`)
  await promisify(execFile)(
    `${root}/packages/db/node_modules/.bin/prisma`,
    ['db', 'push', '--schema', `${scratch}/schema.prisma`, '--skip-generate'],
    { cwd: scratch, env: { ...process.env, DATABASE_URL: databaseUrl }, timeout: 60_000 },
  )
  db = (await import('@broke-oclock/db')).db
  const { createAuth } = await import('@broke-oclock/auth/server')
  const { toNodeHandler } = await import('@broke-oclock/auth/node')
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [jwk] })
    if (url === 'https://oauth2.googleapis.com/token') {
      const body = new URLSearchParams(String(init?.body))
      const grant = grants.get(body.get('code') ?? '')
      if (!grant) return Response.json({ error: 'invalid_grant' }, { status: 400 })
      grants.delete(body.get('code') ?? '')
      expect(
        createHash('sha256')
          .update(body.get('code_verifier') ?? '')
          .digest('base64url') === grant.challenge,
      ).toBe(true)
      return Response.json({
        access_token: randomBytes(24).toString('base64url'),
        token_type: 'Bearer',
        expires_in: 300,
        id_token: googleToken(grant.email, grant.subject),
      })
    }
    if (!url.startsWith('http://127.0.0.1:')) throw new Error('Unexpected external network')
    return nativeFetch(input, init)
  })
  server = createServer()
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No disposable listener')
  baseURL = `http://127.0.0.1:${address.port}`
  auth = createAuth({
    baseURL,
    trustedOrigin: origin,
    google: {
      clientId: 'native-security.apps.googleusercontent.com',
      clientSecret: 'disposable-secret',
    },
    secret: randomBytes(32).toString('hex'),
    sendEmailOTP: async ({ email, otp }) => {
      mail.set(email, otp)
    },
  })
  const hooks: NativeDatabaseHooks = auth.options.databaseHooks
  hooks.session ??= {}
  const sessionHooks = hooks.session
  sessionHooks.create ??= {}
  const create = sessionHooks.create
  const before = create.before
  create.before = async (data, ctx) => {
    const result =
      before && !bypassSessionStamp ? await before(data, contextTransform(ctx)) : { data }
    if (result && typeof result === 'object') await creationObserver(result.data)
    return result
  }
  sessionHooks.update ??= {}
  const update = sessionHooks.update
  const beforeUpdate = update.before
  update.before = async (data, ctx) => {
    const result = beforeUpdate ? await beforeUpdate(data, ctx) : { data }
    await updateObserver()
    return result
  }
  const accountCreation = hooks.account?.create
  if (!accountCreation?.before) throw new Error('Missing native Google account hook')
  const beforeAccount = accountCreation.before
  accountCreation.before = async (data, ctx) => {
    const result = await beforeAccount(data, ctx)
    if (result && typeof result === 'object') await accountObserver()
    return result
  }
  hooks.account ??= {}
  hooks.account.update ??= {}
  const accountUpdate = hooks.account.update
  const beforeAccountUpdate = accountUpdate.before
  accountUpdate.before = async (data, ctx) => {
    const result = beforeAccountUpdate ? await beforeAccountUpdate(data, ctx) : { data }
    await accountUpdateObserver()
    return result
  }
  hooks.user ??= {}
  hooks.user.update ??= {}
  const userUpdate = hooks.user.update
  const beforeUser = userUpdate.before
  userUpdate.before = async (data, ctx) => {
    const result = beforeUser ? await beforeUser(data, ctx) : { data }
    await userObserver()
    return result
  }
  sessionHooks.delete ??= {}
  const sessionDelete = sessionHooks.delete
  const beforeSessionDelete = sessionDelete.before
  sessionDelete.before = async (row, ctx) => {
    const result = beforeSessionDelete ? await beforeSessionDelete(row, ctx) : undefined
    await deletionObserver(ctx?.path)
    return result
  }
  const accountHooks = hooks.account
  accountHooks.delete ??= {}
  const accountDelete = accountHooks.delete
  const beforeAccountDelete = accountDelete.before
  accountDelete.before = async (row, ctx) => {
    const result = beforeAccountDelete ? await beforeAccountDelete(row, ctx) : undefined
    await deletionObserver(ctx?.path)
    return result
  }
  const inventory = Object.entries(auth.api).map(([name, endpoint]) => {
    const options: unknown = Reflect.get(endpoint, 'options')
    return {
      name,
      path: Reflect.get(endpoint, 'path') ?? null,
      method:
        typeof options === 'object' && options !== null
          ? (Reflect.get(options, 'method') ?? null)
          : null,
    }
  })
  await writeFile(`${scratch}/native-endpoint-inventory.json`, JSON.stringify(inventory, null, 2))
  server.on('request', toNodeHandler(auth))
}, 180_000)
afterAll(async () => {
  if (server) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server?.close(() => resolve()))
  }
  await db?.$disconnect()
  await mongo?.stop()
  expect(server?.listening).toBe(false)
  expect(mongo?.state).toBe('stopped')
  mail.clear()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('native account-security admission with disposable Mongo and real HTTP', () => {
  it('mints private primary-login evidence for password and OTP, never signup', async () => {
    const local = await identity()
    const signup = await db.session.findFirstOrThrow({ where: { userId: local.user.id } })
    expect(signup.loginAt).toBeNull()
    const signedIn = await request('/sign-in/email', {
      email: local.email,
      password: local.password,
      authVersion: 99,
      loginAt: new Date().toISOString(),
    })
    expect(signedIn.status).toBe(200)
    const output = JSON.stringify(await signedIn.json())
    for (const field of ['authVersion', 'platformVersion', 'suspendedAt', 'loginAt'])
      expect(output.includes(field)).toBe(false)
    const passwordSession = await db.session.findFirstOrThrow({
      where: { userId: local.user.id },
      orderBy: { createdAt: 'desc' },
    })
    expect(passwordSession.authVersion).toBe(0)
    expect(passwordSession.loginAt?.getTime()).toBe(passwordSession.createdAt.getTime())
    expect(
      (await request('/email-otp/send-verification-otp', { email: local.email, type: 'sign-in' }))
        .status,
    ).toBe(200)
    const otp = mail.get(local.email)
    if (!otp) throw new Error('No controlled OTP')
    const otpResponse = await request('/sign-in/email-otp', { email: local.email, otp })
    expect(otpResponse.status).toBe(200)
    const otpSession = await db.session.findFirstOrThrow({
      where: { userId: local.user.id },
      orderBy: { createdAt: 'desc' },
    })
    expect(otpSession.loginAt?.getTime()).toBe(otpSession.createdAt.getTime())
    expect(await db.user.count({ where: { email: local.email } })).toBe(1)
    expect(
      await db.account.count({ where: { userId: local.user.id, providerId: 'credential' } }),
    ).toBe(0)
    expect(await db.session.count({ where: { id: signup.id } })).toBe(0)
  })
  it('rejects a login suspended after its native session hook, before insertion', async () => {
    const local = await identity()
    const gate = barrier()
    creationObserver = async (data) => {
      if (data.userId === local.user.id) await gate.pause()
    }
    const pending = request('/sign-in/email', { email: local.email, password: local.password })
    try {
      await gate.waiting
      await suspend(local.user.id)
    } finally {
      creationObserver = async () => {}
      gate.release()
    }
    const response = await pending
    expect(response.status).toBe(401)
    expect(await db.session.count({ where: { userId: local.user.id } })).toBe(1)
  })
  it('renews in place without changing creation/freshness and fences a suspended renewal', async () => {
    const local = await identity()
    const signedIn = await request('/sign-in/email', {
      email: local.email,
      password: local.password,
    })
    const cookie = cookieOf(signedIn)
    const session = await db.session.findFirstOrThrow({
      where: { userId: local.user.id },
      orderBy: { createdAt: 'desc' },
    })
    const old = new Date(Date.now() - 2 * 86_400_000)
    await db.session.update({
      where: { id: session.id },
      data: { createdAt: old, loginAt: old, expiresAt: new Date(Date.now() + 1000) },
    })
    const before = await db.session.findUniqueOrThrow({ where: { id: session.id } })
    const get = await request('/get-session', undefined, cookie)
    expect(get.status).toBe(200)
    expect((await get.json()).needsRefresh).toBe(true)
    const head = await request('/get-session', undefined, cookie, 'HEAD')
    // Keep the pinned router's native HEAD handling; unsupported HEAD must still be read-only.
    expect([200, 404, 405]).toContain(head.status)
    expect(await db.session.findUnique({ where: { id: session.id } })).toEqual(before)
    const post = await request('/get-session', undefined, cookie, 'POST')
    expect(post.status).toBe(200)
    const after = await db.session.findUniqueOrThrow({ where: { id: session.id } })
    expect(after.expiresAt.getTime()).toBeGreaterThan(before.expiresAt.getTime())
    expect(after.createdAt).toEqual(old)
    expect(after.loginAt).toEqual(old)
    await db.session.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() + 1000) },
    })
    const gate = barrier()
    updateObserver = gate.pause
    const pending = request('/get-session', undefined, cookie, 'POST')
    try {
      await gate.waiting
      await suspend(local.user.id)
    } finally {
      updateObserver = async () => {}
      gate.release()
    }
    const response = await pending
    expect(response.status).toBe(401)
    expect(
      (await db.session.findUniqueOrThrow({ where: { id: session.id } })).expiresAt.getTime(),
    ).toBeLessThan(Date.now() + 10_000)
  })
  it('admits transaction-local first Google callback and returning signed direct Google as primary logins', async () => {
    const email = `google-${randomUUID()}@example.test`
    const subject = randomUUID()
    const start = await request('/sign-in/social', {
      provider: 'google',
      callbackURL: `${origin}/admin`,
      disableRedirect: true,
    })
    expect(start.status).toBe(200)
    const authorization = new URL((await start.json()).url)
    const code = randomBytes(24).toString('base64url')
    grants.set(code, {
      email,
      subject,
      challenge: authorization.searchParams.get('code_challenge') ?? '',
    })
    const callback = await request(
      `/callback/google?${new URLSearchParams({ code, state: authorization.searchParams.get('state') ?? '' })}`,
      undefined,
      cookieOf(start),
    )
    expect(callback.headers.get('location') === `${origin}/admin`).toBe(true)
    const user = await db.user.findUniqueOrThrow({ where: { email } })
    const session = await db.session.findFirstOrThrow({ where: { userId: user.id } })
    expect(session.loginAt?.getTime()).toBe(session.createdAt.getTime())
    const direct = await request('/sign-in/social', {
      provider: 'google',
      idToken: { token: googleToken(email, subject) },
    })
    expect(direct.status).toBe(200)
    const returning = await db.session.findFirstOrThrow({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    })
    expect(returning.loginAt?.getTime()).toBe(returning.createdAt.getTime())
    await suspend(user.id)
    const denied = await request('/sign-in/social', {
      provider: 'google',
      idToken: { token: googleToken(email, subject) },
    })
    expect(denied.status).toBe(403)
    expect(await db.session.count({ where: { userId: user.id } })).toBe(2)
  })
  it('carries the original primary timestamp through native password-change replacement without upgrading freshness', async () => {
    const local = await identity()
    const signedIn = await request('/sign-in/email', {
      email: local.email,
      password: local.password,
    })
    const parent = await db.session.findFirstOrThrow({
      where: { userId: local.user.id },
      orderBy: { createdAt: 'desc' },
    })
    const loginAt = new Date(Date.now() - 60_000)
    await db.session.update({ where: { id: parent.id }, data: { createdAt: loginAt, loginAt } })
    const replacement = await request(
      '/change-password',
      {
        currentPassword: local.password,
        newPassword: randomBytes(24).toString('base64url'),
        revokeOtherSessions: true,
      },
      cookieOf(signedIn),
    )
    expect(replacement.status).toBe(200)
    const sessions = await db.session.findMany({ where: { userId: local.user.id } })
    expect(sessions.length).toBe(1)
    expect(sessions[0]?.loginAt).toEqual(loginAt)
    expect(sessions[0]?.authVersion).toBe(0)
    expect(sessions[0]?.id === parent.id).toBe(false)
    expect(sessions[0]?.createdAt.getTime()).toBeGreaterThan(loginAt.getTime())
  })
  it('denies every enabled session-authorized native endpoint for a suspended cookie, but allows sign-out and independent account switching', async () => {
    const local = await identity()
    await suspend(local.user.id)
    const endpoints: [string, object | undefined][] = [
      ['/update-user', { name: 'Forbidden profile' }],
      [
        '/change-password',
        { currentPassword: local.password, newPassword: randomBytes(24).toString('base64url') },
      ],
      ['/change-email', { newEmail: `new-${randomUUID()}@example.test` }],
      ['/verify-password', { password: local.password }],
      ['/link-social', { provider: 'google', callbackURL: `${origin}/admin` }],
      ['/unlink-account', { providerId: 'google' }],
      ['/list-accounts', undefined],
      ['/list-sessions', undefined],
      ['/revoke-session', { token: 'not-a-token' }],
      ['/revoke-sessions', {}],
      ['/revoke-other-sessions', {}],
      ['/update-session', { loginAt: new Date().toISOString() }],
      ['/get-access-token', { providerId: 'google' }],
      ['/refresh-token', { providerId: 'google' }],
      ['/account-info?providerId=google', undefined],
    ]
    for (const [path, body] of endpoints) {
      const response = await request(path, body, local.cookie)
      expect(response.status, path).toBe(401)
    }
    expect((await request('/sign-out', {}, local.cookie)).status).toBe(200)
    const active = await identity()
    expect(
      (
        await request(
          '/sign-in/email',
          { email: active.email, password: active.password },
          local.cookie,
        )
      ).status,
    ).toBe(200)
    const google = await request(
      '/sign-in/social',
      {
        provider: 'google',
        idToken: { token: googleToken(`switch-${randomUUID()}@example.test`, randomUUID()) },
      },
      local.cookie,
    )
    expect(google.status).toBe(200)
    expect((await db.user.findUniqueOrThrow({ where: { id: local.user.id } })).name).toBe(
      'Disposable native identity',
    )
  })
  it('refuses implicit Google account admission across suspend and reinstate after account stamping', async () => {
    const local = await identity()
    await db.user.update({ where: { id: local.user.id }, data: { emailVerified: true } })
    const gate = barrier()
    accountObserver = gate.pause
    const pending = request('/sign-in/social', {
      provider: 'google',
      idToken: { token: googleToken(local.email, randomUUID()) },
    })
    try {
      await gate.waiting
      await suspend(local.user.id)
      await db.user.update({
        where: { id: local.user.id },
        data: { suspendedAt: null, authVersion: 2, platformVersion: 2 },
      })
    } finally {
      accountObserver = async () => {}
      gate.release()
    }
    const response = await pending
    expect(response.status >= 400).toBe(true)
    expect(await db.account.count({ where: { userId: local.user.id, providerId: 'google' } })).toBe(
      0,
    )
  })
  it('refuses a native profile write suspended after its before hook without altering the profile', async () => {
    const local = await identity()
    const gate = barrier()
    userObserver = gate.pause
    const pending = request('/update-user', { name: 'Must not persist' }, local.cookie)
    try {
      await gate.waiting
      await suspend(local.user.id)
    } finally {
      userObserver = async () => {}
      gate.release()
    }
    const response = await pending
    expect(response.status >= 400).toBe(true)
    expect((await db.user.findUniqueOrThrow({ where: { id: local.user.id } })).name).toBe(
      'Disposable native identity',
    )
  })
  it.each(['account', 'session'] as const)(
    'refuses %s removal when suspension wins after the native deletion hook',
    async (model) => {
      const local = await identity()
      await db.user.update({ where: { id: local.user.id }, data: { emailVerified: true } })
      expect(
        (
          await request(
            '/link-social',
            { provider: 'google', idToken: { token: googleToken(local.email, randomUUID()) } },
            local.cookie,
          )
        ).status,
      ).toBe(200)
      const target = await db.session.findFirstOrThrow({ where: { userId: local.user.id } })
      const path = model === 'account' ? '/unlink-account' : '/revoke-session'
      const linked = await db.account.findFirstOrThrow({
        where: { userId: local.user.id, providerId: 'google' },
      })
      const body = model === 'account' ? { accountId: linked.id } : { token: target.token }
      const gate = barrier()
      deletionObserver = async (candidate) => {
        if (candidate === path) await gate.pause()
      }
      const pending = request(path, body, local.cookie)
      try {
        await Promise.race([
          gate.waiting,
          pending.then((r) => {
            throw new Error(`Native deletion hook not reached: ${r.status}`)
          }),
        ])
        await suspend(local.user.id)
      } finally {
        deletionObserver = async () => {}
        gate.release()
      }
      expect((await pending).status >= 400).toBe(true)
      if (model === 'account')
        expect(
          await db.account.count({ where: { userId: local.user.id, providerId: 'google' } }),
        ).toBe(1)
      else expect(await db.session.count({ where: { id: target.id } })).toBe(1)
    },
  )
  it('rejects missing, cloned/foreign Request evidence, unstamped insertion and consumed issuance replay', async () => {
    const local = await identity()
    for (const mode of ['missing', 'foreign', 'unstamped'] as const) {
      contextTransform = (ctx) =>
        ctx
          ? {
              ...ctx,
              request:
                mode === 'missing'
                  ? undefined
                  : ctx.request
                    ? new Request(ctx.request.url, { headers: ctx.request.headers })
                    : undefined,
            }
          : null
      bypassSessionStamp = mode === 'unstamped'
      try {
        expect(
          (await request('/sign-in/email', { email: local.email, password: local.password }))
            .status,
        ).toBe(401)
      } finally {
        contextTransform = (ctx) => ctx
        bypassSessionStamp = false
      }
    }
    expect(await db.session.count({ where: { userId: local.user.id } })).toBe(1)
    let captured: Record<string | symbol, unknown> | undefined
    creationObserver = async (data) => {
      captured = data
    }
    try {
      expect(
        (await request('/sign-in/email', { email: local.email, password: local.password })).status,
      ).toBe(200)
    } finally {
      creationObserver = async () => {}
    }
    if (!captured) throw new Error('Native issuance observation missing')
    const context = await auth.$context
    await expect(
      context.adapter.create({ model: 'session', data: captured }),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(await context.internalAdapter.createSession(local.user.id)).toBeNull()
    expect(await db.session.count({ where: { userId: local.user.id } })).toBe(2)
  })
  it('refuses suspended OTP before first-unverified ownership cleanup', async () => {
    const local = await identity()
    expect(
      (await request('/email-otp/send-verification-otp', { email: local.email, type: 'sign-in' }))
        .status,
    ).toBe(200)
    const otp = mail.get(local.email)
    if (!otp) throw new Error('Controlled OTP missing')
    await suspend(local.user.id)
    const accounts = await db.account.findMany({ where: { userId: local.user.id } })
    const sessions = await db.session.findMany({ where: { userId: local.user.id } })
    expect((await request('/sign-in/email-otp', { email: local.email, otp })).status).toBe(401)
    expect(
      JSON.stringify(await db.account.findMany({ where: { userId: local.user.id } })) ===
        JSON.stringify(accounts),
    ).toBe(true)
    expect(
      JSON.stringify(await db.session.findMany({ where: { userId: local.user.id } })) ===
        JSON.stringify(sessions),
    ).toBe(true)
    expect((await db.user.findUniqueOrThrow({ where: { id: local.user.id } })).emailVerified).toBe(
      false,
    )
  })
  it('rejects malicious server-owned fields on signup/profile/update-session without changing persisted authority', async () => {
    const email = `fields-${randomUUID()}@example.test`
    const fields = {
      role: 'ADMIN',
      suspendedAt: new Date().toISOString(),
      authVersion: 777,
      platformVersion: 777,
      loginAt: new Date().toISOString(),
    }
    const signup = await request('/sign-up/email', {
      email,
      password: randomBytes(24).toString('base64url'),
      name: 'Server fields',
      ...fields,
    })
    expect(signup.status).toBe(400)
    expect(await db.user.count({ where: { email } })).toBe(0)
    const local = await identity()
    const update = await request(
      '/update-user',
      { name: 'Unsafe profile', ...fields },
      local.cookie,
    )
    expect(update.status).toBe(400)
    expect((await request('/update-session', fields, local.cookie)).status).toBe(400)
    const user = await db.user.findUniqueOrThrow({ where: { id: local.user.id } })
    expect(user.name).toBe('Disposable native identity')
    expect(user.role).toBe('USER')
    expect(user.suspendedAt).toBeNull()
    expect(user.authVersion ?? 0).toBe(0)
    expect(user.platformVersion ?? 0).toBe(0)
    const session = await db.session.findFirstOrThrow({ where: { userId: user.id } })
    expect(session.authVersion).toBe(0)
    expect(session.loginAt).toBeNull()
    const output = JSON.stringify(
      await (await request('/get-session', undefined, local.cookie)).json(),
    )
    for (const field of ['suspendedAt', 'platformVersion', 'authVersion', 'loginAt'])
      expect(output.includes(field)).toBe(false)
  })
  it.each(['user', 'session'] as const)(
    'conflicts on the exact %s row when revocation wins inside the real native transaction',
    async (model) => {
      const local = await identity()
      const parent = await db.session.findFirstOrThrow({ where: { userId: local.user.id } })
      if (model === 'session')
        await db.session.update({
          where: { id: parent.id },
          data: { expiresAt: new Date(Date.now() + 1000) },
        })
      const gate = barrier()
      const transaction = db.$transaction.bind(db)
      let observed = false
      const spy = vi.spyOn(db, '$transaction').mockImplementation(async (callback) => {
        if (typeof callback !== 'function')
          throw new Error('Expected a native interactive transaction')
        return transaction((tx) =>
          callback(
            observeTransaction(tx, model, async () => {
              if (!observed) {
                observed = true
                await gate.pause()
              }
            }),
          ),
        )
      })
      const pending =
        model === 'user'
          ? request('/sign-in/email', { email: local.email, password: local.password })
          : request('/get-session', undefined, local.cookie, 'POST')
      try {
        await Promise.race([
          gate.waiting,
          pending.then((r) => {
            throw new Error(`Native transaction barrier not reached: ${r.status}`)
          }),
        ])
        if (model === 'user') await suspend(local.user.id)
        else expect((await request('/sign-out', {}, local.cookie)).status).toBe(200)
      } finally {
        gate.release()
      }
      try {
        expect((await pending).status >= 400).toBe(true)
        expect(observed).toBe(true)
        expect(await db.session.count({ where: { userId: local.user.id } })).toBe(
          model === 'user' ? 1 : 0,
        )
        expect(
          (await (await request('/get-session', undefined, local.cookie)).json()) === null,
        ).toBe(true)
      } finally {
        spy.mockRestore()
      }
    },
  )
  it.each(['suspend-reinstate', 'revoke-all', 'revoke-one'] as const)(
    'refuses late password replacement after %s without generation/freshness upgrade',
    async (action) => {
      const local = await identity()
      const signedIn = await request('/sign-in/email', {
        email: local.email,
        password: local.password,
      })
      const parent = await db.session.findFirstOrThrow({
        where: { userId: local.user.id },
        orderBy: { createdAt: 'desc' },
      })
      const gate = barrier()
      creationObserver = async (data) => {
        if (data.userId === local.user.id) await gate.pause()
      }
      const pending = request(
        '/change-password',
        {
          currentPassword: local.password,
          newPassword: randomBytes(24).toString('base64url'),
          revokeOtherSessions: true,
        },
        cookieOf(signedIn),
      )
      try {
        await Promise.race([
          gate.waiting,
          pending.then((r) => {
            throw new Error(`Native replacement barrier not reached: ${r.status}`)
          }),
        ])
        await db.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: local.user.id },
            data: {
              suspendedAt: action === 'suspend-reinstate' ? new Date() : null,
              authVersion: action === 'revoke-one' ? 0 : 1,
              platformVersion: 1,
            },
          })
          await tx.session.deleteMany({
            where:
              action === 'revoke-one'
                ? { id: parent.id, userId: local.user.id }
                : { userId: local.user.id },
          })
        })
        if (action === 'suspend-reinstate')
          await db.user.update({
            where: { id: local.user.id },
            data: { suspendedAt: null, authVersion: 2, platformVersion: 2 },
          })
      } finally {
        creationObserver = async () => {}
        gate.release()
      }
      expect((await pending).status >= 400).toBe(true)
      expect(await db.session.count({ where: { userId: local.user.id } })).toBe(0)
      expect(
        (await (await request('/get-session', undefined, cookieOf(signedIn))).json()) === null,
      ).toBe(true)
    },
  )
  it('refuses a requestless server-only native password mutation instead of admitting an unproved session operation', async () => {
    const email = `server-only-${randomUUID()}@example.test`
    expect(
      (await request('/email-otp/send-verification-otp', { email, type: 'sign-in' })).status,
    ).toBe(200)
    const otp = mail.get(email)
    if (!otp) throw new Error('Controlled OTP missing')
    const login = await request('/sign-in/email-otp', { email, otp })
    expect(login.status).toBe(200)
    const local = await db.user.findUniqueOrThrow({ where: { email } })
    await expect(
      auth.api.setPassword({
        headers: new Headers({ Cookie: cookieOf(login) }),
        body: { newPassword: randomBytes(24).toString('base64url') },
      }),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(await db.account.count({ where: { userId: local.id, providerId: 'credential' } })).toBe(
      0,
    )
  })
  describe.each(['password', 'otp', 'google-direct', 'google-callback'] as const)(
    '%s issuance race matrix',
    (method) => {
      it.each(['suspend-reinstate', 'revoke-all', 'revoke-one'] as const)(
        'refuses the observed generation/platform version after %s commits',
        async (action) => {
          const local = await identity()
          await db.user.update({ where: { id: local.user.id }, data: { emailVerified: true } })
          const gate = barrier()
          creationObserver = async (data) => {
            if (data.userId === local.user.id) await gate.pause()
          }
          const pending = primary(local, method)
          try {
            await Promise.race([
              gate.waiting,
              pending.then((r) => {
                throw new Error(`Primary admission hook not reached: ${r.status}`)
              }),
            ])
            await db.$transaction(async (tx) => {
              await tx.user.update({
                where: { id: local.user.id },
                data: {
                  suspendedAt: action === 'suspend-reinstate' ? new Date() : null,
                  authVersion: action === 'revoke-one' ? 0 : 1,
                  platformVersion: 1,
                },
              })
              await tx.session.deleteMany({ where: { userId: local.user.id } })
            })
            if (action === 'suspend-reinstate')
              await db.user.update({
                where: { id: local.user.id },
                data: { suspendedAt: null, authVersion: 2, platformVersion: 2 },
              })
          } finally {
            creationObserver = async () => {}
            gate.release()
          }
          const response = await pending
          if (method === 'google-callback') {
            expect(response.status).toBe(302)
            expect(
              new URL(response.headers.get('location') ?? '', baseURL).searchParams.has('error'),
            ).toBe(true)
          } else expect(response.status >= 400).toBe(true)
          expect(
            response.headers
              .getSetCookie()
              .some((h) => h.includes('session_token=') && !h.includes('Max-Age=0')),
          ).toBe(false)
          expect(await db.session.count({ where: { userId: local.user.id } })).toBe(0)
          expect(
            (await (await request('/get-session', undefined, local.cookie)).json()) === null,
          ).toBe(true)
        },
      )
    },
  )
  it.each(['future', 'after-created', 'missing'] as const)(
    'never carries %s replacement login evidence as a fresh primary login',
    async (kind) => {
      const local = await identity()
      const signedIn = await request('/sign-in/email', {
        email: local.email,
        password: local.password,
      })
      const parent = await db.session.findFirstOrThrow({
        where: { userId: local.user.id },
        orderBy: { createdAt: 'desc' },
      })
      await db.session.update({
        where: { id: parent.id },
        data: {
          createdAt: new Date(Date.now() - 120_000),
          loginAt:
            kind === 'missing'
              ? null
              : new Date(Date.now() + (kind === 'future' ? 60_000 : -60_000)),
        },
      })
      const response = await request(
        '/change-password',
        {
          currentPassword: local.password,
          newPassword: randomBytes(24).toString('base64url'),
          revokeOtherSessions: true,
        },
        cookieOf(signedIn),
      )
      expect(response.status).toBe(200)
      expect(
        (await db.session.findFirstOrThrow({ where: { userId: local.user.id } })).loginAt,
      ).toBeNull()
    },
  )
  it('preserves native password replacement when the parent is beyond the native deletion-hook snapshot limit', async () => {
    const local = await identity()
    await db.session.createMany({
      data: Array.from({ length: 105 }, () => ({
        userId: local.user.id,
        token: randomBytes(24).toString('base64url'),
        authVersion: 0,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    })
    const signedIn = await request('/sign-in/email', {
      email: local.email,
      password: local.password,
    })
    const response = await request(
      '/change-password',
      {
        currentPassword: local.password,
        newPassword: randomBytes(24).toString('base64url'),
        revokeOtherSessions: true,
      },
      cookieOf(signedIn),
    )
    expect(response.status).toBe(200)
    expect(await db.session.count({ where: { userId: local.user.id } })).toBe(1)
  })
  it('fences the existing-account explicit Google callback token update against suspension', async () => {
    const local = await identity()
    await db.user.update({ where: { id: local.user.id }, data: { emailVerified: true } })
    const subject = randomUUID()
    expect(
      (
        await request(
          '/link-social',
          { provider: 'google', idToken: { token: googleToken(local.email, subject) } },
          local.cookie,
        )
      ).status,
    ).toBe(200)
    const before = await db.account.findFirstOrThrow({
      where: { userId: local.user.id, providerId: 'google' },
    })
    const start = await request(
      '/link-social',
      { provider: 'google', callbackURL: `${origin}/admin`, disableRedirect: true },
      local.cookie,
    )
    expect(start.status).toBe(200)
    const authorization = new URL((await start.json()).url)
    const code = randomBytes(24).toString('base64url')
    grants.set(code, {
      email: local.email,
      subject,
      challenge: authorization.searchParams.get('code_challenge') ?? '',
    })
    const gate = barrier()
    accountUpdateObserver = gate.pause
    const pending = request(
      `/callback/google?${new URLSearchParams({ code, state: authorization.searchParams.get('state') ?? '' })}`,
      undefined,
      `${local.cookie}; ${cookieOf(start)}`,
    )
    try {
      await Promise.race([
        gate.waiting,
        pending.then((r) => {
          throw new Error(`Explicit update not reached: ${r.status}`)
        }),
      ])
      await suspend(local.user.id)
    } finally {
      accountUpdateObserver = async () => {}
      gate.release()
    }
    const response = await pending
    // The pinned explicit existing-account callback lets adapter APIErrors surface natively.
    expect([302, 401]).toContain(response.status)
    if (response.status === 302)
      expect(
        new URL(response.headers.get('location') ?? '', baseURL).searchParams.has('error'),
      ).toBe(true)
    else
      expect(await response.json()).toEqual({
        code: 'INVALID_EMAIL_OR_PASSWORD',
        message: 'Invalid email or password',
      })
    expect(
      JSON.stringify(await db.account.findUnique({ where: { id: before.id } })) ===
        JSON.stringify(before),
    ).toBe(true)
  })
  it('keeps active native profile/unlink/revoke operations working without changing primary-login evidence', async () => {
    const local = await identity()
    await db.user.update({ where: { id: local.user.id }, data: { emailVerified: true } })
    const parent = await db.session.findFirstOrThrow({ where: { userId: local.user.id } })
    const profile = await request('/update-user', { name: 'Updated profile' }, local.cookie)
    expect(profile.status).toBe(200)
    expect((await db.user.findUniqueOrThrow({ where: { id: local.user.id } })).name).toBe(
      'Updated profile',
    )
    expect(
      (
        await request(
          '/link-social',
          { provider: 'google', idToken: { token: googleToken(local.email, randomUUID()) } },
          local.cookie,
        )
      ).status,
    ).toBe(200)
    const linked = await db.account.findFirstOrThrow({
      where: { userId: local.user.id, providerId: 'google' },
    })
    expect((await request('/unlink-account', { accountId: linked.id }, local.cookie)).status).toBe(
      200,
    )
    expect(await db.account.count({ where: { id: linked.id } })).toBe(0)
    expect(
      (await request('/sign-in/email', { email: local.email, password: local.password })).status,
    ).toBe(200)
    expect((await request('/revoke-other-sessions', {}, local.cookie)).status).toBe(200)
    const remaining = await db.session.findMany({ where: { userId: local.user.id } })
    expect(remaining.length).toBe(1)
    expect(remaining[0]?.id).toBe(parent.id)
    expect(remaining[0]?.createdAt).toEqual(parent.createdAt)
    expect(remaining[0]?.loginAt).toBeNull()
  })
  it('retains independent native server-only OTP challenge helpers without granting session admission', async () => {
    const email = `internal-otp-${randomUUID()}@example.test`
    const otp = await auth.api.createVerificationOTP({ body: { email, type: 'sign-in' } })
    expect(/^[0-9]{6}$/u.test(otp)).toBe(true)
    await expect(
      auth.api.getVerificationOTP({ query: { email, type: 'sign-in' } }),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(await db.user.count({ where: { email } })).toBe(0)
  })
  it('refuses a credential update when suspension wins after the native account-update hook', async () => {
    const local = await identity()
    const credential = await db.account.findFirstOrThrow({
      where: { userId: local.user.id, providerId: 'credential' },
    })
    const gate = barrier()
    accountUpdateObserver = gate.pause
    const pending = request(
      '/change-password',
      {
        currentPassword: local.password,
        newPassword: randomBytes(24).toString('base64url'),
        revokeOtherSessions: true,
      },
      local.cookie,
    )
    try {
      await Promise.race([
        gate.waiting,
        pending.then((r) => {
          throw new Error(`Credential update not reached: ${r.status}`)
        }),
      ])
      await suspend(local.user.id)
    } finally {
      accountUpdateObserver = async () => {}
      gate.release()
    }
    expect((await pending).status >= 400).toBe(true)
    expect(
      (await db.account.findUniqueOrThrow({ where: { id: credential.id } })).password ===
        credential.password,
    ).toBe(true)
  })
  it('refuses password replacement after native sign-out removes its exact parent before native deletion', async () => {
    const local = await identity()
    const signedIn = await request('/sign-in/email', {
      email: local.email,
      password: local.password,
    })
    const parent = await db.session.findFirstOrThrow({
      where: { userId: local.user.id },
      orderBy: { createdAt: 'desc' },
    })
    const gate = barrier()
    let observed = false
    deletionObserver = async (path) => {
      if (path === '/change-password' && !observed) {
        observed = true
        await gate.pause()
      }
    }
    const pending = request(
      '/change-password',
      {
        currentPassword: local.password,
        newPassword: randomBytes(24).toString('base64url'),
        revokeOtherSessions: true,
      },
      cookieOf(signedIn),
    )
    try {
      await Promise.race([
        gate.waiting,
        pending.then((r) => {
          throw new Error(`Replacement deletion not reached: ${r.status}`)
        }),
      ])
      expect((await request('/sign-out', {}, cookieOf(signedIn))).status).toBe(200)
    } finally {
      deletionObserver = async () => {}
      gate.release()
    }
    expect((await pending).status >= 400).toBe(true)
    expect(await db.session.count({ where: { id: parent.id } })).toBe(0)
    expect(await db.session.count({ where: { userId: local.user.id } })).toBe(1)
  })
  it('denies broad or immutable-field adapter session mutations rather than bypassing native admission', async () => {
    const local = await identity()
    const session = await db.session.findFirstOrThrow({ where: { userId: local.user.id } })
    const adapter = (await auth.$context).adapter
    await expect(
      adapter.updateMany({
        model: 'session',
        where: [{ field: 'userId', value: local.user.id }],
        update: { expiresAt: new Date(Date.now() + 1000) },
      }),
    ).rejects.toMatchObject({ statusCode: 401 })
    for (const update of [{ createdAt: new Date() }, { loginAt: new Date() }, { authVersion: 99 }])
      await expect(
        adapter.update({ model: 'session', where: [{ field: 'id', value: session.id }], update }),
      ).rejects.toMatchObject({ statusCode: 401 })
    await expect(
      adapter.incrementOne({
        model: 'session',
        where: [{ field: 'id', value: session.id }],
        increment: { authVersion: 1 },
      }),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(
      JSON.stringify(await db.session.findUnique({ where: { id: session.id } })) ===
        JSON.stringify(session),
    ).toBe(true)
  })
  it('returns native null for malformed generation rows while retaining legacy zero-generation admission', async () => {
    const local = await identity()
    const session = await db.session.findFirstOrThrow({ where: { userId: local.user.id } })
    await db.user.update({ where: { id: local.user.id }, data: { authVersion: null } })
    await db.session.update({ where: { id: session.id }, data: { authVersion: null } })
    expect((await (await request('/get-session', undefined, local.cookie)).json()) !== null).toBe(
      true,
    )
    await db.user.update({ where: { id: local.user.id }, data: { authVersion: -1 } })
    const response = await request('/get-session', undefined, local.cookie)
    expect(response.status).toBe(200)
    expect((await response.json()) === null).toBe(true)
    await db.user.update({ where: { id: local.user.id }, data: { authVersion: 0 } })
    await db.session.update({ where: { id: session.id }, data: { authVersion: -1 } })
    const invalidSession = await request('/get-session', undefined, local.cookie)
    expect(invalidSession.status).toBe(200)
    expect((await invalidSession.json()) === null).toBe(true)
  })
  it('returns native null for suspended and stale generation cookies without a database write', async () => {
    const local = await identity()
    await suspend(local.user.id)
    const snapshot = await db.user.findUnique({ where: { id: local.user.id } })
    const sessions = await db.session.findMany({ where: { userId: local.user.id } })
    for (const method of ['GET', 'POST']) {
      const response = await request('/get-session', undefined, local.cookie, method)
      expect(response.status).toBe(200)
      expect(await response.json()).toBeNull()
    }
    expect(await auth.api.getSession({ headers: new Headers({ Cookie: local.cookie }) })).toBeNull()
    expect(await db.user.findUnique({ where: { id: local.user.id } })).toEqual(snapshot)
    expect(await db.session.findMany({ where: { userId: local.user.id } })).toEqual(sessions)
    await db.user.update({
      where: { id: local.user.id },
      data: { suspendedAt: null, authVersion: 2 },
    })
    expect(await (await request('/get-session', undefined, local.cookie)).json()).toBeNull()
  })
  it('refuses a suspended password target without issuing a session', async () => {
    const local = await identity()
    await suspend(local.user.id)
    const before = await db.session.count({ where: { userId: local.user.id } })
    const response = await request('/sign-in/email', {
      email: local.email,
      password: local.password,
    })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      code: 'INVALID_EMAIL_OR_PASSWORD',
      message: 'Invalid email or password',
    })
    expect(await db.session.count({ where: { userId: local.user.id } })).toBe(before)
    expect(
      response.headers
        .getSetCookie()
        .some((h) => h.includes('session_token=') && !h.includes('Max-Age=0')),
    ).toBe(false)
  })
})
