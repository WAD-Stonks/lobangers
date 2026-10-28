import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { pushDisposableSchema } from '@api/../tests/fixtures/disposable-schema'
import {
  registerSyntheticOutletFixtureDatabase,
  seedSyntheticOutletProof,
  seedSyntheticScope,
} from '@api/../tests/fixtures/outlet-proof'
import { parseConfig } from '@api/config'
import { createApiClient } from '@broke-oclock/api-client'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const origin = 'http://localhost:5173'
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let disconnect: (() => Promise<void>) | undefined
let baseURL = ''
let databaseUrl = ''
let db!: typeof import('@broke-oclock/db').db
// Better Auth allows only 3 sign-ups per 10 seconds per client, and the production rate limit stays
// on. So the whole file signs up exactly three accounts once and reuses them; each test starts
// from clean records (see beforeEach) instead of creating new users.
let alice!: Account
let bob!: Account
let staff!: Account

type Account = { id: string; email: string; cookies: string }
type Page<Item> = { items: Item[]; nextCursor: string | null }
type CallOptions = { cookie?: string; body?: object; origin?: string | null }

const call = (method: string, path: string, options: CallOptions = {}) =>
  fetch(`${baseURL}${path}`, {
    method,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.origin === null ? {} : { Origin: options.origin ?? origin }),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  })

const cookieFrom = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')

const signUp = async (): Promise<Account> => {
  const email = `community-${randomUUID()}@example.test`
  const response = await call('POST', '/api/auth/sign-up/email', {
    body: { name: 'Account Test', email, password: randomBytes(24).toString('base64url') },
  })
  expect(response.status).toBe(200)
  const body = (await response.json()) as { user: { id: string } }
  return { id: body.user.id, email, cookies: cookieFrom(response) }
}

const dealBase = {
  description: 'Synthetic deal',
  category: 'food',
  offerType: 'OTHER',
  applicability: 'NO_FIXED_LOCATION',
} as const

const publicDeal = (title: string) =>
  db.deal.create({
    data: {
      ...dealBase,
      title,
      reviewStatus: 'APPROVED',
      publishedAt: new Date(),
      reviewedVersion: 1,
    },
  })
