import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { copyFile, mkdir } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import express from 'express'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const scratch = resolve(tmpdir(), 'lobangers-admin-adoption')
const origin = 'http://localhost:5173'
let mongo: MongoMemoryReplSet
let server: Server
let db: typeof import('@broke-oclock/db').db
let base = ''
let admin: { id: string; cookie: string }
let member: { id: string; cookie: string }
const signup = async () => {
  const response = await fetch(`${base}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Synthetic deals operator',
      email: `${randomUUID()}@example.test`,
      password: randomBytes(24).toString('base64url'),
    }),
  })
  expect(response.status).toBe(200)
  const body = await response.json()
  return {
    id: String(body.user.id),
    cookie: response.headers
      .getSetCookie()
      .map((v) => v.split(';')[0])
      .join('; '),
  }
}
const req = (
  path = '',
  method = 'GET',
  body?: unknown,
  cookie = admin.cookie,
  requestOrigin = origin,
) =>
  fetch(`${base}/api/admin/deals${path}`, {
    method,
    headers: { Cookie: cookie, Origin: requestOrigin, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
const fixture = (extra: Record<string, unknown> = {}) =>
  db.deal.create({
    data: {
      title: 'Synthetic meal',
      description: 'Full safe copy',
      category: 'FOOD',
      offerType: 'OTHER',
      applicability: 'ONLINE',
      submittedById: member.id,
      ...extra,
    },
  })
beforeAll(async () => {
  if (
    process.env.DATABASE_URL &&
    process.env.DATABASE_URL !== 'mongodb://127.0.0.1:1/platform_admin_validation_only'
  )
    throw new Error('Refusing ambient database URL')
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const url = mongo.getUri(`legacy_adoption_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', url)
  vi.stubEnv('NODE_ENV', 'test')
  const dir = `${scratch}/schema-${randomUUID()}`
  await mkdir(dir, { recursive: true })
  await copyFile(`${root}/packages/db/prisma/schema.prisma`, `${dir}/schema.prisma`)
  await promisify(execFile)(
    `${root}/packages/db/node_modules/.bin/prisma`,
    ['db', 'push', '--schema', `${dir}/schema.prisma`, '--skip-generate'],
    {
      cwd: dir,
      env: { PATH: process.env.PATH, HOME: dir, TMPDIR: dir, DATABASE_URL: url },
      timeout: 60_000,
    },
  )
  db = (await import('@broke-oclock/db')).db
  const { parseConfig } = await import('@api/config')
  const { createAuth } = await import('@api/auth')
  const { toNodeHandler } = await import('@broke-oclock/auth/node')
  const { apiErrorMiddleware } = await import('@api/errors')
  const { requireBoundedRestQuery } = await import('@api/rest/query')
  const { requireJsonRequestBody } = await import('@api/rest/body')
  server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No listener')
  base = `http://127.0.0.1:${address.port}`
  const config = parseConfig({
    DATABASE_URL: url,
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    BETTER_AUTH_URL: base,
    WEB_ORIGIN: origin,
  })
  const auth = createAuth(config)
  const app = express()
  app.all('/api/auth/*splat', toNodeHandler(auth))
  app.use(requireBoundedRestQuery)
  app.use(requireJsonRequestBody)
  app.use(express.json())
  // Before the feature exists, absence becomes an HTTP 404, not an import/harness error.
  const module = await import('@api/rest/routers/admin-deals/index').catch(() => null)
  app.use(
    '/api/admin/deals',
    module ? module.createAdminDealsRouter({ config, auth }) : express.Router(),
  )
  const { createIngestionRouter } = await import('@api/rest/routers/ingestion/index')
  app.use('/api/ingestion', createIngestionRouter({ config, auth }))
  const { createCommunityRouter } = await import('@api/rest/routers/community/index')
  app.use('/api', createCommunityRouter({ config, auth }))
  const { createAdminModerationRouter } = await import('@api/rest/routers/admin-moderation/index')
  app.use('/api', createAdminModerationRouter({ config, auth }))
  app.use((_req, res) =>
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } }),
  )
  app.use(apiErrorMiddleware)
  server.on('request', app)
  admin = await signup()
  member = await signup()
  await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
}, 180_000)
afterAll(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
  await db?.$disconnect()
  await mongo?.stop()
  vi.unstubAllEnvs()
})

