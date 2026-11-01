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
const scratch = resolve(tmpdir(), 'lobangers-deals')
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
  const url = mongo.getUri(`admin_deals_${randomUUID().replaceAll('-', '')}`)
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
it('lists all origins over native authenticated HTTP and preserves full legacy copy with bounded id-desc pagination', async () => {
  const a = await fixture({ title: 'A'.repeat(200), origin: 'IMPORTED' })
  const b = await fixture()
  const response = await req('?limit=1')
  expect(response.status).toBe(200)
  const page = await response.json()
  expect(page.items[0].id).toBe(b.id)
  expect(page.nextCursor).toBe(b.id)
  const next = await (await req(`?limit=1&cursor=${page.nextCursor}`)).json()
  expect(next.items[0].id).toBe(a.id)
  expect(next.items[0].title).toHaveLength(200)
  expect((await req('', 'GET', undefined, '')).status).toBe(401)
  expect((await req('', 'GET', undefined, member.cookie)).status).toBe(403)
  for (const query of [
    '?limit=0',
    '?limit=51',
    '?limit=2&limit=3',
    '?unknown=1',
    '?includeDeleted=yes',
  ])
    expect((await req(query)).status).toBe(400)
})

it('unpublishes approved-unpublished deals and rejects duplicate evidence as a noop', async () => {
  const deal = await fixture({ reviewStatus: 'APPROVED', reviewedVersion: 1 })
  expect((await req(`/${deal.id}/unpublish`, 'POST', envelope)).status).toBe(200)
  const pending = await fixture()
  const input = {
    ...envelope,
    reference: 'merchant-campaign-reference-2026',
    statement: 'Staff reviewed the actual merchant campaign supporting online scope.',
    staffConfirmed: true,
  }
  expect((await req(`/${pending.id}/scope-evidence`, 'POST', input)).status).toBe(200)
  expect(
    (await req(`/${pending.id}/scope-evidence`, 'POST', { ...input, expectedOperationVersion: 1 }))
      .status,
  ).toBe(400)
  expect(await db.adminEvidence.count({ where: { subjectId: pending.id } })).toBe(1)
})
it('uses the shared typed client over real HTTP, enforces methods, and rejects native-session revocation', async () => {
  const { createAdminDealsClient } = await import('@broke-oclock/api-client/admin-deals')
  const { default: axios } = await import('axios')
  const client = createAdminDealsClient(
    axios.create({ baseURL: `${base}/api`, headers: { Cookie: admin.cookie, Origin: origin } }),
  )
  const deal = await fixture()
  expect(await client.detail(deal.id)).toMatchObject({ id: deal.id })
  expect(
    await client.content(deal.id, { ...envelope, changes: { title: 'Shared client correction' } }),
  ).toMatchObject({ title: 'Shared client correction', contentVersion: 2 })
  for (const [path, method] of [
    ['', 'HEAD'],
    ['', 'POST'],
    [`/${deal.id}`, 'DELETE'],
    [`/${deal.id}/scope`, 'POST'],
    [`/${deal.id}/review`, 'PATCH'],
  ] as const)
    expect((await req(path, method)).status).toBe(405)
  const operator = await signup()
  await db.user.update({ where: { id: operator.id }, data: { role: 'ADMIN' } })
  expect((await req('', 'GET', undefined, operator.cookie)).status).toBe(200)
  await db.session.deleteMany({ where: { userId: operator.id } })
  expect(
    (
      await req(
        `/${deal.id}/reopen`,
        'POST',
        { ...envelope, expectedContentVersion: 2, expectedOperationVersion: 1 },
        operator.cookie,
      )
    ).status,
  ).toBe(401)
})
it('allows exactly one concurrent review/correction and prevents ABA through operation version', async () => {
  const deal = await fixture()
  const outcomes = await Promise.all([
    req(`/${deal.id}/review`, 'POST', { ...envelope, decision: 'APPROVE' }),
    req(`/${deal.id}/content`, 'PATCH', {
      ...envelope,
      changes: { title: 'Concurrent correction' },
    }),
  ])
  expect(outcomes.map((r) => r.status).sort()).toEqual([200, 409])
  expect(await db.platformAudit.count({ where: { subjectId: deal.id } })).toBe(1)
  const rejected = await fixture({ reviewStatus: 'REJECTED' })
  expect((await req(`/${rejected.id}/reopen`, 'POST', envelope)).status).toBe(200)
  expect(
    (
      await req(`/${rejected.id}/review`, 'POST', {
        ...envelope,
        expectedOperationVersion: 1,
        decision: 'REJECT',
      })
    ).status,
  ).toBe(200)
  expect((await req(`/${rejected.id}/reopen`, 'POST', envelope)).status).toBe(409)
})
it('never evaluates large selected scope from the displayed page and fences dynamic ALL merchant membership', async () => {
  const { geographySubjectHash, occupancySubjectHash } = await import(
    '@api/modules/deals/outlet-eligibility'
  )
  const merchant = await db.merchant.create({ data: { name: 'Synthetic large scope' } })
  const venues = []
  for (let n = 0; n < 101; n++) {
    const venue = await db.venue.create({
      data: {
        merchantId: merchant.id,
        name: `Synthetic outlet ${n}`,
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
          reference: 'Synthetic reviewed geography',
          verifiedAt: new Date(),
        },
        occupancyEvidence: {
          state: 'VERIFIED',
          provider: 'ADMIN',
          subjectHash: occupancySubjectHash(venue),
          reference: 'Synthetic reviewed occupancy',
          verifiedAt: new Date(),
        },
      },
    })
    venues.push(venue)
  }
  const deal = await fixture({ applicability: 'SELECTED_OUTLETS', merchantId: merchant.id })
  await db.dealVenue.createMany({ data: venues.map((v) => ({ dealId: deal.id, venueId: v.id })) })
  const input = {
    ...envelope,
    reference: 'https://merchant.example/all-outlets',
    statement: 'Reviewed full merchant campaign covering every selected outlet.',
    staffConfirmed: true,
  }
  expect((await req(`/${deal.id}/scope-evidence`, 'POST', input)).status).toBe(200)
  const page = await (await req(`/${deal.id}?limit=1`)).json()
  expect(page.outlets).toHaveLength(1)
  expect(page.outletCount).toBe(101)
  expect(page.scopeEditable).toBe(false)
  expect(page.selectedVenueIds).toBeNull()
  expect(page.approvalReady).toBe(true)
  const hiddenEdge = venues[0]
  if (!hiddenEdge) throw new Error('Missing fixture')
  await db.venue.update({ where: { id: hiddenEdge.id }, data: { deletedAt: new Date() } })
  const invalid = await (await req(`/${deal.id}?limit=1`)).json()
  expect(invalid.approvalReady).toBe(false)
  expect(
    (
      await req(`/${deal.id}/review`, 'POST', {
        ...envelope,
        expectedOperationVersion: 1,
        decision: 'APPROVE',
      })
    ).status,
  ).toBe(412)
  expect((await db.deal.findUniqueOrThrow({ where: { id: deal.id } })).operationVersion).toBe(1)
  expect(await db.platformAudit.count({ where: { subjectId: deal.id } })).toBe(1)
  expect(
    (
      await req(`/${deal.id}/scope`, 'PATCH', {
        ...envelope,
        expectedOperationVersion: 1,
        applicability: 'SELECTED_OUTLETS',
        merchantId: merchant.id,
        venueIds: [venues[1]?.id],
      })
    ).status,
  ).toBe(412)
  const all = await fixture({ applicability: 'ALL_MERCHANT_OUTLETS', merchantId: merchant.id })
  expect((await req(`/${all.id}/scope-evidence`, 'POST', input)).status).toBe(200)
  await db.venue.create({
    data: {
      merchantId: merchant.id,
      name: 'Unverified new membership',
      address: 'Synthetic',
      latitude: 1.3,
      longitude: 103.8,
    },
  })
  expect(
    (
      await req(`/${all.id}/review`, 'POST', {
        ...envelope,
        expectedOperationVersion: 1,
        decision: 'APPROVE',
      })
    ).status,
  ).toBe(412)
})