const pendingDeal = (title: string, submittedById?: string) =>
  db.deal.create({ data: { ...dealBase, title, ...(submittedById ? { submittedById } : {}) } })
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  // Always a fresh disposable replica set; never a configured DATABASE_URL.
  databaseUrl = mongo.getUri(`integration_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  await pushDisposableSchema(databaseUrl)
  db = (await import('@broke-oclock/db')).db
  registerSyntheticOutletFixtureDatabase(db, databaseUrl)
  disconnect = () => db.$disconnect()
  const { createApp } = await import('@api/app')
  server = createServer()
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing local test server address')
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
  alice = await signUp()
  bob = await signUp()
  staff = await signUp()
}, 180_000)

beforeEach(async () => {
  await db.commentReport.deleteMany()
  await db.dealReport.deleteMany()
  await db.dealVote.deleteMany()
  await db.comment.deleteMany()
  await db.dealVenue.deleteMany()
  await db.bookmark.deleteMany()
  await db.deal.deleteMany()
  await db.venue.deleteMany()
  await db.merchant.deleteMany()
})
afterAll(async () => {
  await disconnect?.()
  await new Promise<void>((resolve) => {
    if (server) {
      server.close(() => resolve())
      server.closeAllConnections()
    } else resolve()
  })
  await mongo?.stop()
})

describe('community REST with real cookies and disposable MongoDB', () => {
  it('installs the pagination index and pages only the requested deal amid unrelated comments', async () => {
    const target = await publicDeal('Synthetic pagination target')
    const unrelated = await publicDeal('Synthetic unrelated target')
    await db.comment.createMany({
      data: [target, unrelated].flatMap((deal) =>
        Array.from({ length: 3000 }, (_, i) => ({
          dealId: deal.id,
          authorId: alice.id,
          body: `Synthetic comment ${i}`,
        })),
      ),
    })
    // Introspect a temporary datasource-only schema: never overwrite the repo schema.
    const directory = await mkdtemp(join(tmpdir(), 'community-index-'))
    try {
      const schema = join(directory, 'schema.prisma')
      await writeFile(
        schema,
        'datasource db {\n  provider = "mongodb"\n  url = env("DATABASE_URL")\n}\n',
      )
      const { stdout } = await promisify(execFile)(
        'pnpm',
        ['--dir', 'packages/db', 'exec', 'prisma', 'db', 'pull', '--schema', schema, '--print'],
        {
          cwd: root,
          env: { ...process.env, DATABASE_URL: databaseUrl },
          encoding: 'utf8',
          timeout: 60_000,
        },
      )
      const commentModel = stdout.match(/model Comment \{[\s\S]*?\n\}/)?.[0]
      expect(commentModel).toContain('@@index([dealId, id(sort: Desc)])')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
    const expected = await db.comment.findMany({
      where: { dealId: target.id },
      orderBy: { id: 'desc' },
      take: 40,
      select: { id: true },
    })
    const firstResponse = await call('GET', `/api/deals/${target.id}/comments?limit=20`)
    expect(firstResponse.status).toBe(200)
    const first = (await firstResponse.json()) as Page<{ id: string }>
    expect(first.items.map((item) => item.id)).toEqual(expected.slice(0, 20).map((item) => item.id))
    expect(first.nextCursor).toBe(first.items.at(-1)?.id)
    const secondResponse = await call(
      'GET',
      `/api/deals/${target.id}/comments?limit=20&cursor=${first.nextCursor}`,
    )
    expect(secondResponse.status).toBe(200)
    const second = (await secondResponse.json()) as Page<{ id: string }>
    expect(second.items.map((item) => item.id)).toEqual(expected.slice(20).map((item) => item.id))
  }, 90_000)
  it('requires authentication, exact origin, strict input and supported methods', async () => {
    const deal = await publicDeal('Synthetic community deal')
    expect((await call('GET', `/api/deals/${deal.id}/community`)).status).toBe(200)
    expect(
      (await call('PUT', `/api/deals/${deal.id}/vote`, { body: { value: 'ALIVE' } })).status,
    ).toBe(401)
    expect(
      (
        await call('PUT', `/api/deals/${deal.id}/vote`, {
          cookie: alice.cookies,
          origin: null,
          body: { value: 'ALIVE' },
        })
      ).status,
    ).toBe(403)
    expect(
      (
        await call('PUT', `/api/deals/${deal.id}/vote`, {
          cookie: alice.cookies,
          body: { value: 'ALIVE', userId: bob.id },
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await call('POST', `/api/deals/${deal.id}/comments`, {
          cookie: alice.cookies,
          body: { body: '   ' },
        })
      ).status,
    ).toBe(400)
    expect((await call('GET', `/api/deals/${deal.id}/comments?limit=1e2`)).status).toBe(400)
    expect((await call('GET', `/api/deals/${deal.id}/vote`)).status).toBe(405)
    expect((await call('HEAD', `/api/deals/${deal.id}/comments`)).status).toBe(200)
    expect((await call('GET', '/api/deals/not-an-id/community')).status).toBe(400)
    expect(await db.dealVote.count()).toBe(0)
    expect(await db.comment.count()).toBe(0)
  })
  it('uses one changeable vote per account, freshness, removal and the approved policy', async () => {
    const deal = await publicDeal('Synthetic vote target')
    const path = `/api/deals/${deal.id}/vote`
    for (const account of [alice, bob, staff])
      expect(
        (await call('PUT', path, { cookie: account.cookies, body: { value: 'ALIVE' } })).status,
      ).toBe(200)
    const before = await db.dealVote.findUniqueOrThrow({
      where: { userId_dealId: { userId: alice.id, dealId: deal.id } },
    })
    const repeat = await call('PUT', path, { cookie: alice.cookies, body: { value: 'ALIVE' } })
    expect(await repeat.json()).toMatchObject({
      alive: 3,
      dead: 0,
      status: 'LIKELY_STILL_ON',
      myVote: 'ALIVE',
      policy: { minAlive: 3, positivePercent: 80, windowHours: 24 },
    })
    expect(await db.dealVote.count()).toBe(3)
    expect((await db.dealVote.findUniqueOrThrow({ where: { id: before.id } })).updatedAt).toEqual(
      before.updatedAt,
    )
    const changed = await call('PUT', path, { cookie: alice.cookies, body: { value: 'DEAD' } })
    expect(await changed.json()).toMatchObject({ alive: 2, dead: 1, status: 'UNCERTAIN' })
    expect((await call('DELETE', path, { cookie: alice.cookies })).status).toBe(200)
    await db.dealVote.updateMany({
      where: { dealId: deal.id },
      data: { updatedAt: new Date(Date.now() - 25 * 3600000) },
    })
    const summary = await call('GET', `/api/deals/${deal.id}/community`)
    expect(await summary.json()).toMatchObject({
      alive: 0,
      dead: 0,
      status: 'NO_RECENT_REPORTS',
      myVote: null,
    })
    const renewed = await call('PUT', path, { cookie: bob.cookies, body: { value: 'ALIVE' } })
    expect(await renewed.json()).toMatchObject({ alive: 1, dead: 0, myVoteIsRecent: true })
    await db.deal.update({
      where: { id: deal.id },
      data: { validUntil: new Date(Date.now() - 1000) },
    })
    expect(
      (await call('PUT', path, { cookie: alice.cookies, body: { value: 'ALIVE' } })).status,
    ).toBe(400)
    expect(await (await call('GET', `/api/deals/${deal.id}/community`)).json()).toMatchObject({
      status: 'EXPIRED',
    })
  })
  it('handles concurrent votes without duplicate evidence', async () => {
    const deal = await publicDeal('Synthetic concurrent target')
    const responses = await Promise.all(
      ['ALIVE', 'DEAD'].map((value) =>
        call('PUT', `/api/deals/${deal.id}/vote`, { cookie: alice.cookies, body: { value } }),
      ),
    )
    expect(responses.every((response) => [200, 409].includes(response.status))).toBe(true)
    expect(responses.some((response) => response.status === 200)).toBe(true)
    expect(await db.dealVote.count({ where: { dealId: deal.id, userId: alice.id } })).toBe(1)
  })
  it('paginates comments, protects ownership and soft deletes without exposing auth records', async () => {
    const deal = await publicDeal('Synthetic comments')
    const path = `/api/deals/${deal.id}/comments`
    const first = await call('POST', path, {
      cookie: alice.cookies,
      body: { body: '  At the synthetic outlet.  ' },
    })
    expect(first.status).toBe(201)
    const comment = (await first.json()) as { id: string; body: string; canDelete: boolean }
    expect(comment).toMatchObject({ body: 'At the synthetic outlet.', canDelete: true })
    await call('POST', path, { cookie: bob.cookies, body: { body: 'Another observation.' } })
    const page = (await (
      await call('GET', `${path}?limit=1`, { cookie: alice.cookies })
    ).json()) as Page<{ id: string; canDelete: boolean }>
    expect(page.items).toHaveLength(1)
    expect(page.nextCursor).not.toBeNull()
    const older = (await (
      await call('GET', `${path}?limit=1&cursor=${page.nextCursor}`, { cookie: alice.cookies })
    ).json()) as Page<{ id: string; canDelete: boolean }>
    expect(older.items[0]).toMatchObject({ id: comment.id, canDelete: true })
    const anonymous = (await (await call('GET', path)).json()) as Page<Record<string, unknown>>
    expect(
      anonymous.items.every(
        (row) => row.canDelete === false && !('authorId' in row) && !('email' in row),
      ),
    ).toBe(true)
    expect(
      (await call('DELETE', `/api/comments/${comment.id}`, { cookie: bob.cookies })).status,
    ).toBe(403)
    expect(
      (await call('DELETE', `/api/comments/${comment.id}`, { cookie: alice.cookies })).status,
    ).toBe(200)
    expect(
      (await db.comment.findUniqueOrThrow({ where: { id: comment.id } })).deletedAt,
    ).not.toBeNull()
    expect(await (await call('GET', `/api/deals/${deal.id}/community`)).json()).toMatchObject({
      commentCount: 1,
    })
  })
  it('persists idempotent reports separately from visibility and rate limits comment spam', async () => {
    const deal = await publicDeal('Synthetic reporting')
    const created = (await (
      await call('POST', `/api/deals/${deal.id}/comments`, {
        cookie: alice.cookies,
        body: { body: 'Synthetic comment' },
      })
    ).json()) as { id: string }
    const path = `/api/comments/${created.id}/reports`
    for (let i = 0; i < 2; i++)
      expect(
        (await call('POST', path, { cookie: bob.cookies, body: { reason: 'SPAM' } })).status,
      ).toBe(200)
    expect(await db.commentReport.count()).toBe(1)
    expect((await db.comment.findUniqueOrThrow({ where: { id: created.id } })).hiddenAt).toBeNull()
    for (let i = 0; i < 4; i++)
      expect(
        (
          await call('POST', `/api/deals/${deal.id}/comments`, {
            cookie: alice.cookies,
            body: { body: `Synthetic comment ${i}` },
          })
        ).status,
      ).toBe(201)
    expect(
      (
        await call('POST', `/api/deals/${deal.id}/comments`, {
          cookie: alice.cookies,
          body: { body: 'Too many' },
        })
      ).status,
    ).toBe(429)
    expect(await db.comment.count()).toBe(5)
    await db.comment.update({ where: { id: created.id }, data: { hiddenAt: new Date() } })
    expect(
      (await call('POST', path, { cookie: staff.cookies, body: { reason: 'SPAM' } })).status,
    ).toBe(404)
    expect(await (await call('GET', `/api/deals/${deal.id}/community`)).json()).toMatchObject({
      commentCount: 4,
    })
  })
  it('uses the real shared Axios client and public list with fresh evidence only', async () => {
    const merchant = await db.merchant.create({ data: { name: 'Synthetic chain' } })
    const venue = await db.venue.create({
      data: {
        merchantId: merchant.id,
        name: 'Synthetic outlet',
        address: 'Synthetic address',
        latitude: 1.3,
        longitude: 103.8,
      },
    })
    const deal = await publicDeal('Synthetic client target')
    await db.deal.update({
      where: { id: deal.id },
      data: { applicability: 'ALL_MERCHANT_OUTLETS', merchantId: merchant.id },
    })
    const client = createApiClient(`${baseURL}/api`)
    expect((await client.deals.list()).items.map((item) => item.id)).not.toContain(deal.id)
    await seedSyntheticOutletProof(db, venue.id)
    await seedSyntheticScope(db, deal.id, 'SOURCE_ALL')
    expect((await client.deals.list()).items.map((item) => item.id)).toContain(deal.id)
    client.http.defaults.headers.common.Origin = origin
    client.http.defaults.headers.common.Cookie = alice.cookies
    expect(await client.community.vote(deal.id, 'ALIVE')).toMatchObject({
      alive: 1,
      myVote: 'ALIVE',
    })
    client.http.defaults.headers.common.Cookie = bob.cookies
    await client.community.vote(deal.id, 'ALIVE')
    client.http.defaults.headers.common.Cookie = staff.cookies
    await client.community.vote(deal.id, 'ALIVE')
    expect((await client.deals.list()).items[0]?.votes).toMatchObject({
      alive: 3,
      status: 'LIKELY_STILL_ON',
    })
    await db.dealVote.updateMany({
      where: { dealId: deal.id },
      data: { updatedAt: new Date(Date.now() - 25 * 3600000) },
    })
    expect((await client.deals.list()).items[0]?.votes).toMatchObject({
      alive: 0,
      dead: 0,
      status: 'NO_RECENT_REPORTS',
    })
    expect(await client.community.addComment(deal.id, 'Shared-client comment')).toMatchObject({
      body: 'Shared-client comment',
      canDelete: true,
    })
    expect((await client.community.comments(deal.id)).items).toHaveLength(1)
  })
  it('does not carry votes across a newly approved revision', async () => {
    const deal = await publicDeal('Synthetic revision target')
    await call('PUT', `/api/deals/${deal.id}/vote`, {
      cookie: alice.cookies,
      body: { value: 'ALIVE' },
    })
    await db.deal.update({
      where: { id: deal.id },
      data: { contentVersion: 2, reviewedVersion: 2, reviewedAt: new Date(Date.now() + 1) },
    })
    expect(
      await (
        await call('GET', `/api/deals/${deal.id}/community`, { cookie: alice.cookies })
      ).json(),
    ).toMatchObject({ alive: 0, myVote: 'ALIVE', myVoteIsRecent: false })
    const renewed = await call('PUT', `/api/deals/${deal.id}/vote`, {
      cookie: alice.cookies,
      body: { value: 'ALIVE' },
    })
    expect(renewed.status).toBe(200)
    expect(await renewed.json()).toMatchObject({ alive: 1, myVoteIsRecent: true })
  })
  it('does not expose or mutate unpublished, hidden or unreviewed revisions', async () => {
    const deal = await pendingDeal('Synthetic private deal')
    for (const path of [`/api/deals/${deal.id}/community`, `/api/deals/${deal.id}/comments`])
      expect((await call('GET', path)).status).toBe(404)
    expect(
      (
        await call('PUT', `/api/deals/${deal.id}/vote`, {
          cookie: alice.cookies,
          body: { value: 'ALIVE' },
        })
      ).status,
    ).toBe(404)
    await db.deal.update({
      where: { id: deal.id },
      data: {
        reviewStatus: 'APPROVED',
        publishedAt: new Date(),
        reviewedVersion: 1,
        contentVersion: 2,
      },
    })
    expect((await call('GET', `/api/deals/${deal.id}/community`)).status).toBe(404)
    expect(await db.dealVote.count()).toBe(0)
  })
})