const old = (id: string, suffix: string, body: unknown, method = 'PATCH') =>
  fetch(`${base}/api/ingestion/drafts/${id}/${suffix}`, {
    method,
    headers: { Cookie: admin.cookie, Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
const imported = async () => {
  const source = await db.importSource.upsert({
    where: { provider_externalId: { provider: 'WORDPRESS', externalId: 'moneydigest.sg' } },
    create: {
      name: 'Synthetic adoption source',
      provider: 'WORDPRESS',
      externalId: 'moneydigest.sg',
      url: 'https://www.moneydigest.sg/',
      enabled: true,
    },
    update: {},
  })
  const post = await db.importedPost.create({
    data: {
      sourceId: source.id,
      externalId: randomUUID(),
      url: 'https://www.moneydigest.sg/synthetic-adoption/',
      rawContent: 'Immutable synthetic source',
      contentHash: 'a'.repeat(64),
      processedContentHash: 'a'.repeat(64),
      status: 'NEEDS_REVIEW',
    },
  })
  const deal = await fixture({
    origin: 'IMPORTED',
    applicability: 'NO_FIXED_LOCATION',
    validFrom: new Date('2026-01-01'),
    validUntil: new Date('2099-01-01'),
    sources: {
      create: {
        importedPostId: post.id,
        sourceUrl: post.url,
        sourceContentHash: post.contentHash,
        sourceContentSnapshot: post.rawContent,
      },
    },
  })
  return { deal, post, source }
}
const stored = (id: string) => db.deal.findUniqueOrThrow({ where: { id } })
const envelope = {
  expectedContentVersion: 1,
  expectedOperationVersion: 0,
  note: 'Synthetic explicit reason',
}
it('adopts legacy-zero category writes through the real typed client and requires explicit subsequent operation claims', async () => {
  const { createApiClient } = await import('@broke-oclock/api-client')
  const client = createApiClient(`${base}/api`)
  client.http.defaults.headers.common.Cookie = admin.cookie
  client.http.defaults.headers.common.Origin = origin
  const f = await imported()
  const citations = await db.dealSource.findMany({ where: { dealId: f.deal.id } })
  const result = await client.ingestion.setDraftCategory(f.deal.id, {
    expectedContentVersion: 1,
    category: 'DRINKS',
  })
  expect(result).toMatchObject({ contentVersion: 2, operationVersion: 1 })
  expect(await stored(f.deal.id)).toMatchObject({
    contentVersion: 2,
    operationVersion: 1,
    reviewStatus: 'PENDING',
    reviewedVersion: null,
    publishedAt: null,
  })
  expect(
    (await old(f.deal.id, 'category', { expectedContentVersion: 2, category: 'FOOD' })).status,
  ).toBe(409)
  expect(
    (
      await old(f.deal.id, 'category', {
        expectedContentVersion: 2,
        expectedOperationVersion: 9,
        category: 'FOOD',
      })
    ).status,
  ).toBe(409)
  expect(
    await client.ingestion.setDraftCategory(f.deal.id, {
      expectedContentVersion: 2,
      expectedOperationVersion: 1,
      category: 'FOOD',
    }),
  ).toMatchObject({ contentVersion: 3, operationVersion: 2 })
  const queue = await client.ingestion.drafts({ limit: 50 })
  expect(queue.items.find((row) => row.id === f.deal.id)).toMatchObject({
    contentVersion: 3,
    operationVersion: 2,
  })
  expect(await db.dealSource.findMany({ where: { dealId: f.deal.id } })).toEqual(citations)
  const { updatedAt: _postTouch, ...postFacts } = await db.importedPost.findUniqueOrThrow({
    where: { id: f.post.id },
  })
  const { updatedAt: _originalPostTouch, ...originalPostFacts } = f.post
  expect(postFacts).toEqual(originalPostFacts)
  const { updatedAt: _sourceTouch, ...sourceFacts } = await db.importSource.findUniqueOrThrow({
    where: { id: f.source.id },
  })
  const { updatedAt: _originalSourceTouch, ...originalSourceFacts } = f.source
  expect(sourceFacts).toEqual(originalSourceFacts)
  const audits = await db.platformAudit.findMany({
    where: { subjectId: f.deal.id },
    orderBy: { createdAt: 'asc' },
  })
  expect(audits).toHaveLength(2)
  expect(audits[0]).toMatchObject({
    actorId: admin.id,
    action: 'DEAL_UPDATED',
    note: 'Correct imported draft category',
    detailsJson: {
      operationVersionBefore: 0,
      operationVersionAfter: 1,
      contentVersionBefore: 1,
      contentVersionAfter: 2,
      changedFields: ['category'],
    },
  })
})
it('adopts legacy-zero outlet writes without bypassing physical evidence and interleaves with new edits', async () => {
  const { geographySubjectHash, occupancySubjectHash } = await import(
    '@api/modules/deals/outlet-eligibility'
  )
  const f = await imported()
  const merchant = await db.merchant.create({ data: { name: 'Synthetic adoption merchant' } })
  const venue = await db.venue.create({
    data: {
      merchantId: merchant.id,
      name: 'Synthetic outlet',
      address: 'Synthetic address',
      latitude: 1.3,
      longitude: 103.8,
      geographyPrecision: 'OUTLET',
    },
  })
  expect(
    (await old(f.deal.id, 'outlet', { expectedContentVersion: 1, venueId: venue.id })).status,
  ).toBe(412)
  await db.venue.update({
    where: { id: venue.id },
    data: {
      geographyEvidence: {
        state: 'VERIFIED',
        provider: 'ADMIN',
        subjectHash: geographySubjectHash(venue),
        reference: 'Synthetic geography',
        verifiedAt: new Date(),
      },
      occupancyEvidence: {
        state: 'VERIFIED',
        provider: 'ADMIN',
        subjectHash: occupancySubjectHash(venue),
        reference: 'Synthetic occupancy',
        verifiedAt: new Date(),
      },
    },
  })
  const before = await db.dealSource.findMany({ where: { dealId: f.deal.id } })
  const associated = await old(f.deal.id, 'outlet', {
    expectedContentVersion: 1,
    venueId: venue.id,
  })
  expect(associated.status).toBe(200)
  expect(await associated.json()).toMatchObject({
    contentVersion: 2,
    operationVersion: 1,
    applicability: 'SELECTED_OUTLETS',
  })
  for (const claim of [{}, { expectedOperationVersion: 0 }, { expectedOperationVersion: 9 }]) {
    expect(
      (await old(f.deal.id, 'outlet', { expectedContentVersion: 2, ...claim, venueId: venue.id }))
        .status,
    ).toBe(409)
  }
  expect(await db.platformAudit.findFirst({ where: { subjectId: f.deal.id } })).toMatchObject({
    actorId: admin.id,
    action: 'DEAL_OUTLETS_CHANGED',
    detailsJson: { operationVersionBefore: 0, operationVersionAfter: 1, contentVersionAfter: 2 },
  })
  expect(
    (await old(f.deal.id, 'category', { expectedContentVersion: 2, category: 'DRINKS' })).status,
  ).toBe(409)
  expect(
    (
      await req(`/${f.deal.id}/content`, 'PATCH', {
        ...envelope,
        changes: { title: 'Stale new edit' },
      })
    ).status,
  ).toBe(409)
  expect(
    (
      await req(`/${f.deal.id}/content`, 'PATCH', {
        ...envelope,
        expectedContentVersion: 2,
        expectedOperationVersion: 1,
        changes: { title: 'New correction' },
      })
    ).status,
  ).toBe(200)
  expect(
    (
      await old(f.deal.id, 'category', {
        expectedContentVersion: 3,
        expectedOperationVersion: 1,
        category: 'DRINKS',
      })
    ).status,
  ).toBe(409)
  expect(
    (
      await old(f.deal.id, 'category', {
        expectedContentVersion: 3,
        expectedOperationVersion: 2,
        category: 'DRINKS',
      })
    ).status,
  ).toBe(200)
  expect(await db.dealSource.findMany({ where: { dealId: f.deal.id } })).toEqual(before)
})
it('records the full 1000-character legacy review reason, advances operation only and rejects hide/reopen ABA', async () => {
  const f = await imported()
  // A legacy omitted claim can act exactly once at zero; review never edits content.
  const note = 'R'.repeat(1000)
  const initial = await old(
    f.deal.id,
    'review',
    { expectedContentVersion: 1, decision: 'APPROVE', note },
    'POST',
  )
  expect(initial.status).toBe(200)
  expect(await initial.json()).toEqual({
    id: f.deal.id,
    reviewStatus: 'APPROVED',
    operationVersion: 1,
  })
  expect(await stored(f.deal.id)).toMatchObject({
    contentVersion: 1,
    operationVersion: 1,
    reviewNote: note,
    publishedAt: null,
  })
  expect(await db.platformAudit.findFirst({ where: { subjectId: f.deal.id } })).toMatchObject({
    actorId: admin.id,
    note,
    action: 'DEAL_APPROVED',
    detailsJson: {
      operationVersionBefore: 0,
      operationVersionAfter: 1,
      contentVersionBefore: 1,
      contentVersionAfter: 1,
    },
  })
  // The shared common/new form contract remains 500, not the legacy review contract.
  expect(
    (
      await req(`/${f.deal.id}/reopen`, 'POST', {
        ...envelope,
        expectedOperationVersion: 1,
        note: 'N'.repeat(501),
      })
    ).status,
  ).toBe(400)
  expect(
    (await req(`/${f.deal.id}/unpublish`, 'POST', { ...envelope, expectedOperationVersion: 1 }))
      .status,
  ).toBe(200)
  expect(
    (
      await old(
        f.deal.id,
        'review',
        { expectedContentVersion: 1, expectedOperationVersion: 2, decision: 'APPROVE', note },
        'POST',
      )
    ).status,
  ).toBe(409)
  expect(
    (await req(`/${f.deal.id}/reopen`, 'POST', { ...envelope, expectedOperationVersion: 2 }))
      .status,
  ).toBe(200)
  for (const claim of [{}, { expectedOperationVersion: 0 }, { expectedOperationVersion: 2 }]) {
    expect(
      (
        await old(
          f.deal.id,
          'review',
          { expectedContentVersion: 1, ...claim, decision: 'APPROVE', note },
          'POST',
        )
      ).status,
    ).toBe(409)
  }
  expect(
    (
      await old(
        f.deal.id,
        'review',
        { expectedContentVersion: 1, expectedOperationVersion: 3, decision: 'REJECT', note },
        'POST',
      )
    ).status,
  ).toBe(200)
  expect(await stored(f.deal.id)).toMatchObject({
    contentVersion: 1,
    operationVersion: 4,
    reviewStatus: 'REJECTED',
    publishedAt: null,
  })
  expect(await db.platformAudit.count({ where: { subjectId: f.deal.id } })).toBe(4)
})
it('author deletion advances legacy/null/current moderation versions and invalidates administrator evidence', async () => {
  const deal = await fixture({
    reviewStatus: 'APPROVED',
    reviewedVersion: 1,
    publishedAt: new Date(),
    applicability: 'NO_FIXED_LOCATION',
  })
  for (const version of [undefined, null, 7]) {
    const comment = await db.comment.create({
      data: {
        dealId: deal.id,
        authorId: member.id,
        body: 'Synthetic author observation',
        ...(version === undefined ? {} : { moderationVersion: version }),
      },
    })
    const response = await fetch(`${base}/api/comments/${comment.id}`, {
      method: 'DELETE',
      headers: { Cookie: member.cookie, Origin: origin },
    })
    expect(response.status).toBe(200)
    expect(await db.comment.findUniqueOrThrow({ where: { id: comment.id } })).toMatchObject({
      moderationVersion: (version ?? 0) + 1,
      deletedAt: expect.any(Date),
      hiddenAt: null,
    })
    const stale = await fetch(`${base}/api/admin/moderation/comments/${comment.id}/visibility`, {
      method: 'POST',
      headers: { Cookie: admin.cookie, Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedVersion: version ?? 0,
        visibility: 'HIDDEN',
        note: 'Stale moderation',
        confirmed: true,
      }),
    })
    expect(stale.status).toBe(409)
  }
})
it.each(['copy', 'category'] as const)(
  'material %s tool advances operationVersion in its existing atomic content transaction',
  async (tool) => {
    const { rewriteDealCopy } = await import('@api/tools/rewrite-deal-copy')
    const { reclassifyCategories } = await import('@api/tools/reclassify-categories')
    const f = await imported()
    await db.deal.update({
      where: { id: f.deal.id },
      data: { title: 'Synthetic coffee drink', operationVersion: null, category: 'FOOD' },
    })
    const run = () =>
      tool === 'copy'
        ? rewriteDealCopy(
            db,
            [
              {
                id: f.deal.id,
                field: 'title',
                from: 'Synthetic coffee drink',
                to: 'Fresh synthetic coffee',
              },
            ],
            { apply: true },
          )
        : reclassifyCategories(db, true)
    await run()
    expect(await stored(f.deal.id)).toMatchObject({
      contentVersion: 2,
      operationVersion: 1,
      reviewStatus: 'PENDING',
      publishedAt: null,
    })
  },
)
it('rolls back legacy category, evidence fences, actor/session touches when audit append fails', async () => {
  const { setDraftCategory } = await import('@api/modules/ingestion/set-category')
  const session = await db.session.findFirstOrThrow({ where: { userId: admin.id } })
  const f = await imported()
  const before = await Promise.all([
    stored(f.deal.id),
    db.importedPost.findUnique({ where: { id: f.post.id } }),
    db.importSource.findUnique({ where: { id: f.source.id } }),
    db.user.findUnique({ where: { id: admin.id } }),
    db.session.findUnique({ where: { id: session.id } }),
  ])
  const failingDb = db.$extends({
    query: {
      platformAudit: {
        create() {
          throw new Error('Synthetic audit append failure')
        },
      },
    },
  })
  await expect(
    setDraftCategory(
      failingDb as typeof db,
      { userId: admin.id, sessionId: session.id },
      f.deal.id,
      { expectedContentVersion: 1, category: 'DRINKS' },
      new Date(),
    ),
  ).rejects.toThrow('Synthetic audit append failure')
  expect(
    await Promise.all([
      stored(f.deal.id),
      db.importedPost.findUnique({ where: { id: f.post.id } }),
      db.importSource.findUnique({ where: { id: f.source.id } }),
      db.user.findUnique({ where: { id: admin.id } }),
      db.session.findUnique({ where: { id: session.id } }),
    ]),
  ).toEqual(before)
  expect(await db.platformAudit.count({ where: { subjectId: f.deal.id } })).toBe(0)
})
it('allows exactly one old/new concurrent writer and never implicitly reopens hidden/rejected/deleted records', async () => {
  const f = await imported()
  const results = await Promise.all([
    old(
      f.deal.id,
      'review',
      { expectedContentVersion: 1, decision: 'REJECT', note: 'Concurrent legacy review' },
      'POST',
    ),
    req(`/${f.deal.id}/content`, 'PATCH', {
      ...envelope,
      changes: { title: 'Concurrent new correction' },
    }),
  ])
  expect(results.map((r) => r.status).sort()).toEqual([200, 409])
  expect(await db.platformAudit.count({ where: { subjectId: f.deal.id } })).toBe(1)
  for (const reviewStatus of ['HIDDEN', 'REJECTED'] as const) {
    const blocked = await imported()
    await db.deal.update({ where: { id: blocked.deal.id }, data: { reviewStatus } })
    expect(
      (await old(blocked.deal.id, 'category', { expectedContentVersion: 1, category: 'DRINKS' }))
        .status,
    ).toBe(409)
    expect(
      (
        await old(
          blocked.deal.id,
          'review',
          { expectedContentVersion: 1, decision: 'APPROVE', note: 'No implicit reopen' },
          'POST',
        )
      ).status,
    ).toBe(409)
    expect(await db.platformAudit.count({ where: { subjectId: blocked.deal.id } })).toBe(0)
  }
  const deleted = await imported()
  await db.deal.update({ where: { id: deleted.deal.id }, data: { deletedAt: new Date() } })
  expect(
    (
      await old(
        deleted.deal.id,
        'review',
        { expectedContentVersion: 1, decision: 'APPROVE', note: 'No deleted publication' },
        'POST',
      )
    ).status,
  ).toBe(404)
  for (const expectedOperationVersion of [-1, 0.5, 2147483647, null, '0']) {
    expect(
      (
        await old(f.deal.id, 'category', {
          expectedContentVersion: 1,
          expectedOperationVersion,
          category: 'DRINKS',
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await old(f.deal.id, 'outlet', {
          expectedContentVersion: 1,
          expectedOperationVersion,
          venueId: member.id,
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await old(
          f.deal.id,
          'review',
          {
            expectedContentVersion: 1,
            expectedOperationVersion,
            decision: 'REJECT',
            note: 'Bad operation claim',
          },
          'POST',
        )
      ).status,
    ).toBe(400)
  }
})
it.each(['category', 'outlet', 'review'] as const)(
  'legacy %s HTTP rolls back the action, fences and audit together on append failure',
  async (operation) => {
    const { geographySubjectHash, occupancySubjectHash } = await import(
      '@api/modules/deals/outlet-eligibility'
    )
    const f = await imported()
    const merchant = await db.merchant.create({ data: { name: 'Synthetic rollback merchant' } })
    const venue = await db.venue.create({
      data: {
        merchantId: merchant.id,
        name: 'Synthetic rollback outlet',
        address: 'Synthetic address',
        latitude: 1.3,
        longitude: 103.8,
        geographyPrecision: 'OUTLET',
      },
    })
    await db.venue.update({
      where: { id: venue.id },
      data: {
        geographyEvidence: {
          state: 'VERIFIED',
          provider: 'ADMIN',
          subjectHash: geographySubjectHash(venue),
          reference: 'Synthetic geography',
          verifiedAt: new Date(),
        },
        occupancyEvidence: {
          state: 'VERIFIED',
          provider: 'ADMIN',
          subjectHash: occupancySubjectHash(venue),
          reference: 'Synthetic occupancy',
          verifiedAt: new Date(),
        },
      },
    })
    const session = await db.session.findFirstOrThrow({ where: { userId: admin.id } })
    const snapshot = () =>
      Promise.all([
        stored(f.deal.id),
        db.dealVenue.findMany({ where: { dealId: f.deal.id } }),
        db.dealSource.findMany({ where: { dealId: f.deal.id } }),
        db.importedPost.findUnique({ where: { id: f.post.id } }),
        db.importSource.findUnique({ where: { id: f.source.id } }),
        db.merchant.findUnique({ where: { id: merchant.id } }),
        db.venue.findUnique({ where: { id: venue.id } }),
        db.user.findUnique({ where: { id: admin.id } }),
        db.session.findUnique({ where: { id: session.id } }),
        db.platformAudit.findMany({ where: { subjectId: f.deal.id } }),
      ])
    const before = await snapshot()
    const transact = db.$transaction.bind(db)
    const spy = vi.spyOn(db, '$transaction').mockImplementation((work, options) =>
      transact(
        async (tx) =>
          work(
            new Proxy(tx, {
              get(target, property, receiver) {
                if (property !== 'platformAudit') return Reflect.get(target, property, receiver)
                return new Proxy(target.platformAudit, {
                  get(delegate, method, receiver) {
                    if (method !== 'create') return Reflect.get(delegate, method, receiver)
                    return async () => {
                      throw new Error('Synthetic audit append failure')
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
      const body =
        operation === 'category'
          ? { expectedContentVersion: 1, category: 'DRINKS' }
          : operation === 'outlet'
            ? { expectedContentVersion: 1, venueId: venue.id }
            : { expectedContentVersion: 1, decision: 'APPROVE', note: 'Full legacy review reason' }
      expect(
        (await old(f.deal.id, operation, body, operation === 'review' ? 'POST' : 'PATCH')).status,
      ).toBe(500)
    } finally {
      spy.mockRestore()
    }
    expect(await snapshot()).toEqual(before)
  },
)
it('serializes author deletion against moderation under the same parent lock without reviving either state', async () => {
  const deal = await fixture({
    reviewStatus: 'APPROVED',
    reviewedVersion: 1,
    publishedAt: new Date(),
    applicability: 'NO_FIXED_LOCATION',
  })
  const comment = await db.comment.create({
    data: { dealId: deal.id, authorId: member.id, body: 'Synthetic racing comment' },
  })
  const [deleted, hidden] = await Promise.all([
    fetch(`${base}/api/comments/${comment.id}`, {
      method: 'DELETE',
      headers: { Cookie: member.cookie, Origin: origin },
    }),
    fetch(`${base}/api/admin/moderation/comments/${comment.id}/visibility`, {
      method: 'POST',
      headers: { Cookie: admin.cookie, Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedVersion: 0,
        visibility: 'HIDDEN',
        note: 'Synthetic moderation race',
        confirmed: true,
      }),
    }),
  ])
  const row = await db.comment.findUniqueOrThrow({ where: { id: comment.id } })
  expect(row.moderationVersion).toBe(1)
  if (deleted.status === 200) {
    expect(hidden.status).toBe(409)
    expect(row.deletedAt).not.toBeNull()
    expect(row.hiddenAt).toBeNull()
  } else {
    expect(deleted.status).toBe(404)
    expect(hidden.status).toBe(200)
    expect(row.deletedAt).toBeNull()
    expect(row.hiddenAt).not.toBeNull()
  }
})
it.each(['copy', 'category'] as const)(
  'material %s tool refuses operation-only interleaving and rolls back the whole batch',
  async (tool) => {
    const { rewriteDealCopy } = await import('@api/tools/rewrite-deal-copy')
    const { reclassifyCategories } = await import('@api/tools/reclassify-categories')
    const a = await fixture({ title: 'Synthetic coffee drink', operationVersion: 0 })
    const b = await fixture({ title: 'Synthetic coffee drink', operationVersion: 0 })
    let armed = true
    const racing = db.$extends({
      query: {
        deal: {
          async findMany({ args, query }) {
            const rows = await query(args)
            if (armed) {
              armed = false
              await db.deal.update({ where: { id: a.id }, data: { operationVersion: 1 } })
            }
            return rows
          },
        },
      },
    })
    const write =
      tool === 'copy'
        ? rewriteDealCopy(
            racing as typeof db,
            [a, b].map((d) => ({
              id: d.id,
              field: 'title',
              from: d.title,
              to: 'Synthetic revised coffee',
            })),
            { apply: true },
          )
        : reclassifyCategories(racing as typeof db, true)
    await expect(write).rejects.toMatchObject({ code: 'P2025' })
    expect(await stored(a.id)).toMatchObject({
      title: a.title,
      contentVersion: 1,
      operationVersion: 1,
    })
    expect(await stored(b.id)).toEqual(b)
  },
)