it('rolls back evidence, content, actor/session touches and audit when the in-transaction operation fails', async () => {
  const { mutateAdminDeal } = await import('@api/modules/deals/admin-write')
  const deal = await fixture()
  const session = await db.session.findFirstOrThrow({ where: { userId: admin.id } })
  const before = await Promise.all([
    db.deal.findUnique({ where: { id: deal.id } }),
    db.user.findUnique({ where: { id: admin.id } }),
    db.session.findUnique({ where: { id: session.id } }),
    db.platformAudit.count({ where: { subjectId: deal.id } }),
  ])
  await expect(
    mutateAdminDeal(
      db,
      { userId: admin.id, sessionId: session.id },
      deal.id,
      envelope,
      async (tx) => {
        await tx.adminEvidence.create({
          data: {
            actorId: admin.id,
            actorName: 'Synthetic',
            subjectType: 'DEAL',
            subjectId: deal.id,
            kind: 'SCOPE',
            subjectHash: 'a'.repeat(64),
            reference: 'synthetic-reviewed-reference',
            statement: 'Synthetic reviewed campaign scope',
          },
        })
        await tx.deal.update({ where: { id: deal.id }, data: { title: 'Must roll back' } })
        throw new Error('Synthetic transaction failure after writes')
      },
    ),
  ).rejects.toThrow('Synthetic transaction failure after writes')
  expect(await db.adminEvidence.count({ where: { subjectId: deal.id } })).toBe(0)
  expect(
    await Promise.all([
      db.deal.findUnique({ where: { id: deal.id } }),
      db.user.findUnique({ where: { id: admin.id } }),
      db.session.findUnique({ where: { id: session.id } }),
      db.platformAudit.count({ where: { subjectId: deal.id } }),
    ]),
  ).toEqual(before)
})
const envelope = {
  expectedContentVersion: 1,
  expectedOperationVersion: 0,
  note: 'Synthetic explicit correction reason',
}
it('corrects content atomically, invalidates approval and proof, preserves origin/submission and rejects stale/noop/unsafe transitions', async () => {
  const deal = await fixture({
    reviewStatus: 'APPROVED',
    reviewedVersion: 1,
    publishedAt: new Date(),
  })
  const read = await req(`/${deal.id}`)
  expect(read.status).toBe(200)
  expect(await read.json()).toMatchObject({
    id: deal.id,
    description: 'Full safe copy',
    submittedById: member.id,
    operationVersion: 0,
  })
  const result = await req(`/${deal.id}/content`, 'PATCH', {
    ...envelope,
    changes: { title: 'Corrected meal', priceMinor: 1290, currency: 'SGD' },
  })
  expect(result.status).toBe(200)
  expect(await result.json()).toMatchObject({
    id: deal.id,
    contentVersion: 2,
    operationVersion: 1,
    reviewStatus: 'PENDING',
    publishedAt: null,
  })
  expect(await db.deal.findUniqueOrThrow({ where: { id: deal.id } })).toMatchObject({
    title: 'Corrected meal',
    submittedById: member.id,
    origin: 'USER_SUBMITTED',
    scopeConfirmation: null,
    reviewedVersion: null,
    reviewedById: null,
    reviewedAt: null,
    reviewNote: null,
  })
  expect(await db.platformAudit.findMany({ where: { subjectId: deal.id } })).toHaveLength(1)
  expect(
    (await req(`/${deal.id}/content`, 'PATCH', { ...envelope, changes: { title: 'Stale edit' } }))
      .status,
  ).toBe(409)
  expect(
    (
      await req(`/${deal.id}/content`, 'PATCH', {
        ...envelope,
        expectedContentVersion: 2,
        expectedOperationVersion: 1,
        changes: { title: 'Corrected meal' },
      })
    ).status,
  ).toBe(400)
  for (const changes of [
    {},
    { origin: 'IMPORTED' },
    { priceMinor: 1000001 },
    { currency: 'USD' },
    { imageUrl: 'javascript:bad' },
  ])
    expect((await req(`/${deal.id}/content`, 'PATCH', { ...envelope, changes })).status).toBe(400)
  for (const reviewStatus of ['HIDDEN', 'REJECTED'] as const) {
    const target = await fixture({ reviewStatus })
    expect(
      (
        await req(`/${target.id}/content`, 'PATCH', {
          ...envelope,
          changes: { title: 'No bypass' },
        })
      ).status,
    ).toBe(412)
  }
  const archived = await fixture({ deletedAt: new Date() })
  expect(
    (await req(`/${archived.id}/content`, 'PATCH', { ...envelope, changes: { title: 'No edit' } }))
      .status,
  ).toBe(412)
  expect(
    (
      await req(
        `/${deal.id}/content`,
        'PATCH',
        { ...envelope, changes: { title: 'Bad origin' } },
        admin.cookie,
        'https://evil.example',
      )
    ).status,
  ).toBe(403)
})
it('reviews real open-ended submissions without fake citations, requires reviewed evidence to publish, and reopens rather than restoring', async () => {
  const deal = await fixture()
  const evidence = {
    ...envelope,
    reference: 'https://merchant.example/campaign',
    statement: 'I reviewed the merchant campaign and confirmed online applicability.',
    staffConfirmed: true,
  }
  const receipt = await req(`/${deal.id}/scope-evidence`, 'POST', evidence)
  expect(receipt.status).toBe(200)
  expect(await receipt.json()).toMatchObject({
    operationVersion: 1,
    scopeConfirmed: true,
    scopeEvidenceLabel: 'Submission evidence',
    publishedAt: null,
  })
  expect(await db.dealSource.count({ where: { dealId: deal.id } })).toBe(0)
  expect(await db.adminEvidence.findFirst({ where: { subjectId: deal.id } })).toMatchObject({
    kind: 'SCOPE',
    basis: 'SOURCE_NONSPATIAL',
    reference: evidence.reference,
    citationId: null,
    contentVersion: 1,
  })
  const approve = await req(`/${deal.id}/review`, 'POST', {
    ...envelope,
    expectedOperationVersion: 1,
    decision: 'APPROVE',
  })
  expect(approve.status).toBe(200)
  expect(await approve.json()).toMatchObject({
    reviewStatus: 'APPROVED',
    contentVersion: 1,
    operationVersion: 2,
    publication: 'PUBLISHED',
    validUntil: null,
  })
  const hidden = await req(`/${deal.id}/unpublish`, 'POST', {
    ...envelope,
    expectedOperationVersion: 2,
  })
  expect(hidden.status).toBe(200)
  expect(await hidden.json()).toMatchObject({
    reviewStatus: 'HIDDEN',
    publishedAt: null,
    reviewedVersion: 1,
    contentVersion: 1,
    operationVersion: 3,
  })
  expect(
    (
      await req(`/${deal.id}/review`, 'POST', {
        ...envelope,
        expectedOperationVersion: 3,
        decision: 'APPROVE',
      })
    ).status,
  ).toBe(412)
  const reopened = await req(`/${deal.id}/reopen`, 'POST', {
    ...envelope,
    expectedOperationVersion: 3,
  })
  expect(reopened.status).toBe(200)
  expect(await reopened.json()).toMatchObject({
    reviewStatus: 'PENDING',
    publishedAt: null,
    reviewedVersion: null,
    operationVersion: 4,
    scopeConfirmed: false,
  })
  expect(
    (
      await req(`/${deal.id}/review`, 'POST', {
        ...envelope,
        expectedOperationVersion: 4,
        decision: 'REJECT',
      })
    ).status,
  ).toBe(200)
  const anonymous = await fixture({ submittedById: null })
  expect(
    (await req(`/${anonymous.id}/review`, 'POST', { ...envelope, decision: 'APPROVE' })).status,
  ).toBe(412)
  const unconfirmed = await fixture()
  const approved = await req(`/${unconfirmed.id}/review`, 'POST', {
    ...envelope,
    decision: 'APPROVE',
  })
  expect(approved.status).toBe(200)
  expect(await approved.json()).toMatchObject({
    reviewStatus: 'APPROVED',
    publishedAt: null,
    publication: 'UNPUBLISHED',
  })
})
it('requires complete explicit scope, rejects duplicate/noop edits and invalidates review with exactly one increment', async () => {
  const merchant = await db.merchant.create({ data: { name: 'Synthetic scope merchant' } })
  const deal = await fixture()
  const input = {
    ...envelope,
    applicability: 'NO_FIXED_LOCATION',
    merchantId: merchant.id,
    venueIds: [],
  }
  const response = await req(`/${deal.id}/scope`, 'PATCH', input)
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    contentVersion: 2,
    operationVersion: 1,
    applicability: 'NO_FIXED_LOCATION',
    merchantId: merchant.id,
    reviewStatus: 'PENDING',
  })
  expect(
    (
      await req(`/${deal.id}/scope`, 'PATCH', {
        ...input,
        expectedContentVersion: 2,
        expectedOperationVersion: 1,
      })
    ).status,
  ).toBe(400)
  expect(
    (
      await req(`/${deal.id}/scope`, 'PATCH', {
        ...input,
        venueIds: ['0123456789abcdef01234567', '0123456789abcdef01234567'],
      })
    ).status,
  ).toBe(400)
  expect(
    (await req(`/${deal.id}/scope`, 'PATCH', { ...input, merchantId: undefined })).status,
  ).toBe(400)
})
it('pins exact imported citations, refuses stale source proofs and preserves original bytes through corrections', async () => {
  const source = await db.importSource.create({
    data: {
      provider: 'WORDPRESS',
      externalId: 'scoobifydaily.wordpress.com',
      name: 'Synthetic import',
      url: 'https://scoobifydaily.wordpress.com',
    },
  })
  const post = await db.importedPost.create({
    data: {
      sourceId: source.id,
      externalId: randomUUID(),
      url: 'https://merchant.example/promotion',
      rawContent: 'Original source bytes <b>not html</b>',
      contentHash: 'a'.repeat(64),
      status: 'NEEDS_REVIEW',
    },
  })
  const deal = await fixture({
    origin: 'IMPORTED',
    submittedById: null,
    validFrom: new Date('2026-01-01'),
    validUntil: new Date('2099-01-01'),
  })
  const citation = await db.dealSource.create({
    data: {
      dealId: deal.id,
      importedPostId: post.id,
      sourceUrl: post.url,
      sourceContentHash: post.contentHash,
      sourceContentSnapshot: post.rawContent,
    },
  })
  const image = await db.importedImage.create({
    data: {
      id: 'e'.repeat(64),
      mimeType: 'image/jpeg',
      sizeBytes: 300,
      hostedUrl: 'https://images.example/meal.jpg',
      status: 'HOSTED',
    },
  })
  await db.dealSourceImage.create({
    data: {
      dealSourceId: citation.id,
      imageId: image.id,
      sourceUrl: 'https://source.example/image.jpg',
    },
  })
  const full = await (await req(`/${deal.id}`)).json()
  expect(full.images).toContainEqual({ url: image.hostedUrl, mimeType: image.mimeType })
  const input = {
    ...envelope,
    reference: post.url,
    statement: 'I reviewed this exact pinned campaign for online scope.',
    staffConfirmed: true,
    citationId: citation.id,
    sourceContentHash: post.contentHash,
  }
  expect(
    (
      await req(`/${deal.id}/scope-evidence`, 'POST', {
        ...input,
        sourceContentHash: 'b'.repeat(64),
      })
    ).status,
  ).toBe(412)
  expect(await db.adminEvidence.count({ where: { subjectId: deal.id } })).toBe(0)
  expect((await req(`/${deal.id}/scope-evidence`, 'POST', input)).status).toBe(200)
  expect(
    (
      await req(`/${deal.id}/review`, 'POST', {
        ...envelope,
        expectedOperationVersion: 1,
        decision: 'APPROVE',
      })
    ).status,
  ).toBe(200)
  expect(
    (
      await req(`/${deal.id}/content`, 'PATCH', {
        ...envelope,
        expectedOperationVersion: 2,
        changes: { description: 'Reviewed correction' },
      })
    ).status,
  ).toBe(200)
  expect(await db.dealSource.findUnique({ where: { id: citation.id } })).toEqual(citation)
  expect((await db.importedPost.findUniqueOrThrow({ where: { id: post.id } })).rawContent).toBe(
    post.rawContent,
  )
  expect(
    (
      await req(`/${deal.id}/review`, 'POST', {
        ...envelope,
        expectedContentVersion: 2,
        expectedOperationVersion: 3,
        decision: 'APPROVE',
      })
    ).status,
  ).toBe(200)
  expect((await db.deal.findUniqueOrThrow({ where: { id: deal.id } })).publishedAt).toBeNull()
})
