import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { copyFile, mkdir } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { parseConfig } from '@api/config'
import { createAdminModerationClient } from '@broke-oclock/api-client/admin-moderation'
import axios from 'axios'
import express from 'express'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

let db: typeof import('@broke-oclock/db').db
let mongo: MongoMemoryReplSet, server: Server, baseURL: string
let admin: { id: string; cookie: string }, member: { id: string; cookie: string }
const origin = 'http://localhost:5173'
const request = (
  path: string,
  body?: object,
  cookie = admin?.cookie,
  method = body ? 'POST' : 'GET',
) =>
  fetch(`${baseURL}/api${path}`, {
    method,
    headers: {
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
const signup = async () => {
  const r = await request(
    '/auth/sign-up/email',
    {
      name: 'Synthetic moderation operator',
      email: `${randomUUID()}@example.test`,
      password: randomBytes(24).toString('base64url'),
    },
    '',
  )
  expect(r.status).toBe(200)
  const b = await r.json()
  return {
    id: b.user.id,
    cookie: r.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; '),
  }
}
const seed = async () => {
  const deal = await db.deal.create({
    data: {
      title: 'Synthetic investigated deal',
      description: '',
      category: 'food',
      offerType: 'OTHER',
      applicability: 'NO_FIXED_LOCATION',
      reviewStatus: 'APPROVED',
      publishedAt: new Date(),
      reviewedVersion: 1,
    },
  })
  const comment = await db.comment.create({
    data: { dealId: deal.id, authorId: member.id, body: 'Original evidence' },
  })
  const report = await db.commentReport.create({
    data: {
      commentId: comment.id,
      reporterId: member.id,
      reason: 'SPAM',
      details: 'Original details',
    },
  })
  return { deal, comment, report }
}
beforeAll(async () => {
  if (
    process.env.DATABASE_URL &&
    process.env.DATABASE_URL !== 'mongodb://127.0.0.1:1/platform_admin_validation_only'
  )
    throw new Error('Refusing ambient database')
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const url = mongo.getUri(`moderation_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', url)
  vi.stubEnv('NODE_ENV', 'test')
  const root = new URL('../../../../', import.meta.url).pathname
  const scratch = resolve(tmpdir(), 'lobangers-moderation', `schema-${randomUUID()}`)
  await mkdir(scratch, { recursive: true })
  await copyFile(`${root}/packages/db/prisma/schema.prisma`, `${scratch}/schema.prisma`)
  await promisify(execFile)(
    `${root}/packages/db/node_modules/.bin/prisma`,
    ['db', 'push', '--schema', `${scratch}/schema.prisma`, '--skip-generate'],
    {
      cwd: scratch,
      env: { PATH: process.env.PATH, HOME: scratch, TMPDIR: scratch, DATABASE_URL: url },
      timeout: 60000,
    },
  )
  db = (await import('@broke-oclock/db')).db
  server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing listener')
  baseURL = `http://127.0.0.1:${address.port}`
  const config = parseConfig({
    DATABASE_URL: url,
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    BETTER_AUTH_URL: baseURL,
    WEB_ORIGIN: origin,
  })
  const { createAuth } = await import('@api/auth')
  const { toNodeHandler } = await import('@broke-oclock/auth/node')
  const auth = createAuth(config)
  const { apiErrorMiddleware } = await import('@api/errors')
  const { createCommunityRouter } = await import('@api/rest/routers/community')
  const app = express()
  app.all('/api/auth/*splat', toNodeHandler(auth))
  app.use(express.json())
  app.use('/api', createCommunityRouter({ config, auth }))
  const module = await import('@api/rest/routers/admin-moderation').catch(() => null)
  if (module) app.use('/api', module.createAdminModerationRouter({ config, auth }))
  app.use(apiErrorMiddleware)
  server.on('request', app)
  admin = await signup()
  member = await signup()
  await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
}, 180000)
afterAll(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((r) => server.close(() => r()))
  await db?.$disconnect()
  await mongo?.stop()
  vi.unstubAllEnvs()
})
it('investigates hidden/deleted/unpublished targets and resolves only one report preserving evidence and unique row', async () => {
  const { deal, comment, report } = await seed()
  const sibling = await db.commentReport.create({
    data: { commentId: comment.id, reporterId: admin.id, reason: 'OTHER' },
  })
  await db.comment.update({
    where: { id: comment.id },
    data: { hiddenAt: new Date(), deletedAt: new Date() },
  })
  await db.deal.update({
    where: { id: deal.id },
    data: { publishedAt: null, deletedAt: new Date(), reviewStatus: 'HIDDEN' },
  })
  const http = axios.create({
    baseURL: `${baseURL}/api`,
    headers: { Cookie: admin.cookie, Origin: origin },
  })
  const client = createAdminModerationClient(http)
  const response = await request(`/admin/moderation/reports/COMMENT/${report.id}`)
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(await response.json()).toMatchObject({
    moderationVersion: 0,
    targetType: 'COMMENT',
    reporter: { id: member.id },
    comment: { id: comment.id, state: 'AUTHOR_DELETED' },
    deal: { id: deal.id, reviewStatus: 'HIDDEN' },
  })
  const result = await client.resolve('COMMENT', report.id, {
    expectedVersion: 0,
    decision: 'RESOLVED',
    resolution: '  Investigated only  ',
    confirmed: true,
  })
  expect(result).toMatchObject({
    status: 'RESOLVED',
    moderationVersion: 1,
    resolution: 'Investigated only',
    details: 'Original details',
  })
  expect((await db.commentReport.findUniqueOrThrow({ where: { id: sibling.id } })).status).toBe(
    'OPEN',
  )
  expect(
    (await db.comment.findUniqueOrThrow({ where: { id: comment.id } })).deletedAt,
  ).not.toBeNull()
  expect(await db.platformAudit.findFirst({ where: { subjectId: report.id } })).toMatchObject({
    action: 'COMMENT_REPORT_RESOLVED',
    actorId: admin.id,
    note: 'Investigated only',
  })
  expect(
    (
      await request(`/admin/moderation/reports/COMMENT/${report.id}/resolve`, {
        expectedVersion: 1,
        decision: 'DISMISSED',
        resolution: 'Again',
        confirmed: true,
      })
    ).status,
  ).toBe(409)
  expect(
    await db.commentReport.count({ where: { commentId: comment.id, reporterId: member.id } }),
  ).toBe(1)
})

it('hides/restores comments separately, conflicts on stale versions, never resurrects author deletion or resolves reports', async () => {
  const { deal, comment, report } = await seed()
  const path = `/admin/moderation/comments/${comment.id}`
  const before = deal.updatedAt
  const hidden = await request(`${path}/visibility`, {
    expectedVersion: 0,
    visibility: 'HIDDEN',
    note: '  Spam content  ',
    confirmed: true,
  })
  expect(hidden.status).toBe(200)
  expect(await hidden.json()).toMatchObject({
    state: 'HIDDEN',
    moderationVersion: 1,
    deletedAt: null,
  })
  expect(
    (await db.deal.findUniqueOrThrow({ where: { id: deal.id } })).updatedAt.getTime(),
  ).toBeGreaterThan(before.getTime())
  expect((await db.commentReport.findUniqueOrThrow({ where: { id: report.id } })).status).toBe(
    'OPEN',
  )
  expect(await (await request(`/deals/${deal.id}/comments`, undefined, '')).json()).toMatchObject({
    items: [],
  })
  expect(
    (
      await request(`${path}/visibility`, {
        expectedVersion: 0,
        visibility: 'VISIBLE',
        note: 'stale',
        confirmed: true,
      })
    ).status,
  ).toBe(409)
  expect(
    (
      await request(`${path}/visibility`, {
        expectedVersion: 1,
        visibility: 'VISIBLE',
        note: 'Restore',
        confirmed: true,
      })
    ).status,
  ).toBe(200)
  await db.comment.update({
    where: { id: comment.id },
    data: { deletedAt: new Date(), moderationVersion: 3 },
  })
  expect(
    (
      await request(`${path}/visibility`, {
        expectedVersion: 3,
        visibility: 'VISIBLE',
        note: 'Never resurrect',
        confirmed: true,
      })
    ).status,
  ).toBe(409)
  expect(await (await request(path)).json()).toMatchObject({
    state: 'AUTHOR_DELETED',
    moderationVersion: 3,
  })
  expect(
    (await request(`/admin/moderation/comments?state=AUTHOR_DELETED&dealId=${deal.id}`)).status,
  ).toBe(200)
  expect(await db.platformAudit.count({ where: { subjectId: comment.id } })).toBe(2)
})

it('pages separate scoped report collections with strict filters and native current ADMIN admission', async () => {
  const { deal, comment } = await seed()
  await db.deal.update({ where: { id: deal.id }, data: { applicability: 'ALL_MERCHANT_OUTLETS' } })
  const first = await db.dealReport.create({
    data: { dealId: deal.id, reporterId: member.id, reason: 'MISLEADING' },
  })
  await db.dealReport.create({ data: { dealId: deal.id, reporterId: admin.id, reason: 'OTHER' } })
  const path = `/admin/moderation/reports?targetType=DEAL&dealId=${deal.id}&limit=1`
  const response = await request(path)
  expect(response.status).toBe(200)
  const one = await response.json()
  expect(one.items).toHaveLength(1)
  expect(one.items[0]).toMatchObject({
    targetType: 'DEAL',
    deal: { applicability: 'ALL_MERCHANT_OUTLETS' },
  })
  expect(one.nextCursor).toBe(one.items[0].id)
  const two = await (await request(`${path}&cursor=${one.nextCursor}`)).json()
  expect(two.items[0].id).toBe(first.id)
  expect(two.nextCursor).toBeNull()
  const filtered = await (
    await request(`/admin/moderation/reports?targetType=COMMENT&dealId=${deal.id}&reason=SPAM`)
  ).json()
  expect(filtered.items).toHaveLength(1)
  expect(filtered.items[0].targetId).toBe(comment.id)
  for (const query of [
    '',
    '?targetType=DEAL&limit=1e2',
    '?targetType=DEAL&cursor=bogus',
    '?targetType=DEAL&unexpected=true',
  ])
    expect((await request(`/admin/moderation/reports${query}`)).status).toBe(400)
  expect((await request(path, undefined, '')).status).toBe(401)
  expect((await request(path, undefined, member.cookie)).status).toBe(403)
  await db.user.update({ where: { id: admin.id }, data: { role: 'MODERATOR' } })
  expect((await request(path)).status).toBe(403)
  await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
  const detail = await (await request(`/admin/moderation/reports/DEAL/${first.id}`)).json()
  expect(Object.keys(detail.reporter).sort()).toEqual(['id', 'name'])
  expect(JSON.stringify(detail)).not.toMatch(/password|token|email|sessionId/)
})
it('serializes hide versus author delete and rolls back CAS and parent touches if audit persistence fails', async () => {
  const { deal, comment } = await seed()
  const outcomes = await Promise.all([
    request(`/admin/moderation/comments/${comment.id}/visibility`, {
      expectedVersion: 0,
      visibility: 'HIDDEN',
      note: 'Race review',
      confirmed: true,
    }),
    request(`/comments/${comment.id}`, undefined, member.cookie, 'DELETE'),
  ])
  expect(outcomes.filter((r) => r.status === 200)).toHaveLength(1)
  expect(outcomes.every((r) => [200, 404, 409].includes(r.status))).toBe(true)
  const other = await seed()
  const before = await db.deal.findUniqueOrThrow({ where: { id: other.deal.id } })
  const session = await db.session.findFirstOrThrow({ where: { userId: admin.id } })
  const extended = db.$extends({
    query: {
      platformAudit: {
        create() {
          throw new Error('Synthetic audit storage failure')
        },
      },
    },
  })
  const { setModerationVisibility } = await import('@api/modules/community/moderation-writes')
  await expect(
    setModerationVisibility(
      extended as unknown as typeof db,
      { userId: admin.id, sessionId: session.id },
      other.comment.id,
      { expectedVersion: 0, visibility: 'HIDDEN', note: 'Fault boundary', confirmed: true },
    ),
  ).rejects.toThrow('Synthetic audit storage failure')
  expect(await db.comment.findUniqueOrThrow({ where: { id: other.comment.id } })).toMatchObject({
    hiddenAt: null,
    moderationVersion: null,
  })
  expect((await db.deal.findUniqueOrThrow({ where: { id: other.deal.id } })).updatedAt).toEqual(
    before.updatedAt,
  )
  expect(await db.platformAudit.count({ where: { subjectId: other.comment.id } })).toBe(0)
  expect(await db.dealVote.count({ where: { dealId: deal.id } })).toBe(0)
})

it('dismisses deal reports without unpublishing and rolls back a failed audit insert', async () => {
  const { deal, comment } = await seed()
  const report = await db.dealReport.create({
    data: {
      dealId: deal.id,
      reporterId: member.id,
      reason: 'OTHER',
      details: 'Immutable original',
    },
  })
  const path = `/admin/moderation/reports/DEAL/${report.id}/resolve`
  for (const body of [
    { expectedVersion: 0, decision: 'DISMISSED', resolution: ' ', confirmed: true },
    { expectedVersion: 0, decision: 'DISMISSED', resolution: 'Review', confirmed: false },
  ])
    expect((await request(path, body)).status).toBe(400)
  const session = await db.session.findFirstOrThrow({ where: { userId: admin.id } })
  const extended = db.$extends({
    query: {
      platformAudit: {
        create() {
          throw new Error('Synthetic audit unavailable')
        },
      },
    },
  })
  const { resolveModerationReport } = await import('@api/modules/community/moderation-writes')
  const input = {
    expectedVersion: 0,
    decision: 'DISMISSED' as const,
    resolution: 'Evidence checked',
    confirmed: true as const,
  }
  await expect(
    resolveModerationReport(
      extended as unknown as typeof db,
      { userId: admin.id, sessionId: session.id },
      'DEAL',
      report.id,
      input,
    ),
  ).rejects.toThrow('Synthetic audit unavailable')
  expect(await db.dealReport.findUniqueOrThrow({ where: { id: report.id } })).toMatchObject({
    status: 'OPEN',
    moderationVersion: null,
    details: 'Immutable original',
    resolution: null,
  })
  expect((await request(path, input)).status).toBe(200)
  expect(await db.deal.findUniqueOrThrow({ where: { id: deal.id } })).toMatchObject({
    publishedAt: deal.publishedAt,
    reviewStatus: 'APPROVED',
  })
  expect((await db.comment.findUniqueOrThrow({ where: { id: comment.id } })).hiddenAt).toBeNull()
  expect(await db.dealReport.count({ where: { dealId: deal.id, reporterId: member.id } })).toBe(1)
})

const moderationSnapshot = async () => {
  const orderBy = { id: 'asc' as const }
  const [users, sessions, fences, audits, deals, comments, dealReports, commentReports, votes] =
    await Promise.all([
      db.user.findMany({ orderBy }),
      db.session.findMany({ orderBy }),
      db.platformAccessFence.findMany({ orderBy }),
      db.platformAudit.findMany({ orderBy }),
      db.deal.findMany({ orderBy }),
      db.comment.findMany({ orderBy }),
      db.dealReport.findMany({ orderBy }),
      db.commentReport.findMany({ orderBy }),
      db.dealVote.findMany({ orderBy }),
    ])
  return { users, sessions, fences, audits, deals, comments, dealReports, commentReports, votes }
}
const moderationReadPaths = async () => {
  const { deal, comment, report } = await seed()
  const dealReport = await db.dealReport.create({
    data: { dealId: deal.id, reporterId: member.id, reason: 'OTHER' },
  })
  return [
    `/admin/moderation/reports?targetType=COMMENT&dealId=${deal.id}`,
    `/admin/moderation/reports?targetType=DEAL&dealId=${deal.id}`,
    `/admin/moderation/reports/COMMENT/${report.id}`,
    `/admin/moderation/reports/DEAL/${dealReport.id}`,
    `/admin/moderation/comments?state=VISIBLE&dealId=${deal.id}`,
    `/admin/moderation/comments/${comment.id}`,
  ]
}
it.each(['GET', 'HEAD'])(
  '%s moderation reads preserve every persisted security and domain row',
  async (method) => {
    const operator = admin
    await db.user.update({
      where: { id: operator.id },
      data: { role: 'ADMIN', updatedAt: new Date('2020-01-01T00:00:00Z') },
    })
    // An old refresh timestamp exercises the actual native auth read configuration.
    await db.session.updateMany({
      where: { userId: operator.id },
      data: { updatedAt: new Date('2020-01-01T00:00:00Z') },
    })
    await db.platformAccessFence.upsert({
      where: { id: 'platform-access' },
      create: { id: 'platform-access', version: 7 },
      update: {},
    })
    const paths = await moderationReadPaths()
    for (const path of paths) {
      const before = await moderationSnapshot()
      const response = await request(path, undefined, operator.cookie, method)
      expect(response.status, `${method} ${path}`).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(response.headers.get('set-cookie')).toBeNull()
      if (method === 'HEAD') expect(await response.text()).toBe('')
      else await response.json()
      expect.soft(await moderationSnapshot(), `${method} ${path}`).toEqual(before)
    }
  },
)
it('keeps moderation method, origin and error policy on the registered operation paths', async () => {
  const paths = await moderationReadPaths()
  const report = await db.commentReport.findFirstOrThrow()
  const comment = await db.comment.findFirstOrThrow()
  const writes = [
    {
      path: `/admin/moderation/reports/COMMENT/${report.id}/resolve`,
      body: { expectedVersion: 0, decision: 'RESOLVED', resolution: 'Review', confirmed: true },
    },
    {
      path: `/admin/moderation/comments/${comment.id}/visibility`,
      body: { expectedVersion: 0, visibility: 'HIDDEN', note: 'Review', confirmed: true },
    },
  ]
  const before = await moderationSnapshot()
  for (const path of paths) {
    const response = await request(path, undefined, admin.cookie, 'DELETE')
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET')
    expect(response.headers.get('cache-control')).toBe('no-store')
  }
  for (const { path, body } of writes) {
    for (const method of ['GET', 'HEAD']) {
      const response = await request(path, undefined, admin.cookie, method)
      expect(response.status).toBe(405)
      expect(response.headers.get('allow')).toBe('POST')
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
    for (const rejectedOrigin of [undefined, 'https://untrusted.example.test']) {
      const response = await fetch(`${baseURL}/api${path}`, {
        method: 'POST',
        headers: {
          Cookie: admin.cookie,
          'Content-Type': 'application/json',
          ...(rejectedOrigin ? { Origin: rejectedOrigin } : {}),
        },
        body: JSON.stringify(body),
      })
      expect(response.status).toBe(403)
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
  }
  expect(await moderationSnapshot()).toEqual(before)
})
it('denies anonymous, nonadmin and suspended GET/HEAD reads without persisted side effects', async () => {
  const operator = admin
  const paths = await moderationReadPaths()
  for (const state of ['anonymous', 'USER', 'MERCHANT', 'MODERATOR', 'suspended'] as const) {
    await db.user.update({
      where: { id: operator.id },
      data: {
        role: state === 'suspended' || state === 'anonymous' ? 'ADMIN' : state,
        suspendedAt: state === 'suspended' ? new Date() : null,
      },
    })
    const before = await moderationSnapshot()
    for (const method of ['GET', 'HEAD']) {
      for (const path of paths) {
        const response = await request(
          path,
          undefined,
          state === 'anonymous' ? '' : operator.cookie,
          method,
        )
        expect(response.status, `${state} ${method} ${path}`).toBe(
          state === 'anonymous' || state === 'suspended' ? 401 : 403,
        )
        expect(response.headers.get('cache-control')).toBe('no-store')
        if (method === 'HEAD') expect(await response.text()).toBe('')
        else await response.json()
      }
    }
    expect(await moderationSnapshot(), state).toEqual(before)
  }
})
