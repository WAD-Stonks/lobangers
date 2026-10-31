import { execFile } from 'node:child_process'
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { promisify } from 'node:util'
import { pushDisposableSchema } from '@api/../tests/fixtures/disposable-schema'
import { parseConfig } from '@api/config'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const origin = 'http://localhost:5173'
const nativeFetch = globalThis.fetch
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let baseURL = ''
let disabledURL = ''
let disabledServer: Server | undefined
let db!: typeof import('@broke-oclock/db').db
let databaseUrl = ''
const mail = new Map<string, string>()
const links = new Map<string, string>()
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = {
  ...publicKey.export({ format: 'jwk' }),
  kid: 'admin-email-test',
  alg: 'RS256',
  use: 'sig',
}
const grants = new Map<string, { email: string; subject: string; challenge: string }>()
const googleToken = (email: string, subject: string) => {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const payload = `${encode({ alg: 'RS256', kid: jwk.kid })}.${encode({ iss: 'https://accounts.google.com', aud: 'admin-email.apps.googleusercontent.com', sub: subject, email, email_verified: true, name: 'Controlled Google', iat: now, exp: now + 300 })}`
  return `${payload}.${sign('RSA-SHA256', Buffer.from(payload), privateKey).toString('base64url')}`
}
type Event = import('@broke-oclock/auth/server').VerifiedAuthenticationEvent
let nativeAuth: ReturnType<typeof import('@api/auth').createAuth>
let disabledAuth: typeof nativeAuth
vi.mock('@api/auth', async (original) => {
  const module = await original<typeof import('@api/auth')>()
  return {
    ...module,
    createAuth: (...args: Parameters<typeof module.createAuth>) => {
      const result = module.createAuth(...args)
      if (args[0].authProviders?.email) nativeAuth = result
      else disabledAuth = result
      return result
    },
  }
})
let provisionObserver: (event: Event) => Promise<void> = async () => {}
let grantDatabase: typeof db | undefined
let preparationDatabase: typeof db | undefined
vi.mock('@api/modules/platform-admin/admin-emails', async (original) => {
  const module = await original<typeof import('@api/modules/platform-admin/admin-emails')>()
  return {
    ...module,
    prepareAdminEmailVerification: (
      database: typeof db,
      identity: Parameters<typeof module.prepareAdminEmailVerification>[1],
    ) => module.prepareAdminEmailVerification(preparationDatabase ?? database, identity),
    provisionVerifiedAdminEmail: async (database: typeof db, event: Event) => {
      await provisionObserver(event)
      return module.provisionVerifiedAdminEmail(grantDatabase ?? database, event)
    },
  }
})
let ip = 1
const request = (
  path: string,
  body?: object,
  cookie = '',
  method = body ? 'POST' : 'GET',
  target = baseURL,
) =>
  nativeFetch(`${target}/api/auth${path}`, {
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
const cookies = (r: Response) =>
  r.headers
    .getSetCookie()
    .map((h) => h.split(';')[0])
    .join('; ')
const mailbox = () => `admin-email-${randomUUID()}@example.test`
const otpLogin = async (email: string) => {
  expect(
    (await request('/email-otp/send-verification-otp', { email, type: 'sign-in' })).status,
  ).toBe(200)
  return request('/sign-in/email-otp', { email, otp: mail.get(email) })
}
// Raw fixture intent deliberately works before the schema/client feature exists.
const approve = async (email: string) =>
  db.$runCommandRaw({
    insert: 'AdminEmail',
    documents: [
      {
        email,
        active: true,
        version: 1,
        createdAt: { $date: new Date().toISOString() },
        updatedAt: { $date: new Date().toISOString() },
      },
    ],
  })

beforeAll(async () => {
  if (process.env.DATABASE_URL) throw new Error('Admin email fixture refuses ambient DATABASE_URL')
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  databaseUrl = mongo.getUri(`admin_emails_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  await pushDisposableSchema(databaseUrl)
  db = (await import('@broke-oclock/db')).db
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url === 'https://api.resend.com/emails') {
      const body = JSON.parse(String(init?.body)) as { to: string; text: string }
      const otp = body.text.match(/\b[0-9]{6}\b/u)?.[0]
      if (otp) mail.set(body.to, otp)
      else {
        const link = body.text.match(/https?:\/\/[^\s]+/u)?.[0]
        if (!link) throw new Error('No controlled authentication mail')
        links.set(body.to, link)
      }
      return Response.json({ id: randomUUID() })
    }
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [jwk] })
    if (url === 'https://oauth2.googleapis.com/token') {
      const body = new URLSearchParams(String(init?.body))
      const grant = grants.get(body.get('code') ?? '')
      if (!grant) return Response.json({ error: 'invalid_grant' }, { status: 400 })
      grants.delete(body.get('code') ?? '')
      expect(
        createHash('sha256')
          .update(body.get('code_verifier') ?? '')
          .digest('base64url'),
      ).toBe(grant.challenge)
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
  const { createApp } = await import('@api/app')
  server = createServer()
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No disposable listener')
  baseURL = `http://127.0.0.1:${address.port}`
  server.on(
    'request',
    createApp(
      parseConfig({
        DATABASE_URL: databaseUrl,
        BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
        BETTER_AUTH_URL: baseURL,
        WEB_ORIGIN: origin,
        RESEND_API_KEY: 're_test_only',
        EMAIL_FROM: 'auth@example.test',
        GOOGLE_CLIENT_ID: 'admin-email.apps.googleusercontent.com',
        GOOGLE_CLIENT_SECRET: 'test-secret',
      }),
    ),
  )
  disabledServer = createServer()
  await new Promise<void>((resolve) => disabledServer?.listen(0, '127.0.0.1', resolve))
  const disabledAddress = disabledServer.address()
  if (!disabledAddress || typeof disabledAddress === 'string')
    throw new Error('No disabled listener')
  disabledURL = `http://127.0.0.1:${disabledAddress.port}`
  disabledServer.on(
    'request',
    createApp(
      parseConfig({
        DATABASE_URL: databaseUrl,
        BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
        BETTER_AUTH_URL: disabledURL,
        WEB_ORIGIN: origin,
      }),
    ),
  )
}, 180_000)
afterAll(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  disabledServer?.closeAllConnections()
  if (disabledServer) await new Promise<void>((resolve) => disabledServer?.close(() => resolve()))
  await db?.$disconnect()
  await mongo?.stop()
  expect(server?.listening).toBe(false)
  expect(disabledServer?.listening).toBe(false)
  expect(mongo?.state).toBe('stopped')
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

const roleChange = async (
  actorId: string,
  targetId: string,
  role: 'ADMIN' | 'USER' | 'MERCHANT',
  expectedVersion = 0,
) => {
  const { changeRole } = await import('@api/modules/platform-admin/roles')
  const session = await db.session.findFirstOrThrow({
    where: { userId: actorId },
    orderBy: { id: 'desc' },
  })
  return changeRole(
    db,
    { userId: actorId, sessionId: session.id },
    {
      userId: targetId,
      role,
      expectedVersion,
      confirmed: true,
      note: 'Disposable deliberate role operation',
    },
  )
}
const signup = async (email = mailbox()) => {
  const password = randomBytes(24).toString('base64url')
  const result = await request('/sign-up/email', {
    email,
    password,
    name: 'Disposable user',
    role: 'ADMIN',
  })
  expect(result.status).toBe(200)
  return {
    email,
    password,
    user: await db.user.findUniqueOrThrow({ where: { email } }),
    cookie: cookies(result),
  }
}
const adminActor = async () => {
  const email = mailbox()
  await approve(email)
  expect((await otpLogin(email)).status).toBe(200)
  return db.user.findUniqueOrThrow({ where: { email } })
}

const googleLogin = async (email: string, callback = false, subject = randomUUID()) => {
  if (!callback)
    return request('/sign-in/social', {
      provider: 'google',
      idToken: { token: googleToken(email, subject) },
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
    email,
    subject,
    challenge: authorization.searchParams.get('code_challenge') ?? '',
  })
  return request(
    `/callback/google?${new URLSearchParams({ code, state: authorization.searchParams.get('state') ?? '' })}`,
    undefined,
    cookies(start),
  )
}
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
const auditCount = (userId: string) =>
  db.adminEmailEvent.count({ where: { targetUserId: userId, action: 'PROVISIONED' } })
const verificationOTP = async (email: string) => {
  expect(
    (await request('/email-otp/send-verification-otp', { email, type: 'email-verification' }))
      .status,
  ).toBe(200)
  return request('/email-otp/verify-email', { email, otp: mail.get(email) })
}

const operator = async (...args: string[]) => {
  const result = await promisify(execFile)(
    'pnpm',
    ['exec', 'tsx', 'src/tools/admin-emails.ts', ...args],
    {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        DATABASE_URL: databaseUrl,
      },
      timeout: 30_000,
    },
  )
  return JSON.parse(result.stdout)
}

const transactionDatabase = (
  transform: (
    tx: import('@api/modules/platform-admin/transaction').AccessTransaction,
  ) => import('@api/modules/platform-admin/transaction').AccessTransaction,
) =>
  new Proxy(db, {
    get(target, key, receiver) {
      if (key === '$transaction')
        return (
          work: (
            tx: import('@api/modules/platform-admin/transaction').AccessTransaction,
          ) => Promise<unknown>,
        ) => db.$transaction((tx) => work(transform(tx)))
      const value = Reflect.get(target, key, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
const alterDelegate = <T extends object>(
  tx: T,
  model: string,
  operation: string,
  before: () => Promise<void>,
): T =>
  new Proxy(tx, {
    get(target, key, receiver) {
      const delegate = Reflect.get(target, key, receiver)
      if (key !== model || typeof delegate !== 'object' || delegate === null) return delegate
      return new Proxy(delegate, {
        get(target, key, receiver) {
          const value: unknown = Reflect.get(target, key, receiver)
          if (key === operation && typeof value === 'function')
            return async (...args: unknown[]) => {
              await before()
              return Reflect.apply(value, target, args)
            }
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
    },
  })

describe('admin email intent through production native HTTP and disposable database', () => {
  it('does not dispatch provision for requestless native helpers or foreign verification Request identity', async () => {
    const target = await signup()
    await approve(target.email)
    const spy = vi.fn(async () => {})
    provisionObserver = spy
    const options = nativeAuth.options.emailVerification
    const after = options?.afterEmailVerification
    if (!options || !after) throw new Error('Missing native verification callback')
    try {
      await expect(
        nativeAuth.api.signInEmail({ body: { email: target.email, password: target.password } }),
      ).rejects.toBeDefined()
      options.afterEmailVerification = (user, request) =>
        after(user, request ? new Request(request.url) : undefined)
      expect((await verificationOTP(target.email)).status).toBe(200)
      expect(spy).not.toHaveBeenCalled()
      expect(await db.user.findUnique({ where: { id: target.user.id } })).toMatchObject({
        emailVerified: true,
        role: 'USER',
      })
    } finally {
      options.afterEmailVerification = after
      provisionObserver = async () => {}
    }
    expect((await otpLogin(target.email)).status).toBe(200)
    expect(await auditCount(target.user.id)).toBe(1)
  })
  it('rejects invalid and expired verification proofs without granting', async () => {
    const target = await signup()
    await approve(target.email)
    expect(
      (
        await request(
          '/sign-in/email',
          { email: target.email, password: target.password },
          '',
          'POST',
          disabledURL,
        )
      ).status,
    ).toBe(200)
    const accounts = await db.account.findMany({ where: { userId: target.user.id } })
    const sessions = await db.session.findMany({ where: { userId: target.user.id } })
    expect((await request('/verify-email?token=forged')).status).toBe(401)
    expect(
      (
        await request('/email-otp/send-verification-otp', {
          email: target.email,
          type: 'email-verification',
        })
      ).status,
    ).toBe(200)
    const otp = mail.get(target.email)
    expect(
      (await request('/email-otp/verify-email', { email: target.email, otp: 'not-a-code' })).status,
    ).toBe(400)
    await db.verification.updateMany({
      where: { identifier: { contains: target.email } },
      data: { expiresAt: new Date(0) },
    })
    expect((await request('/email-otp/verify-email', { email: target.email, otp })).status).toBe(
      400,
    )
    expect(await db.user.findUnique({ where: { id: target.user.id } })).toMatchObject({
      role: 'USER',
      emailVerified: false,
      authVersion: null,
    })
    expect(await db.account.findMany({ where: { userId: target.user.id } })).toEqual(accounts)
    expect(await db.session.findMany({ where: { userId: target.user.id } })).toEqual(sessions)
    expect(await auditCount(target.user.id)).toBe(0)
  })
  it.each(['password', 'otp', 'google', 'verification'] as const)(
    'cannot grant a suspended identity through %s',
    async (method) => {
      const target = await signup()
      if (method !== 'verification') expect((await verificationOTP(target.email)).status).toBe(200)
      await approve(target.email)
      await db.user.update({
        where: { id: target.user.id },
        data: { suspendedAt: new Date(), authVersion: 1, platformVersion: 1 },
      })
      const result =
        method === 'password'
          ? await request('/sign-in/email', { email: target.email, password: target.password })
          : method === 'otp'
            ? await otpLogin(target.email)
            : method === 'google'
              ? await googleLogin(target.email)
              : await verificationOTP(target.email)
      expect(result.status).not.toBe(200)
      expect(await db.user.findUnique({ where: { id: target.user.id } })).toMatchObject({
        role: 'USER',
        emailVerified: method !== 'verification',
        platformVersion: 1,
        authVersion: 1,
      })
      expect(await db.session.count({ where: { userId: target.user.id } })).toBe(0)
      expect(await auditCount(target.user.id)).toBe(0)
    },
  )
  it('rejects stale standalone verification evidence after suspend/reinstate', async () => {
    const target = await signup()
    await approve(target.email)
    const gate = barrier()
    provisionObserver = async () => {
      await gate.pause()
    }
    const pending = verificationOTP(target.email)
    try {
      await Promise.race([
        gate.waiting,
        pending.then(() => {
          throw new Error('Verification missed barrier')
        }),
      ])
      await db.user.update({
        where: { id: target.user.id },
        data: { suspendedAt: new Date(), authVersion: 1, platformVersion: 1 },
      })
      await db.user.update({
        where: { id: target.user.id },
        data: { suspendedAt: null, authVersion: 2, platformVersion: 2 },
      })
      gate.release()
      expect((await pending).status).toBe(200)
      expect(await db.user.findUnique({ where: { id: target.user.id } })).toMatchObject({
        role: 'USER',
        authVersion: 2,
        platformVersion: 2,
      })
      expect(await auditCount(target.user.id)).toBe(0)
    } finally {
      gate.release()
      await pending
      provisionObserver = async () => {}
    }
  })
  it('manual role and operator intent writes roll back together with event or PlatformAudit failure', async () => {
    const admin = await adminActor()
    for (const model of ['adminEmailEvent', 'platformAudit']) {
      const target = await signup()
      expect((await verificationOTP(target.email)).status).toBe(200)
      const { changeRole } = await import('@api/modules/platform-admin/roles')
      const session = await db.session.findFirstOrThrow({
        where: { userId: admin.id },
        orderBy: { id: 'desc' },
      })
      const failDb = transactionDatabase((tx) =>
        alterDelegate(tx, model, 'create', async () => {
          throw new Error('Controlled atomic audit failure')
        }),
      )
      await expect(
        changeRole(
          failDb,
          { userId: admin.id, sessionId: session.id },
          {
            userId: target.user.id,
            role: 'ADMIN',
            expectedVersion: 0,
            confirmed: true,
            note: 'Disposable rollback',
          },
        ),
      ).rejects.toThrow('Controlled atomic audit failure')
      expect(await db.user.findUnique({ where: { id: target.user.id } })).toMatchObject({
        role: 'USER',
        platformVersion: null,
      })
      expect(await db.adminEmail.findUnique({ where: { email: target.email } })).toBeNull()
      expect(await db.adminEmailEvent.count({ where: { targetUserId: target.user.id } })).toBe(0)
      expect(await db.platformAudit.count({ where: { targetUserId: target.user.id } })).toBe(0)
    }
    const email = mailbox()
    const { operateAdminEmail } = await import('@api/modules/platform-admin/admin-emails')
    await expect(
      operateAdminEmail(
        transactionDatabase((tx) =>
          alterDelegate(tx, 'adminEmailEvent', 'create', async () => {
            throw new Error('Operator audit failure')
          }),
        ),
        {
          action: 'preapprove',
          email,
          apply: true,
          expectedVersion: 0,
          operatorLabel: 'fixture',
          reason: 'Rollback operator',
        },
      ),
    ).rejects.toThrow('Operator audit failure')
    expect(await db.adminEmail.findUnique({ where: { email } })).toBeNull()
  })
  it('operator refuses staff conversion, active ADMIN revoke, stale versions and case-colliding identities', async () => {
    const { operateAdminEmail, inspectAdminEmail } = await import(
      '@api/modules/platform-admin/admin-emails'
    )
    const write = {
      apply: true,
      expectedVersion: 0,
      operatorLabel: 'fixture',
      reason: 'Disposable operator policy',
    }
    for (const role of ['MERCHANT', 'MODERATOR', 'ADMIN'] as const) {
      const target = await signup()
      await db.user.update({ where: { id: target.user.id }, data: { role } })
      await expect(
        operateAdminEmail(db, {
          ...write,
          action: role === 'ADMIN' ? 'revoke' : 'preapprove',
          email: target.email,
        }),
      ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
      expect(await db.adminEmail.findUnique({ where: { email: target.email } })).toBeNull()
    }
    const target = await signup()
    await db.user.create({
      data: {
        name: 'Legacy case collision',
        email: target.email.toUpperCase(),
        emailVerified: true,
        role: 'USER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })
    await expect(inspectAdminEmail(db, target.email)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    })
    await expect(
      operateAdminEmail(db, { ...write, action: 'preapprove', email: target.email }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
    const email = mailbox()
    await operateAdminEmail(db, { ...write, action: 'preapprove', email })
    const approval = await db.adminEmail.findUniqueOrThrow({ where: { email } })
    await expect(
      operateAdminEmail(db, { ...write, action: 'revoke', email }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(
      await operateAdminEmail(db, { ...write, expectedVersion: 1, action: 'preapprove', email }),
    ).toMatchObject({ changed: false })
    await operateAdminEmail(db, { ...write, expectedVersion: 1, action: 'revoke', email })
    await operateAdminEmail(db, { ...write, expectedVersion: 2, action: 'preapprove', email })
    expect(await db.adminEmail.findUnique({ where: { email } })).toMatchObject({
      id: approval.id,
      active: true,
      version: 3,
    })
    expect(await db.adminEmailEvent.count({ where: { approvalId: approval.id } })).toBe(3)
  })

  it.each(['pending-revoke', 'role-change', 'suspend', 'suspend-reinstate', 'all', 'one'] as const)(
    'rejects delayed native claim after committed %s',
    async (operation) => {
      const admin = await adminActor()
      const target = await signup()
      expect((await verificationOTP(target.email)).status).toBe(200)
      await approve(target.email)
      const gate = barrier()
      let event: Event | undefined
      provisionObserver = async (value) => {
        event = value
        await gate.pause()
      }
      const pending = request('/sign-in/email', { email: target.email, password: target.password })
      try {
        await Promise.race([
          gate.waiting,
          pending.then(() => {
            throw new Error('Native claim missed barrier')
          }),
        ])
        if (event?.type !== 'primary-session') throw new Error('No issued native session')
        const security = await import('@api/modules/account/account-security')
        const actorSession = await db.session.findFirstOrThrow({
          where: { userId: admin.id },
          orderBy: { id: 'desc' },
        })
        const actor = { userId: admin.id, sessionId: actorSession.id }
        const input = {
          userId: target.user.id,
          confirmed: true as const,
          expectedVersion: 0,
          note: 'Disposable security race',
        }
        if (operation === 'pending-revoke') {
          const { operateAdminEmail } = await import('@api/modules/platform-admin/admin-emails')
          await operateAdminEmail(db, {
            action: 'revoke',
            email: target.email,
            apply: true,
            expectedVersion: 1,
            operatorLabel: 'fixture',
            reason: 'Cancel pending intent',
          })
        } else if (operation === 'role-change')
          await roleChange(admin.id, target.user.id, 'MERCHANT')
        else if (operation === 'one')
          await security.revokeAccountSession(db, actor, { ...input, sessionId: event.sessionId })
        else if (operation === 'all') await security.revokeAccountSessions(db, actor, input)
        else {
          await security.suspendAccount(db, actor, input)
          if (operation === 'suspend-reinstate')
            await security.reinstateAccount(db, actor, { ...input, expectedVersion: 1 })
        }
        gate.release()
        const login = await pending
        expect(login.status).toBe(200)
        const persisted = await db.user.findUniqueOrThrow({ where: { id: target.user.id } })
        expect(persisted.role).toBe(operation === 'role-change' ? 'MERCHANT' : 'USER')
        expect(await auditCount(target.user.id)).toBe(0)
        if (operation === 'pending-revoke' || operation === 'role-change')
          expect(await db.adminEmail.findUnique({ where: { email: target.email } })).toMatchObject({
            active: false,
            version: 2,
          })
        else {
          expect(await db.session.findUnique({ where: { id: event.sessionId } })).toBeNull()
          expect(await (await request('/get-session', undefined, cookies(login))).json()).toBeNull()
        }
      } finally {
        gate.release()
        await pending
        provisionObserver = async () => {}
      }
    },
  )
  it('exact session deletion after grant snapshot conflicts rather than slipping through', async () => {
    const target = await signup()
    expect((await verificationOTP(target.email)).status).toBe(200)
    await approve(target.email)
    const gate = barrier()
    let issued: Event | undefined
    provisionObserver = async (event) => {
      issued = event
    }
    grantDatabase = transactionDatabase((tx) => alterDelegate(tx, 'user', 'updateMany', gate.pause))
    const pending = request('/sign-in/email', { email: target.email, password: target.password })
    try {
      await Promise.race([
        gate.waiting,
        pending.then(() => {
          throw new Error('Native claim missed barrier')
        }),
      ])
      if (issued?.type !== 'primary-session') throw new Error('No issued native session')
      await db.session.delete({ where: { id: issued.sessionId } })
      gate.release()
      expect((await pending).status).toBe(200)
      expect(await db.user.findUnique({ where: { id: target.user.id } })).toMatchObject({
        role: 'USER',
        platformVersion: null,
      })
      expect(await auditCount(target.user.id)).toBe(0)
    } finally {
      gate.release()
      await pending
      grantDatabase = undefined
      provisionObserver = async () => {}
    }
  })
  it('rolls back automatic role/pending-request changes on audit failure but keeps ordinary login usable', async () => {
    const target = await signup()
    expect((await verificationOTP(target.email)).status).toBe(200)
    const pending = await db.merchantAccessRequest.create({
      data: {
        userId: target.user.id,
        venueId: '000000000000000000000001',
        userName: 'Synthetic',
        userEmail: target.email,
        venueName: 'Synthetic',
        merchantName: 'Synthetic',
        message: 'Pending',
      },
    })
    await approve(target.email)
    grantDatabase = transactionDatabase((tx) =>
      alterDelegate(tx, 'adminEmailEvent', 'create', async () => {
        throw new Error('Controlled audit failure')
      }),
    )
    try {
      const result = await request('/sign-in/email', {
        email: target.email,
        password: target.password,
      })
      expect(result.status).toBe(200)
      expect((await result.json()).user.role).toBe('USER')
      expect(
        (await (await request('/get-session', undefined, cookies(result))).json()).user.role,
      ).toBe('USER')
      expect(await db.user.findUnique({ where: { id: target.user.id } })).toMatchObject({
        role: 'USER',
        platformVersion: null,
      })
      expect(
        await db.merchantAccessRequest.findUnique({ where: { id: pending.id } }),
      ).toMatchObject({ status: 'PENDING', version: 1 })
      expect(await auditCount(target.user.id)).toBe(0)
    } finally {
      grantDatabase = undefined
    }
  })
  it('concurrent verified password claims create one grant, one version advance and one event', async () => {
    const target = await signup()
    expect((await verificationOTP(target.email)).status).toBe(200)
    await approve(target.email)
    const gates = [barrier(), barrier()] as const
    let index = 0
    provisionObserver = async () => {
      await gates[index++]?.pause()
    }
    const first = request('/sign-in/email', { email: target.email, password: target.password })
    let second: Promise<Response> | undefined
    try {
      await Promise.race([
        gates[0].waiting,
        first.then(() => {
          throw new Error('First claim missed barrier')
        }),
      ])
      second = request('/sign-in/email', { email: target.email, password: target.password })
      await Promise.race([
        gates[1].waiting,
        second.then(() => {
          throw new Error('Second claim missed barrier')
        }),
      ])
      for (const gate of gates) gate.release()
      expect((await Promise.all([first, second])).map((r) => r.status)).toEqual([200, 200])
    } finally {
      for (const gate of gates) gate.release()
      await first
      await second
      provisionObserver = async () => {}
    }
    expect(await db.user.findUnique({ where: { id: target.user.id } })).toMatchObject({
      role: 'ADMIN',
      platformVersion: 1,
    })
    expect(await auditCount(target.user.id)).toBe(1)
  })
  it('retains demotion after provisioning won first and stale verified evidence is replayed', async () => {
    const admin = await adminActor()
    const target = await signup()
    expect((await verificationOTP(target.email)).status).toBe(200)
    await approve(target.email)
    let event: Event | undefined
    provisionObserver = async (value) => {
      event = value
    }
    try {
      expect(
        (await request('/sign-in/email', { email: target.email, password: target.password }))
          .status,
      ).toBe(200)
    } finally {
      provisionObserver = async () => {}
    }
    await roleChange(admin.id, target.user.id, 'USER', 1)
    if (!event) throw new Error('Missing issued event')
    const { provisionVerifiedAdminEmail } = await import('@api/modules/platform-admin/admin-emails')
    await expect(provisionVerifiedAdminEmail(db, event)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(await db.adminEmail.findUnique({ where: { email: target.email } })).toMatchObject({
      active: false,
      version: 2,
    })
    expect(await db.user.findUnique({ where: { id: target.user.id } })).toMatchObject({
      role: 'USER',
      platformVersion: 2,
    })
    expect(await auditCount(target.user.id)).toBe(1)
  })

  it('warns on explicit suspended USER preapproval without provisioning or reinstatement', async () => {
    const target = await signup()
    await db.user.update({ where: { id: target.user.id }, data: { suspendedAt: new Date() } })
    const { operateAdminEmail } = await import('@api/modules/platform-admin/admin-emails')
    const result = await operateAdminEmail(db, {
      action: 'preapprove',
      email: target.email,
      apply: true,
      expectedVersion: 0,
      operatorLabel: 'fixture',
      reason: 'Intent only while suspended',
    })
    expect(result).toMatchObject({
      warning:
        'Suspended account: no grant until reinstatement and new successful native authentication',
    })
    expect(await db.user.findUnique({ where: { id: target.user.id } })).toMatchObject({
      role: 'USER',
    })
    expect(await db.session.count({ where: { userId: target.user.id } })).toBe(0)
  })
  it('operator dry-run is read-only; apply adds audited intent without auth provisioning', async () => {
    const email = mailbox()
    const counts = await Promise.all([
      db.user.count(),
      db.account.count(),
      db.session.count(),
      db.platformAccessFence.findUnique({ where: { id: 'platform-access' } }),
    ])
    expect(await operator('preapprove', '--email', `  ${email.toUpperCase()}  `)).toMatchObject({
      dryRun: true,
      email,
      changed: false,
    })
    expect(await db.adminEmail.findUnique({ where: { email } })).toBeNull()
    expect(await db.platformAccessFence.findUnique({ where: { id: 'platform-access' } })).toEqual(
      counts[3],
    )
    const name = new URL(databaseUrl).pathname.slice(1)
    expect(
      await operator(
        'preapprove',
        '--email',
        email,
        '--apply',
        '--database',
        name,
        '--expected-version',
        '0',
        '--operator',
        'fixture operator',
        '--reason',
        'Disposable preapproval',
      ),
    ).toMatchObject({ changed: true, dryRun: false, approval: { email, active: true, version: 1 } })
    const approval = await db.adminEmail.findUniqueOrThrow({ where: { email } })
    expect(await db.adminEmailEvent.findMany({ where: { approvalId: approval.id } })).toMatchObject(
      [
        {
          action: 'APPROVED',
          source: 'OPERATOR',
          actorUserId: null,
          operatorLabel: 'fixture operator',
        },
      ],
    )
    expect(await Promise.all([db.user.count(), db.account.count(), db.session.count()])).toEqual(
      counts.slice(0, 3),
    )
    const fence = await db.platformAccessFence.findUnique({ where: { id: 'platform-access' } })
    expect(await operator('show', '--email', email)).toMatchObject({
      approval: { id: approval.id, version: 1 },
    })
    expect(await operator('history', '--email', email, '--limit', '1')).toMatchObject({
      events: [{ approvalId: approval.id }],
    })
    expect(await db.platformAccessFence.findUnique({ where: { id: 'platform-access' } })).toEqual(
      fence,
    )
    await expect(
      operator(
        'revoke',
        '--email',
        email,
        '--apply',
        '--database',
        'wrong',
        '--expected-version',
        '1',
        '--operator',
        'fixture',
        '--reason',
        'Disposable revoke',
      ),
    ).rejects.toThrow()
    expect(await db.adminEmail.findUnique({ where: { email } })).toMatchObject({
      active: true,
      version: 1,
    })
  })

  it('does not grant on signup or unverified password sign-in with sender disabled', async () => {
    const email = mailbox()
    await approve(email)
    const password = randomBytes(24).toString('base64url')
    const registered = await request(
      '/sign-up/email',
      { email, password, name: 'Public user', role: 'ADMIN' },
      '',
      'POST',
      disabledURL,
    )
    expect(registered.status).toBe(200)
    expect((await registered.json()).user.role).toBe('USER')
    const signedIn = await request(
      '/sign-in/email',
      { email, password, role: 'ADMIN', emailVerified: true },
      '',
      'POST',
      disabledURL,
    )
    expect(signedIn.status).toBe(200)
    expect((await signedIn.json()).user.role).toBe('USER')
    const user = await db.user.findUniqueOrThrow({ where: { email } })
    expect(user).toMatchObject({ role: 'USER', emailVerified: false, platformVersion: null })
    expect(await auditCount(user.id)).toBe(0)
  })
  it.each(['link', 'otp'] as const)(
    'retires unproven access before standalone %s verification grants ADMIN',
    async (method) => {
      const target = await signup()
      await approve(target.email)
      // Real native unverified password admission; legacy provider row is synthetic persisted state.
      const earlier = await request(
        '/sign-in/email',
        { email: target.email, password: target.password },
        '',
        'POST',
        disabledURL,
      )
      expect(earlier.status).toBe(200)
      const stale = await db.session.findFirstOrThrow({ where: { userId: target.user.id } })
      await db.account.create({
        data: {
          userId: target.user.id,
          providerId: 'google',
          accountId: randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })
      const result =
        method === 'otp'
          ? await verificationOTP(target.email)
          : await request(`/verify-email?${new URL(links.get(target.email) ?? '').searchParams}`)
      expect(result.status).toBe(method === 'link' ? 302 : 200)
      const attacker = await request('/sign-in/email', {
        email: target.email,
        password: target.password,
      })
      const attackerBody = await attacker.json()
      console.info(
        JSON.stringify({
          invariant: 'standalone-credential-retirement',
          method,
          passwordStatus: attacker.status,
          passwordRole: attackerBody.user?.role ?? null,
        }),
      )
      expect(attacker.status).toBe(401)
      expect(await db.account.count({ where: { userId: target.user.id } })).toBe(0)
      expect(await db.session.findUnique({ where: { id: stale.id } })).toBeNull()
      expect(
        await (
          await request('/get-session', undefined, cookies(earlier), 'GET', disabledURL)
        ).json(),
      ).toBeNull()
      const { requireRecentAdminWrite } = await import('@api/modules/account/security-access')
      await expect(
        requireRecentAdminWrite(db, { userId: target.user.id, sessionId: stale.id }),
      ).rejects.toBeDefined()
      expect(await db.user.findUnique({ where: { id: target.user.id } })).toMatchObject({
        role: 'ADMIN',
        emailVerified: true,
        platformVersion: 1,
      })
      expect(await db.session.count({ where: { userId: target.user.id } })).toBe(0)
      expect(await auditCount(target.user.id)).toBe(1)
      const replay =
        method === 'otp'
          ? await request('/email-otp/verify-email', {
              email: target.email,
              otp: mail.get(target.email),
            })
          : await request(`/verify-email?${new URL(links.get(target.email) ?? '').searchParams}`)
      expect([200, 302, 400]).toContain(replay.status)
      expect(await auditCount(target.user.id)).toBe(1)
      expect(await db.user.findUnique({ where: { id: target.user.id } })).toMatchObject({
        authVersion: 1,
      })
      if (method === 'link') {
        expect(
          (await request('/email-otp/request-password-reset', { email: target.email })).status,
        ).toBe(200)
        const replacement = randomBytes(24).toString('base64url')
        expect(
          (
            await request('/email-otp/reset-password', {
              email: target.email,
              otp: mail.get(target.email),
              password: replacement,
            })
          ).status,
        ).toBe(200)
        const recovered = await request('/sign-in/email', {
          email: target.email,
          password: replacement,
        })
        expect(recovered.status).toBe(200)
        expect((await recovered.json()).user.role).toBe('ADMIN')
      } else {
        const continued = await otpLogin(target.email)
        expect(continued.status).toBe(200)
        expect((await continued.json()).user.role).toBe('ADMIN')
      }
      expect(await auditCount(target.user.id)).toBe(1)
    },
  )
  it.each(['link', 'otp'] as const)(
    'fails closed with atomic retirement rollback on cleanup failure (%s)',
    async (method) => {
      const target = await signup()
      await approve(target.email)
      const earlier = await request(
        '/sign-in/email',
        { email: target.email, password: target.password },
        '',
        'POST',
        disabledURL,
      )
      expect(earlier.status).toBe(200)
      const accounts = await db.account.findMany({ where: { userId: target.user.id } })
      const sessions = await db.session.findMany({ where: { userId: target.user.id } })
      const fence = await db.platformAccessFence.findUnique({ where: { id: 'platform-access' } })
      // Fail after account deletion to prove both deletions and generation roll back together.
      preparationDatabase = transactionDatabase((tx) =>
        alterDelegate(tx, 'session', 'deleteMany', async () => {
          throw new Error('Controlled credential-retirement failure')
        }),
      )
      try {
        const result =
          method === 'otp'
            ? await verificationOTP(target.email)
            : await request(`/verify-email?${new URL(links.get(target.email) ?? '').searchParams}`)
        expect(result.status).toBe(500)
      } finally {
        preparationDatabase = undefined
      }
      expect(await db.user.findUnique({ where: { id: target.user.id } })).toMatchObject({
        role: 'USER',
        emailVerified: false,
        authVersion: null,
        platformVersion: null,
      })
      expect(await db.account.findMany({ where: { userId: target.user.id } })).toEqual(accounts)
      expect(await db.session.findMany({ where: { userId: target.user.id } })).toEqual(sessions)
      expect(await db.platformAccessFence.findUnique({ where: { id: 'platform-access' } })).toEqual(
        fence,
      )
      expect(await auditCount(target.user.id)).toBe(0)
      const retry =
        method === 'otp'
          ? await verificationOTP(target.email)
          : await request(`/verify-email?${new URL(links.get(target.email) ?? '').searchParams}`)
      expect(retry.status).toBe(method === 'otp' ? 200 : 302)
      expect(await db.account.count({ where: { userId: target.user.id } })).toBe(0)
      expect(await db.session.count({ where: { userId: target.user.id } })).toBe(0)
      expect(await auditCount(target.user.id)).toBe(1)
    },
  )
  it.each(['link', 'otp'] as const)(
    'rejects in-flight unverified native password admission after retirement (%s)',
    async (method) => {
      const target = await signup()
      await approve(target.email)
      const options = disabledAuth.options.databaseHooks?.session?.create
      const originalAdmission = options?.before
      if (!options || !originalAdmission) throw new Error('Missing native session admission hook')
      const gate = barrier()
      options.before = async (...args) => {
        const stamped = await originalAdmission(...args)
        if (args[0].userId === target.user.id) await gate.pause()
        return stamped
      }
      const pending = request(
        '/sign-in/email',
        { email: target.email, password: target.password },
        '',
        'POST',
        disabledURL,
      )
      try {
        await Promise.race([
          gate.waiting,
          pending.then(() => {
            throw new Error('Password missed native admission barrier')
          }),
        ])
        const verified =
          method === 'otp'
            ? await verificationOTP(target.email)
            : await request(`/verify-email?${new URL(links.get(target.email) ?? '').searchParams}`)
        expect(verified.status).toBe(method === 'otp' ? 200 : 302)
        gate.release()
        expect((await pending).status).toBe(401)
        expect(await db.user.findUnique({ where: { id: target.user.id } })).toMatchObject({
          role: 'ADMIN',
          authVersion: 1,
          platformVersion: 1,
        })
        expect(await db.account.count({ where: { userId: target.user.id } })).toBe(0)
        expect(await db.session.count({ where: { userId: target.user.id } })).toBe(0)
        expect(await auditCount(target.user.id)).toBe(1)
      } finally {
        gate.release()
        await pending
        options.before = originalAdmission
      }
    },
  )
  it.each(['link', 'otp'] as const)(
    'rolls back retirement when native password admission commits after its snapshot (%s)',
    async (method) => {
      const target = await signup()
      await approve(target.email)
      const gate = barrier()
      preparationDatabase = transactionDatabase((tx) =>
        alterDelegate(tx, 'user', 'updateMany', gate.pause),
      )
      const pending =
        method === 'otp'
          ? verificationOTP(target.email)
          : request(`/verify-email?${new URL(links.get(target.email) ?? '').searchParams}`)
      try {
        await Promise.race([
          gate.waiting,
          pending.then(() => {
            throw new Error('Verification missed retirement snapshot barrier')
          }),
        ])
        const login = await request(
          '/sign-in/email',
          { email: target.email, password: target.password },
          '',
          'POST',
          disabledURL,
        )
        expect(login.status).toBe(200)
        expect((await login.json()).user.role).toBe('USER')
        const sessions = await db.session.findMany({ where: { userId: target.user.id } })
        expect(sessions).toHaveLength(1)
        gate.release()
        expect((await pending).status).toBe(500)
        expect(await db.user.findUnique({ where: { id: target.user.id } })).toMatchObject({
          role: 'USER',
          emailVerified: false,
          authVersion: null,
          platformVersion: null,
        })
        expect(await db.account.count({ where: { userId: target.user.id } })).toBe(1)
        expect(await db.session.findMany({ where: { userId: target.user.id } })).toEqual(sessions)
        expect(await auditCount(target.user.id)).toBe(0)
      } finally {
        gate.release()
        await pending
        preparationDatabase = undefined
      }
      const retry =
        method === 'otp'
          ? await verificationOTP(target.email)
          : await request(`/verify-email?${new URL(links.get(target.email) ?? '').searchParams}`)
      expect(retry.status).toBe(method === 'otp' ? 200 : 302)
      expect(await db.session.count({ where: { userId: target.user.id } })).toBe(0)
      expect(await db.account.count({ where: { userId: target.user.id } })).toBe(0)
      expect(await auditCount(target.user.id)).toBe(1)
    },
  )
  it.each(['link', 'otp'] as const)(
    'does not replace prepared generations with newer native user generations (%s)',
    async (method) => {
      const admin = await adminActor()
      const target = await signup()
      await approve(target.email)
      const options = nativeAuth.options.emailVerification
      const originalPreparation = options?.beforeEmailVerification
      if (!options || !originalPreparation)
        throw new Error('Missing native verification preparation')
      const gate = barrier()
      options.beforeEmailVerification = async (...args) => {
        await originalPreparation(...args)
        if (args[0].id === target.user.id) await gate.pause()
      }
      const pending =
        method === 'otp'
          ? verificationOTP(target.email)
          : request(`/verify-email?${new URL(links.get(target.email) ?? '').searchParams}`)
      try {
        await Promise.race([
          gate.waiting,
          pending.then(() => {
            throw new Error('Verification missed preparation barrier')
          }),
        ])
        expect(await db.account.count({ where: { userId: target.user.id } })).toBe(0)
        expect(await db.user.findUnique({ where: { id: target.user.id } })).toMatchObject({
          emailVerified: false,
          authVersion: 1,
        })
        const actorSession = await db.session.findFirstOrThrow({ where: { userId: admin.id } })
        const { suspendAccount, reinstateAccount } = await import(
          '@api/modules/account/account-security'
        )
        const actor = { userId: admin.id, sessionId: actorSession.id }
        const input = {
          userId: target.user.id,
          confirmed: true as const,
          expectedVersion: 0,
          note: 'Synthetic prepared-generation race',
        }
        await suspendAccount(db, actor, input)
        await reinstateAccount(db, actor, { ...input, expectedVersion: 1 })
        gate.release()
        expect((await pending).status).toBe(method === 'otp' ? 200 : 302)
        expect(await db.user.findUnique({ where: { id: target.user.id } })).toMatchObject({
          role: 'USER',
          emailVerified: true,
          authVersion: 3,
          platformVersion: 2,
        })
        expect(await auditCount(target.user.id)).toBe(0)
        expect(
          (await request('/sign-in/email', { email: target.email, password: target.password }))
            .status,
        ).toBe(401)
      } finally {
        gate.release()
        await pending
        options.beforeEmailVerification = originalPreparation
      }
    },
  )
  it('preserves established verified credentials and sessions on link replay and fresh verification OTP', async () => {
    const target = await signup()
    expect((await verificationOTP(target.email)).status).toBe(200)
    const login = await request('/sign-in/email', {
      email: target.email,
      password: target.password,
    })
    expect(login.status).toBe(200)
    await approve(target.email)
    const accounts = await db.account.findMany({ where: { userId: target.user.id } })
    const sessions = await db.session.findMany({ where: { userId: target.user.id } })
    for (const method of ['link', 'otp']) {
      const result =
        method === 'otp'
          ? await verificationOTP(target.email)
          : await request(`/verify-email?${new URL(links.get(target.email) ?? '').searchParams}`)
      expect(result.status).toBe(method === 'otp' ? 200 : 302)
      expect(await db.account.findMany({ where: { userId: target.user.id } })).toEqual(accounts)
      expect(await db.session.findMany({ where: { userId: target.user.id } })).toEqual(sessions)
      expect(await db.user.findUnique({ where: { id: target.user.id } })).toMatchObject({
        role: 'USER',
        authVersion: null,
        platformVersion: null,
      })
      expect(await auditCount(target.user.id)).toBe(0)
    }
    const owner = await request('/sign-in/email', {
      email: target.email,
      password: target.password,
    })
    expect(owner.status).toBe(200)
    expect((await owner.json()).user.role).toBe('ADMIN')
  })
  it('grants existing verified password owner after preapproval and keeps identity and credentials', async () => {
    const target = await signup()
    expect((await verificationOTP(target.email)).status).toBe(200)
    await approve(target.email)
    const login = await request('/sign-in/email', {
      email: target.email,
      password: target.password,
    })
    expect(login.status).toBe(200)
    expect((await login.json()).user).toMatchObject({ id: target.user.id, role: 'ADMIN' })
    expect(
      await db.account.count({ where: { userId: target.user.id, providerId: 'credential' } }),
    ).toBe(1)
    expect(
      (await request('/sign-in/email', { email: target.email, password: target.password })).status,
    ).toBe(200)
    expect(await auditCount(target.user.id)).toBe(1)
  })
  it.each([false, true])(
    'grants new Google owner, preserves native redirect/cookies (callback=%s)',
    async (callback) => {
      const email = mailbox()
      const subject = randomUUID()
      await approve(email)
      const login = await googleLogin(email, callback, subject)
      expect(login.status).toBe(callback ? 302 : 200)
      if (callback) expect(login.headers.get('location')).toBe(`${origin}/admin`)
      else expect((await login.json()).user.role).toBe('ADMIN')
      expect(Boolean(cookies(login))).toBe(true)
      const user = await db.user.findUniqueOrThrow({ where: { email } })
      expect(user).toMatchObject({ role: 'ADMIN', emailVerified: true, platformVersion: 1 })
      expect(
        (await (await request('/get-session', undefined, cookies(login))).json()).user.role,
      ).toBe('ADMIN')
      const again = await googleLogin(email, callback, subject)
      expect(again.status).toBe(callback ? 302 : 200)
      expect(await auditCount(user.id)).toBe(1)
      expect(await db.account.count({ where: { userId: user.id } })).toBe(1)
    },
  )
  it.each(['absent', 'inactive'] as const)(
    'keeps verified native identities USER for %s approval',
    async (state) => {
      for (const method of ['otp', 'google', 'password'] as const) {
        const email = mailbox()
        if (state === 'inactive') {
          await approve(email)
          await db.adminEmail.update({ where: { email }, data: { active: false } })
        }
        let response: Response
        if (method === 'otp') response = await otpLogin(email)
        else if (method === 'google') response = await googleLogin(email)
        else {
          const target = await signup(email)
          expect((await verificationOTP(email)).status).toBe(200)
          response = await request('/sign-in/email', { email, password: target.password })
        }
        expect(response.status).toBe(200)
        expect((await response.json()).user.role).toBe('USER')
      }
    },
  )
  it('keeps first-OTP ownership cleanup while promoting the exact existing owner', async () => {
    const target = await signup()
    // Seed an earlier valid signup-era session through sender-disabled native password sign-in.
    expect(
      (
        await request(
          '/sign-in/email',
          { email: target.email, password: target.password },
          '',
          'POST',
          disabledURL,
        )
      ).status,
    ).toBe(200)
    const stale = await db.session.findFirstOrThrow({ where: { userId: target.user.id } })
    await approve(target.email)
    const login = await otpLogin(target.email)
    expect(login.status).toBe(200)
    expect((await login.json()).user).toMatchObject({ id: target.user.id, role: 'ADMIN' })
    expect(
      await db.account.count({ where: { userId: target.user.id, providerId: 'credential' } }),
    ).toBe(0)
    expect(await db.session.findUnique({ where: { id: stale.id } })).toBeNull()
    expect(await db.session.count({ where: { userId: target.user.id } })).toBe(1)
  })
  it('does not convert staff roles, or require intent to preserve legacy ADMIN', async () => {
    for (const role of ['MERCHANT', 'MODERATOR', 'ADMIN'] as const) {
      const target = await signup()
      expect((await verificationOTP(target.email)).status).toBe(200)
      await db.user.update({ where: { id: target.user.id }, data: { role } })
      if (role !== 'ADMIN') await approve(target.email)
      const login = await request('/sign-in/email', {
        email: target.email,
        password: target.password,
      })
      expect(login.status).toBe(200)
      expect((await login.json()).user.role).toBe(role)
      expect(await auditCount(target.user.id)).toBe(0)
    }
  })
  it('invalidates pending merchant intent with truthful policy attribution', async () => {
    const target = await signup()
    const pending = await db.merchantAccessRequest.create({
      data: {
        userId: target.user.id,
        venueId: '000000000000000000000001',
        userName: 'Disposable',
        userEmail: target.email,
        venueName: 'Synthetic',
        merchantName: 'Synthetic',
        message: 'Pending request',
      },
    })
    await approve(target.email)
    expect((await otpLogin(target.email)).status).toBe(200)
    expect(await db.merchantAccessRequest.findUnique({ where: { id: pending.id } })).toMatchObject({
      status: 'REJECTED',
      version: 2,
      reviewedById: null,
    })
    expect(
      await db.adminEmailEvent.findFirst({ where: { targetUserId: target.user.id } }),
    ).toMatchObject({
      source: 'NATIVE_AUTH',
      actorUserId: null,
      invalidatedRequestCount: 1,
      roleBefore: 'USER',
      roleAfter: 'ADMIN',
    })
  })
  it('does not turn read, challenge/check, profile, recovery or OAuth initiation into grant events', async () => {
    const target = await signup()
    expect((await verificationOTP(target.email)).status).toBe(200)
    const login = await request('/sign-in/email', {
      email: target.email,
      password: target.password,
    })
    const cookie = cookies(login)
    await approve(target.email)
    const spy = vi.fn(async () => {})
    provisionObserver = spy
    try {
      expect((await request('/get-session', undefined, cookie)).status).toBe(200)
      expect((await request('/get-session', undefined, cookie, 'HEAD')).status).toBe(404)
      expect((await request('/get-session', {}, cookie)).status).toBe(200)
      expect(
        (await request('/update-user', { name: 'Still USER', role: 'ADMIN' }, cookie)).status,
      ).toBe(400)
      expect((await request('/update-user', { name: 'Still USER' }, cookie)).status).toBe(200)
      expect(
        (
          await request('/email-otp/send-verification-otp', {
            email: target.email,
            type: 'sign-in',
          })
        ).status,
      ).toBe(200)
      expect(
        (
          await request('/email-otp/check-verification-otp', {
            email: target.email,
            type: 'sign-in',
            otp: mail.get(target.email),
          })
        ).status,
      ).toBe(200)
      expect(
        (
          await request('/request-password-reset', {
            email: target.email,
            redirectTo: `${origin}/login`,
          })
        ).status,
      ).toBe(200)
      expect(
        (
          await request(
            '/sign-in/social',
            { provider: 'google', callbackURL: `${origin}/admin`, disableRedirect: true },
            cookie,
          )
        ).status,
      ).toBe(200)
      expect(
        (
          await request(
            '/link-social',
            { provider: 'google', idToken: { token: googleToken(target.email, randomUUID()) } },
            cookie,
          )
        ).status,
      ).toBe(200)
      expect(spy).not.toHaveBeenCalled()
      expect(await db.user.findUnique({ where: { id: target.user.id } })).toMatchObject({
        role: 'USER',
        platformVersion: null,
      })
    } finally {
      provisionObserver = async () => {}
    }
  })

  it('requires verified ownership for manual ADMIN assignment and atomically synchronizes intent', async () => {
    const admin = await adminActor()
    const target = await signup()
    await expect(roleChange(admin.id, target.user.id, 'ADMIN')).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    })
    expect(await db.adminEmail.findUnique({ where: { email: target.email } })).toBeNull()
    expect((await otpLogin(target.email)).status).toBe(200)
    await roleChange(admin.id, target.user.id, 'ADMIN')
    const approval = await db.adminEmail.findUniqueOrThrow({ where: { email: target.email } })
    expect(approval).toMatchObject({ active: true, version: 1 })
    expect(await db.adminEmailEvent.findMany({ where: { approvalId: approval.id } })).toMatchObject(
      [
        {
          action: 'APPROVED',
          source: 'ADMIN_ROLE_CHANGE',
          actorUserId: admin.id,
          targetUserId: target.user.id,
        },
      ],
    )
    await roleChange(admin.id, target.user.id, 'USER', 1)
    expect(await db.adminEmail.findUnique({ where: { email: target.email } })).toMatchObject({
      active: false,
      version: 2,
    })
    expect((await otpLogin(target.email)).status).toBe(200)
    expect(await db.user.findUnique({ where: { id: target.user.id } })).toMatchObject({
      role: 'USER',
      platformVersion: 2,
    })
  })
  it('retires outstanding approval on USER to MERCHANT, not just ADMIN demotion', async () => {
    const admin = await adminActor()
    const target = await signup()
    await approve(target.email)
    await roleChange(admin.id, target.user.id, 'MERCHANT')
    expect(await db.adminEmail.findUnique({ where: { email: target.email } })).toMatchObject({
      active: false,
      version: 2,
    })
    expect(
      await db.adminEmailEvent.findFirst({
        where: { targetUserId: target.user.id, action: 'REVOKED' },
      }),
    ).toMatchObject({ actorUserId: admin.id })
  })
  it('claims preapproved email only after first verified OTP admission and returns fresh role', async () => {
    const email = mailbox()
    await approve(email)
    expect(await db.user.count({ where: { email } })).toBe(0)
    const login = await otpLogin(email)
    expect(login.status).toBe(200)
    expect((await login.json()).user.role).toBe('ADMIN')
    const user = await db.user.findUniqueOrThrow({ where: { email } })
    expect(user.role).toBe('ADMIN')
    expect(user.platformVersion).toBe(1)
    expect(user.emailVerified).toBe(true)
    const session = await db.session.findFirstOrThrow({ where: { userId: user.id } })
    expect(session.loginAt).toEqual(session.createdAt)
    const fresh = await request('/get-session', undefined, cookies(login))
    expect((await fresh.json()).user.role).toBe('ADMIN')
  })
})
