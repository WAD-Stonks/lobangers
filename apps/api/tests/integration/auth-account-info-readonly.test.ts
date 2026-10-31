import { execFile } from 'node:child_process'
import { generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto'
import { copyFile, mkdtemp, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

// Derived from the independent SPEC-1 HTTP probe, not a replacement auth handler.
const root = fileURLToPath(new URL('../../../../', import.meta.url))
const origin = 'http://localhost:5173'
const nativeFetch = globalThis.fetch
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = {
  ...publicKey.export({ format: 'jwk' }),
  kid: 'readonly-test',
  alg: 'RS256',
  use: 'sig',
}
const googleToken = (email: string, subject: string) => {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const payload = `${encode({ alg: 'RS256', kid: jwk.kid })}.${encode({ iss: 'https://accounts.google.com', aud: 'readonly.apps.googleusercontent.com', sub: subject, email, email_verified: true, name: 'Controlled Google', iat: now, exp: now + 3600 })}`
  return `${payload}.${sign('RSA-SHA256', Buffer.from(payload), privateKey).toString('base64url')}`
}
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let baseURL = ''
let scratch = ''
let receipt = 0
let db!: typeof import('@broke-oclock/db').db
let auth!: ReturnType<typeof import('@broke-oclock/auth/server').createAuth>
let refreshes = 0
let providerReads = 0
let transactions = 0
let ip = 1
let refreshBarrier: (() => Promise<void>) | undefined
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
const cookieOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ')
const identity = async (expiresInMs: number) => {
  const email = `native-readonly-${randomUUID()}@example.test`
  const password = randomBytes(24).toString('base64url')
  const signup = await request('/sign-up/email', { email, password, name: 'Disposable readonly' })
  expect(signup.status).toBe(200)
  const cookie = cookieOf(signup)
  const user = await db.user.findUniqueOrThrow({ where: { email } })
  await db.user.update({ where: { id: user.id }, data: { emailVerified: true } })
  const linked = await request(
    '/link-social',
    {
      provider: 'google',
      idToken: { token: googleToken(email, randomUUID()) },
    },
    cookie,
  )
  expect(linked.status).toBe(200)
  const account = await db.account.findFirstOrThrow({
    where: { userId: user.id, providerId: 'google' },
  })
  await db.account.update({
    where: { id: account.id },
    data: {
      accessToken: 'fixture-access',
      refreshToken: 'fixture-refresh',
      accessTokenExpiresAt: new Date(Date.now() + expiresInMs),
    },
  })
  return { user, account, cookie, password }
}
// Every collection/document/field, not only selected timestamps or token columns.
const snapshot = async () => {
  const inventory = (await db.$runCommandRaw({
    listCollections: 1,
    nameOnly: true,
  })) as unknown as {
    cursor: { firstBatch: { name: string }[]; id: unknown }
  }
  expect(inventory.cursor.id).toBe(0)
  const result: Record<string, unknown> = {}
  for (const { name } of inventory.cursor.firstBatch.sort((a, b) => a.name.localeCompare(b.name))) {
    const rows = (await db.$runCommandRaw({
      find: name,
      sort: { _id: 1 },
      batchSize: 10_000,
    })) as unknown as {
      cursor: { firstBatch: unknown[]; id: unknown }
    }
    expect(rows.cursor.id).toBe(0)
    result[name] = rows.cursor.firstBatch
  }
  return result
}
const recordSnapshots = async (
  method: string,
  before: Awaited<ReturnType<typeof snapshot>>,
  after: Awaited<ReturnType<typeof snapshot>>,
  response: Response,
) => {
  await writeFile(
    resolve(scratch, `${++receipt}-${method}-snapshots.json`),
    JSON.stringify(
      {
        status: response.status,
        setCookie: response.headers.getSetCookie(),
        before,
        after,
      },
      null,
      2,
    ),
  )
}

beforeAll(async () => {
  if (process.env.DATABASE_URL) throw new Error('Readonly fixture refuses ambient DATABASE_URL')
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const databaseUrl = mongo.getUri(`native_readonly_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  scratch = await mkdtemp(resolve(tmpdir(), 'lobangers-native-readonly-'))
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
      expect(body.get('grant_type')).toBe('refresh_token')
      expect(body.get('refresh_token')).toBe('fixture-refresh')
      refreshes++
      await refreshBarrier?.()
      return Response.json({
        access_token: `renewed-fixture-${refreshes}`,
        token_type: 'Bearer',
        expires_in: 3600,
      })
    }
    // Existing signed idToken supplies user info; no real Google endpoint is contacted.
    providerReads++
    throw new Error(`Unexpected provider network: ${new URL(url).origin}`)
  })
  const transaction = db.$transaction.bind(db)
  vi.spyOn(db, '$transaction').mockImplementation((...args: Parameters<typeof db.$transaction>) => {
    transactions++
    return Reflect.apply(transaction, db, args)
  })
  server = createServer()
  await new Promise<void>((done) => server?.listen(0, '127.0.0.1', done))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No disposable listener')
  baseURL = `http://127.0.0.1:${address.port}`
  auth = createAuth({
    baseURL,
    trustedOrigin: origin,
    secret: randomBytes(32).toString('hex'),
    google: {
      clientId: 'readonly.apps.googleusercontent.com',
      clientSecret: 'disposable-secret',
    },
  })
  server.on('request', toNodeHandler(auth))
}, 180_000)
afterAll(async () => {
  if (server) {
    server.closeAllConnections()
    await new Promise<void>((done) => server?.close(() => done()))
    expect(server.listening).toBe(false)
  }
  await db?.$disconnect()
  if (mongo) {
    await mongo.stop()
    expect(mongo.state).toBe('stopped')
  }
  console.log(
    'READONLY_TEARDOWN',
    JSON.stringify({
      listening: server?.listening,
      mongo: mongo?.state,
      scratch,
      receipts: receipt,
    }),
  )
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

it('expired account-info GET refuses without provider refresh, transactions, cookies or any persisted writes', async () => {
  const local = await identity(-60_000)
  const before = await snapshot()
  const counts = { refreshes, providerReads, transactions }
  const response = await request(
    `/account-info?accountId=${local.account.id}`,
    undefined,
    local.cookie,
  )
  const body = await response.json()
  const after = await snapshot()
  await recordSnapshots('GET', before, after, response)
  console.log(
    'READONLY_RECEIPT',
    JSON.stringify({
      status: response.status,
      refreshes: refreshes - counts.refreshes,
      transactions: transactions - counts.transactions,
      unchanged: JSON.stringify(after) === JSON.stringify(before),
      cookies: response.headers.getSetCookie().length,
      code: body.code,
    }),
  )
  expect(after).toEqual(before)
  expect({ refreshes, providerReads, transactions }).toEqual(counts)
  expect(response.headers.getSetCookie()).toEqual([])
  expect(response.status).toBe(400)
  expect(body.code).toBe('FAILED_TO_GET_ACCESS_TOKEN')
})

const assertReadonly = async (
  local: Awaited<ReturnType<typeof identity>>,
  method: 'GET' | 'HEAD',
  status: number,
  accountId = local.account.id,
) => {
  const before = await snapshot()
  const counts = { refreshes, providerReads, transactions }
  const response = await request(
    `/account-info?accountId=${accountId}`,
    undefined,
    local.cookie,
    method,
  )
  const text = await response.text()
  const after = await snapshot()
  await recordSnapshots(method, before, after, response)
  expect(after).toEqual(before)
  expect({ refreshes, providerReads, transactions }).toEqual(counts)
  expect(response.headers.getSetCookie()).toEqual([])
  expect(response.status).toBe(status)
  if (method === 'HEAD') expect(text).toBe('')
  else if (status === 400) expect(JSON.parse(text).code).toBe('FAILED_TO_GET_ACCESS_TOKEN')
  else if (status === 200) {
    expect(JSON.parse(text).account.id).toBe(local.account.id)
    expect(JSON.parse(text).user).toMatchObject({ email: local.user.email, emailVerified: true })
  }
}

it('near-expiry account-info GET refuses at the native five-second refresh window', async () => {
  const local = await identity(4_000)
  const account = await db.account.findUniqueOrThrow({ where: { id: local.account.id } })
  const remaining = (account.accessTokenExpiresAt?.getTime() ?? 0) - Date.now()
  expect(remaining).toBeGreaterThan(0)
  expect(remaining).toBeLessThan(5_000)
  await assertReadonly(local, 'GET', 400)
})

it('aged-session account-info GET and HEAD do not renew the session or cookie', async () => {
  const local = await identity(-60_000)
  const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
  await db.session.updateMany({
    where: { userId: local.user.id },
    data: {
      createdAt: old,
      updatedAt: old,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  })
  await assertReadonly(local, 'GET', 400)
  await assertReadonly(local, 'HEAD', 404)
})

it('valid-token account-info GET retains native provider info without any writes', async () => {
  const local = await identity(60_000)
  await assertReadonly(local, 'GET', 200)
})

it.each([-60_000, 4_000, 60_000])(
  'account-info HEAD preserves native method refusal and complete state for expiry %i',
  async (expiry) => {
    const local = await identity(expiry)
    // Pinned native account-info exposes GET only; do not invent a HEAD endpoint.
    await assertReadonly(local, 'HEAD', 404)
  },
)

it('account-info cannot select another user account', async () => {
  const local = await identity(-60_000)
  const other = await identity(-60_000)
  const before = await snapshot()
  const counts = { refreshes, providerReads, transactions }
  const response = await request(
    `/account-info?accountId=${other.account.id}`,
    undefined,
    local.cookie,
  )
  expect(response.status).toBe(400)
  expect((await response.json()).code).toBe('ACCOUNT_NOT_FOUND')
  expect(response.headers.getSetCookie()).toEqual([])
  const after = await snapshot()
  await recordSnapshots('GET-foreign', before, after, response)
  expect(after).toEqual(before)
  expect({ refreshes, providerReads, transactions }).toEqual(counts)
})

it('revoking the exact cookie session denies it even while a sibling native session remains active', async () => {
  const local = await identity(60_000)
  const original = await db.session.findFirstOrThrow({ where: { userId: local.user.id } })
  const signin = await request('/sign-in/email', {
    email: local.user.email,
    password: local.password,
  })
  expect(signin.status).toBe(200)
  await db.session.delete({ where: { id: original.id } })
  expect(await db.session.count({ where: { userId: local.user.id } })).toBe(1)
  await assertReadonly(local, 'GET', 401)
  await assertReadonly({ ...local, cookie: cookieOf(signin) }, 'GET', 200)
})

it.each(['revoked', 'suspended', 'generation'] as const)(
  'account-info GET denies %s identity without writes',
  async (state) => {
    const local = await identity(-60_000)
    if (state === 'revoked') await db.session.deleteMany({ where: { userId: local.user.id } })
    else if (state === 'suspended')
      await db.user.update({ where: { id: local.user.id }, data: { suspendedAt: new Date() } })
    else await db.user.update({ where: { id: local.user.id }, data: { authVersion: 1 } })
    await assertReadonly(local, 'GET', 401)
    await assertReadonly(local, 'HEAD', 404)
  },
)

it.each(['/refresh-token', '/get-access-token'])(
  'native POST %s still refreshes transactionally, then GET succeeds read-only',
  async (endpoint) => {
    const local = await identity(-60_000)
    const userBefore = await db.user.findUniqueOrThrow({ where: { id: local.user.id } })
    const sessionBefore = await db.session.findFirstOrThrow({ where: { userId: local.user.id } })
    const counts = { refreshes, transactions }
    const response = await request(endpoint, { accountId: local.account.id }, local.cookie)
    expect(response.status).toBe(200)
    const tokens = await response.json()
    expect(tokens.accessToken).toBe(`renewed-fixture-${counts.refreshes + 1}`)
    expect(refreshes).toBe(counts.refreshes + 1)
    expect(transactions).toBeGreaterThan(counts.transactions)
    expect(response.headers.getSetCookie()).toEqual([])
    expect(
      (await db.account.findUniqueOrThrow({ where: { id: local.account.id } })).accessToken,
    ).toBe(tokens.accessToken)
    const userAfter = await db.user.findUniqueOrThrow({ where: { id: local.user.id } })
    const sessionAfter = await db.session.findUniqueOrThrow({ where: { id: sessionBefore.id } })
    // Actor fences are meaningful writes on the actual persisted owner/exact session.
    expect(userAfter.updatedAt.getTime()).toBeGreaterThan(userBefore.updatedAt.getTime())
    expect(sessionAfter.updatedAt.getTime()).toBeGreaterThan(sessionBefore.updatedAt.getTime())
    expect({ ...userAfter, updatedAt: userBefore.updatedAt }).toEqual(userBefore)
    expect({ ...sessionAfter, updatedAt: sessionBefore.updatedAt }).toEqual(sessionBefore)
    await assertReadonly(local, 'GET', 200)
  },
)

it.each(['revoked', 'suspended', 'generation'] as const)(
  'native POST refresh refuses persistence after %s during controlled provider work',
  async (state) => {
    const local = await identity(-60_000)
    let arrived!: () => void
    let release!: () => void
    const waiting = new Promise<void>((done) => {
      arrived = done
    })
    const gate = new Promise<void>((done) => {
      release = done
    })
    refreshBarrier = async () => {
      arrived()
      await gate
    }
    const pending = request('/refresh-token', { accountId: local.account.id }, local.cookie)
    let expected!: Awaited<ReturnType<typeof snapshot>>
    try {
      await Promise.race([
        waiting,
        pending.then(async (r) => {
          throw new Error(`Provider not reached: ${r.status} ${await r.clone().text()}`)
        }),
      ])
      if (state === 'revoked') await db.session.deleteMany({ where: { userId: local.user.id } })
      else if (state === 'suspended')
        await db.user.update({ where: { id: local.user.id }, data: { suspendedAt: new Date() } })
      else await db.user.update({ where: { id: local.user.id }, data: { authVersion: 1 } })
      expected = await snapshot()
    } finally {
      release()
      refreshBarrier = undefined
    }
    const response = await pending
    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('FAILED_TO_REFRESH_ACCESS_TOKEN')
    expect(response.headers.getSetCookie()).toEqual([])
    expect(await snapshot()).toEqual(expected)
  },
)

it('an overlapping read refuses refresh without changing the in-flight native POST provider', async () => {
  const local = await identity(-60_000)
  let arrived!: () => void
  let release!: () => void
  const waiting = new Promise<void>((done) => {
    arrived = done
  })
  const gate = new Promise<void>((done) => {
    release = done
  })
  refreshBarrier = async () => {
    arrived()
    await gate
  }
  const pending = request('/refresh-token', { accountId: local.account.id }, local.cookie)
  try {
    await Promise.race([
      waiting,
      pending.then(async (r) => {
        throw new Error(`Provider not reached: ${r.status} ${await r.clone().text()}`)
      }),
    ])
    await assertReadonly(local, 'GET', 400)
  } finally {
    release()
    refreshBarrier = undefined
  }
  const response = await pending
  expect(response.status).toBe(200)
  expect((await response.json()).accessToken).toMatch(/^renewed-fixture-/)
  await assertReadonly(local, 'GET', 200)
})
