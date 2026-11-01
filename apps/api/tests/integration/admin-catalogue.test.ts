import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { parseConfig } from '@api/config'
import { apiErrorMiddleware } from '@api/errors'
import axios from 'axios'
import express from 'express'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
// biome-ignore lint/style/noRestrictedImports: Shared disposable fixture has no source alias.
import { pushDisposableSchema } from '../fixtures/disposable-schema'

const origin = 'http://localhost:5173'
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let db: typeof import('@broke-oclock/db').db
let url = ''
let admin: { id: string; cookie: string }
let member: { id: string; cookie: string }
let client: ReturnType<
  typeof import('@broke-oclock/api-client/admin-catalogue').createAdminCatalogueClient
>
const http = (cookie = admin.cookie, source = origin) =>
  axios.create({
    baseURL: `${url}/api/admin/catalogue`,
    headers: { Cookie: cookie, Origin: source },
    validateStatus: () => true,
  })
const reason = { note: 'Synthetic reviewed correction', confirmed: true as const }
const venueFields = {
  name: 'Synthetic outlet',
  address: 'Synthetic resolved address',
  postalCode: '123456',
  area: 'Synthetic area',
  latitude: 1.3,
  longitude: 103.8,
  geographyPrecision: 'OUTLET' as const,
  catalogueKey: 'synthetic:catalogue',
}
const signUp = async (name: string) => {
  const response = await fetch(`${url}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      email: `${randomUUID()}@example.test`,
      password: randomBytes(24).toString('hex'),
    }),
  })
  expect(response.status).toBe(200)
  const body = await response.json()
  return {
    id: body.user.id as string,
    cookie: response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; '),
  }
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
  const databaseUrl = mongo.getUri(`catalogue_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  await pushDisposableSchema(databaseUrl)
  db = (await import('@broke-oclock/db')).db
  const { createApp, createAuth } = await import('@api/app')
  const { createAdminCatalogueRouter } = await import('@api/rest/routers/admin-catalogue')
  const { createAdminCatalogueClient } = await import('@broke-oclock/api-client/admin-catalogue')
  server = createServer()
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No loopback listener')
  url = `http://127.0.0.1:${address.port}`
  const config = parseConfig({
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    BETTER_AUTH_URL: url,
    WEB_ORIGIN: origin,
  })
  const app = express()
  app.use(
    '/api/admin/catalogue',
    express.json(),
    createAdminCatalogueRouter({ config, auth: createAuth(config) }),
  )
  app.use(createApp(config))
  app.use(apiErrorMiddleware)
  server.on('request', app)
  admin = await signUp('Synthetic catalogue administrator')
  member = await signUp('Synthetic catalogue member')
  await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
  client = createAdminCatalogueClient(
    axios.create({ baseURL: `${url}/api`, headers: { Cookie: admin.cookie, Origin: origin } }),
  )
}, 180_000)
afterAll(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  await db?.$disconnect()
  await mongo?.stop()
  vi.unstubAllEnvs()
})
it('exports the actual catalogue HTTP vertical with native auth and strict controls', async () => {
  for (const query of [
    'limit=0',
    'limit=101',
    'limit=1.5',
    'limit=1&limit=2',
    'cursor=bad',
    `search=${'a'.repeat(101)}`,
    'status=unknown',
    'unexpected=1',
  ])
    expect((await http().get(`/merchants?${query}`)).status, query).toBe(400)
  expect((await http('').get('/merchants')).status).toBe(401)
  expect((await http(member.cookie).get('/merchants')).status).toBe(403)
  for (const source of ['', `${origin}/`, 'https://untrusted.example'])
    expect(
      (await http(admin.cookie, source).post('/merchants', { ...reason, name: 'Synthetic denied' }))
        .status,
    ).toBe(403)
  for (const body of [
    { name: 'Synthetic', note: 'x' },
    { ...reason, name: ' ' },
    { ...reason, name: 'Synthetic', provider: 'ADMIN' },
  ])
    expect((await http().post('/merchants', body)).status).toBe(400)
  const methods = await http().delete('/merchants')
  expect(methods.status).toBe(405)
  expect(methods.headers.allow).toBe('GET, POST')
  expect((await http().get('/merchants')).headers['cache-control']).toBe('no-store')
})
it('creates and corrects merchant names, paginates and applies missing/null legacy-zero CAS once', async () => {
  const created = await client.createMerchant({ ...reason, name: 'Synthetic canonical merchant' })
  expect(created).toMatchObject({ version: 1 })
  expect(await client.merchant(created.id)).toMatchObject({
    id: created.id,
    name: 'Synthetic canonical merchant',
    version: 1,
    archived: false,
  })
  for (const stored of ['missing', null, 0] as const) {
    const row = await db.merchant.create({ data: { name: 'Synthetic legacy merchant' } })
    await db.merchant.update({
      where: { id: row.id },
      data: { catalogueVersion: stored === 'missing' ? { unset: true } : stored },
    })
    expect(
      await client.patchMerchant(row.id, {
        ...reason,
        expectedVersion: 0,
        name: 'Synthetic corrected spelling',
      }),
    ).toEqual({ id: row.id, version: 1 })
    await expect(
      client.patchMerchant(row.id, { ...reason, expectedVersion: 0, name: 'Stale' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  }
  const a = await client.merchants({ limit: 1, search: 'Synthetic' })
  expect(a.items).toHaveLength(1)
  expect(a.nextCursor).not.toBeNull()
  const b = await client.merchants({
    limit: 1,
    search: 'Synthetic',
    cursor: a.nextCursor ?? undefined,
  })
  expect((b.items[0]?.id ?? '') > (a.items[0]?.id ?? '')).toBe(true)
})
it('rejects fabricated points, immutable parent changes and injected positive proof', async () => {
  const merchant = await client.createMerchant({ ...reason, name: 'Synthetic point parent' })
  const body = {
    ...reason,
    ...venueFields,
    merchantId: merchant.id,
    expectedMerchantVersion: merchant.version,
  }
  for (const invalid of [
    { latitude: 0, longitude: 0 },
    { latitude: 91 },
    { longitude: 181 },
    { geographyPrecision: 'UNKNOWN' },
    { catalogueKey: '' },
    { postalCode: '' },
    { imageUrl: 'https://user:pass@example.test/x' },
    { imageUrl: 'javascript:alert(1)' },
    { geographyEvidence: { state: 'VERIFIED' } },
  ])
    expect((await http().post('/venues', { ...body, ...invalid })).status).toBe(400)
  expect(
    (await http().post('/venues', { ...body, merchantId: '0123456789abcdef01234567' })).status,
  ).toBe(409)
  const created = await client.createVenue(body)
  expect(await client.venue(created.id)).toMatchObject({
    selectable: false,
    geographyVerified: false,
    occupancyVerified: false,
    version: 1,
  })
  expect(
    (
      await http().patch(`/venues/${created.id}`, {
        ...reason,
        expectedVersion: 1,
        merchantId: merchant.id,
      })
    ).status,
  ).toBe(400)
  expect(
    (
      await http().patch(`/venues/${created.id}`, {
        ...reason,
        expectedVersion: 1,
        name: 'Corrected',
        subjectHash: 'a'.repeat(64),
      })
    ).status,
  ).toBe(400)
})
it('records only explicitly reviewed manual sources, server hashes, clears both proofs on tuple edits and retains exact receipts', async () => {
  const merchant = await client.createMerchant({ ...reason, name: 'Synthetic evidence parent' })
  const venue = await client.createVenue({
    ...reason,
    ...venueFields,
    merchantId: merchant.id,
    expectedMerchantVersion: merchant.version,
  })
  const attestation = {
    ...reason,
    expectedVersion: 1,
    kind: 'GEOGRAPHY' as const,
    sourceType: 'ONEMAP' as const,
    reference: 'Synthetic OneMap reviewed receipt',
    sourceUrl: 'https://www.onemap.gov.sg/',
    statement: 'Synthetic manual source confirms exact address, postal code and point',
    reviewedSource: true as const,
  }
  for (const invalid of [
    { reviewedSource: false },
    { state: 'VERIFIED' },
    { subjectHash: 'a'.repeat(64) },
    { provider: 'ONEMAP' },
    { verifiedAt: new Date().toISOString() },
    { kind: 'OCCUPANCY' },
  ])
    expect(
      (await http().post(`/venues/${venue.id}/evidence`, { ...attestation, ...invalid })).status,
    ).toBe(400)
  expect(await client.recordEvidence(venue.id, attestation)).toMatchObject({ version: 2 })
  expect(
    await client.recordEvidence(venue.id, {
      ...attestation,
      expectedVersion: 2,
      kind: 'OCCUPANCY',
      sourceType: 'OFFICIAL_MERCHANT',
      sourceUrl: 'https://example.test/official-outlets',
      reference: 'Synthetic official merchant receipt',
    }),
  ).toMatchObject({ version: 3 })
  const verified = await client.venue(venue.id)
  expect(verified).toMatchObject({
    selectable: true,
    geographyVerified: true,
    occupancyVerified: true,
  })
  const stored = await db.venue.findUniqueOrThrow({ where: { id: venue.id } })
  expect(stored.geographyEvidence).toMatchObject({
    state: 'VERIFIED',
    provider: 'ADMIN',
    verifiedAt: expect.any(Date),
  })
  await client.patchVenue(venue.id, {
    ...reason,
    expectedVersion: 3,
    name: 'Synthetic corrected tuple',
  })
  const corrected = await db.venue.findUniqueOrThrow({ where: { id: venue.id } })
  expect(corrected.geographyEvidence).toBeNull()
  expect(corrected.occupancyEvidence).toBeNull()
  const history = await db.adminEvidence.findMany({ where: { subjectId: venue.id } })
  expect(
    history.some(
      (row) =>
        row.subjectHash === stored.geographyEvidence?.subjectHash &&
        row.reference === stored.geographyEvidence?.reference,
    ),
  ).toBe(true)
  expect(
    history.some(
      (row) =>
        row.subjectHash === stored.occupancyEvidence?.subjectHash &&
        row.reference === stored.occupancyEvidence?.reference,
    ),
  ).toBe(true)
  expect((await client.venue(venue.id)).selectable).toBe(false)
  expect((await client.venues({ merchantId: merchant.id })).items.map((row) => row.id)).toContain(
    venue.id,
  )
  await client.recordEvidence(venue.id, { ...attestation, expectedVersion: 4 })
  await client.withdrawEvidence(venue.id, { ...reason, expectedVersion: 5, kind: 'GEOGRAPHY' })
  expect((await client.venue(venue.id)).geographyVerified).toBe(false)
  expect(await db.adminEvidence.count({ where: { subjectId: venue.id } })).toBeGreaterThanOrEqual(3)
})
it('archives with no cascade, preserves dependencies, rejects restore and active writes under a tombstoned parent', async () => {
  const merchant = await client.createMerchant({ ...reason, name: 'Synthetic archive parent' })
  const venue = await client.createVenue({
    ...reason,
    ...venueFields,
    merchantId: merchant.id,
    expectedMerchantVersion: merchant.version,
  })
  const deal = await db.deal.create({
    data: {
      title: 'Synthetic retained deal',
      description: '',
      category: 'other',
      offerType: 'OTHER',
      applicability: 'SELECTED_OUTLETS',
      merchantId: merchant.id,
      venues: { create: { venueId: venue.id } },
    },
  })
  await db.stallGrant.create({ data: { userId: member.id, venueId: venue.id } })
  await db.merchantAccessRequest.create({
    data: {
      userId: member.id,
      venueId: venue.id,
      userName: 'Synthetic member',
      userEmail: 'synthetic@example.test',
      venueName: venueFields.name,
      merchantName: 'Synthetic archive parent',
      message: 'Synthetic retained request',
    },
  })
  const snapshot = async () => ({
    deal: await db.deal.findUnique({ where: { id: deal.id } }),
    edges: await db.dealVenue.findMany({ where: { dealId: deal.id } }),
    grants: await db.stallGrant.findMany({ where: { venueId: venue.id } }),
    requests: await db.merchantAccessRequest.findMany({ where: { venueId: venue.id } }),
  })
  const before = await snapshot()
  const parent = await client.merchant(merchant.id)
  expect(parent.version).toBe(2)
  await client.archiveMerchant(merchant.id, { ...reason, expectedVersion: parent.version })
  expect((await db.venue.findUniqueOrThrow({ where: { id: venue.id } })).deletedAt).toBeNull()
  expect((await client.venue(venue.id)).selectable).toBe(false)
  await expect(
    client.patchVenue(venue.id, { ...reason, expectedVersion: venue.version, name: 'Denied' }),
  ).rejects.toMatchObject({ code: 'CONFLICT' })
  expect((await http().post(`/merchants/${merchant.id}/restore`, { ...reason })).status).toBe(404)
  expect(await snapshot()).toEqual(before)
  expect((await client.merchants({ status: 'archived' })).items.map((row) => row.id)).toContain(
    merchant.id,
  )
  const m2 = await client.createMerchant({ ...reason, name: 'Synthetic venue archive parent' })
  const v2 = await client.createVenue({
    ...reason,
    ...venueFields,
    merchantId: m2.id,
    expectedMerchantVersion: m2.version,
  })
  await client.archiveVenue(v2.id, { ...reason, expectedVersion: v2.version })
  expect((await client.venue(v2.id)).archived).toBe(true)
})
it('rolls back target, parent membership, receipt, actor fence and audit together if audit persistence fails', async () => {
  const merchant = await client.createMerchant({ ...reason, name: 'Synthetic rollback parent' })
  const snapshot = async () => ({
    merchants: await db.merchant.findMany({ orderBy: { id: 'asc' } }),
    venues: await db.venue.findMany({ orderBy: { id: 'asc' } }),
    evidence: await db.adminEvidence.findMany(),
    audit: await db.platformAudit.findMany(),
    users: await db.user.findMany(),
    sessions: await db.session.findMany(),
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
            get(target, property, receiver) {
              if (property !== 'platformAudit') return Reflect.get(target, property, receiver)
              return new Proxy(target.platformAudit, {
                get(delegate, method, receiver) {
                  if (method !== 'create') return Reflect.get(delegate, method, receiver)
                  return async (...args: Parameters<typeof delegate.create>) => {
                    await delegate.create(...args)
                    inserted = true
                    throw new Error('Synthetic audit failure')
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
    expect(
      (
        await http().post('/venues', {
          ...reason,
          ...venueFields,
          merchantId: merchant.id,
          expectedMerchantVersion: merchant.version,
        })
      ).status,
    ).toBe(500)
  } finally {
    spy.mockRestore()
  }
  expect(inserted).toBe(true)
  expect(await snapshot()).toEqual(before)
})
it('serializes competing membership creates against exact parent version and parent archive', async () => {
  const merchant = await client.createMerchant({ ...reason, name: 'Synthetic membership race' })
  const body = {
    ...reason,
    ...venueFields,
    merchantId: merchant.id,
    expectedMerchantVersion: merchant.version,
  }
  const responses = await Promise.all([
    http().post('/venues', body),
    http().post('/venues', { ...body, name: 'Synthetic second outlet' }),
  ])
  expect(responses.filter((response) => response.status === 201)).toHaveLength(1)
  expect(responses.filter((response) => response.status === 409)).toHaveLength(1)
  const current = await client.merchant(merchant.id)
  const race = await Promise.all([
    http().post(`/merchants/${merchant.id}/archive`, {
      ...reason,
      expectedVersion: current.version,
    }),
    http().post('/venues', { ...body, expectedMerchantVersion: current.version }),
  ])
  expect(race.filter((response) => [200, 201].includes(response.status))).toHaveLength(1)
  expect(race.filter((response) => response.status === 409)).toHaveLength(1)
})

it.each(['patch', 'record', 'withdraw', 'archiveVenue', 'archiveMerchant'] as const)(
  'rolls back retained evidence, authority and parent membership if audit fails: %s',
  async (operation) => {
    const merchant = await client.createMerchant({
      ...reason,
      name: `Synthetic rollback ${operation}`,
    })
    const venue = await client.createVenue({
      ...reason,
      ...venueFields,
      merchantId: merchant.id,
      expectedMerchantVersion: merchant.version,
    })
    await client.recordEvidence(venue.id, {
      ...reason,
      expectedVersion: 1,
      kind: 'OCCUPANCY',
      sourceType: 'ADMIN_VERIFIED',
      reference: 'Synthetic administrator-reviewed source',
      statement: 'Synthetic explicit manual occupancy source verification',
      reviewedSource: true,
    })
    const parent = await client.merchant(merchant.id)
    const snapshot = async () => ({
      merchant: await db.merchant.findUnique({ where: { id: merchant.id } }),
      venue: await db.venue.findUnique({ where: { id: venue.id } }),
      receipts: await db.adminEvidence.findMany({ where: { subjectId: venue.id } }),
      audit: await db.platformAudit.findMany({
        where: { subjectId: { in: [merchant.id, venue.id] } },
      }),
      user: await db.user.findUnique({ where: { id: admin.id } }),
      sessions: await db.session.findMany({ where: { userId: admin.id } }),
      fence: await db.platformAccessFence.findMany(),
    })
    const before = await snapshot()
    const transact = db.$transaction.bind(db)
    let attempted = false
    const spy = vi.spyOn(db, '$transaction').mockImplementation((work, options) =>
      transact(
        async (tx) =>
          work(
            new Proxy(tx, {
              get(target, key, receiver) {
                if (key !== 'platformAudit') return Reflect.get(target, key, receiver)
                return new Proxy(target.platformAudit, {
                  get(delegate, method, receiver) {
                    if (method !== 'create') return Reflect.get(delegate, method, receiver)
                    return async (...args: Parameters<typeof delegate.create>) => {
                      await delegate.create(...args)
                      attempted = true
                      throw new Error('Synthetic audit rollback')
                    }
                  },
                })
              },
            }),
          ),
        options,
      ),
    )
    const body = { ...reason, expectedVersion: 2 }
    try {
      const request =
        operation === 'patch'
          ? http().patch(`/venues/${venue.id}`, {
              ...body,
              address: 'Synthetic corrected resolved address',
            })
          : operation === 'record'
            ? http().post(`/venues/${venue.id}/evidence`, {
                ...body,
                kind: 'OCCUPANCY',
                sourceType: 'ADMIN_VERIFIED',
                reference: 'Synthetic second source',
                statement: 'Synthetic reviewed second source statement',
                reviewedSource: true,
              })
            : operation === 'withdraw'
              ? http().post(`/venues/${venue.id}/evidence/withdraw`, { ...body, kind: 'OCCUPANCY' })
              : operation === 'archiveVenue'
                ? http().post(`/venues/${venue.id}/archive`, body)
                : http().post(`/merchants/${merchant.id}/archive`, {
                    ...body,
                    expectedVersion: parent.version,
                  })
      expect((await request).status).toBe(500)
      expect(attempted).toBe(true)
    } finally {
      spy.mockRestore()
    }
    expect(await snapshot()).toEqual(before)
  },
)
it('GET/HEAD remain read-only and current actor role/session are checked on every write', async () => {
  const row = await client.createMerchant({ ...reason, name: 'Synthetic read-only target' })
  const snapshot = async () => ({
    users: await db.user.findMany(),
    sessions: await db.session.findMany(),
    audit: await db.platformAudit.findMany(),
    fence: await db.platformAccessFence.findMany(),
  })
  const before = await snapshot()
  for (const path of ['/merchants', `/merchants/${row.id}`, '/venues']) {
    expect((await http().get(path)).status).toBe(200)
    expect((await http().head(path)).status).toBe(200)
    expect((await http().options(path)).status).toBe(405)
  }
  expect(await snapshot()).toEqual(before)
  await db.user.update({ where: { id: admin.id }, data: { role: 'USER' } })
  expect(
    (
      await http().patch(`/merchants/${row.id}`, {
        ...reason,
        expectedVersion: 1,
        name: 'Denied stale actor',
      })
    ).status,
  ).toBe(403)
  await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
  const session = await db.session.findFirstOrThrow({ where: { userId: admin.id } })
  await db.session.update({ where: { id: session.id }, data: { expiresAt: new Date(0) } })
  expect(
    (
      await http().patch(`/merchants/${row.id}`, {
        ...reason,
        expectedVersion: 1,
        name: 'Denied expired actor',
      })
    ).status,
  ).toBe(401)
  await db.session.update({ where: { id: session.id }, data: { expiresAt: session.expiresAt } })
})

it('serializes an in-flight ALL publication against newly added outlet membership', async () => {
  const { reviewAdminDeal } = await import('@api/modules/deals/admin-review')
  const { recordAdminDealScopeEvidence } = await import('@api/modules/deals/scope-evidence')
  const merchant = await client.createMerchant({
    ...reason,
    name: 'Synthetic ALL publication race',
  })
  const outlet = await client.createVenue({
    ...reason,
    ...venueFields,
    merchantId: merchant.id,
    expectedMerchantVersion: merchant.version,
  })
  for (const [index, kind] of (['GEOGRAPHY', 'OCCUPANCY'] as const).entries())
    await client.recordEvidence(outlet.id, {
      ...reason,
      expectedVersion: index + 1,
      kind,
      sourceType: 'ADMIN_VERIFIED',
      reference: 'Synthetic explicitly reviewed authority',
      statement: 'Synthetic administrator source verification of exact tuple',
      reviewedSource: true,
    })
  const deal = await db.deal.create({
    data: {
      title: 'Synthetic ALL deal',
      description: 'Synthetic legitimate submission',
      category: 'other',
      offerType: 'OTHER',
      applicability: 'ALL_MERCHANT_OUTLETS',
      merchantId: merchant.id,
      submittedById: member.id,
    },
  })
  const session = await db.session.findFirstOrThrow({ where: { userId: admin.id } })
  const actor = { userId: admin.id, sessionId: session.id }
  await recordAdminDealScopeEvidence(db, actor, deal.id, {
    expectedContentVersion: 1,
    expectedOperationVersion: 0,
    note: 'Synthetic source review',
    reference: 'Synthetic actual submitter terms',
    statement: 'Synthetic terms apply to all merchant outlets',
    staffConfirmed: true,
  })
  const parent = await client.merchant(merchant.id)
  let reached!: () => void
  let resume!: () => void
  let contender!: () => void
  const paused = new Promise<void>((resolve) => {
    reached = resolve
  })
  const release = new Promise<void>((resolve) => {
    resume = resolve
  })
  const competing = new Promise<void>((resolve) => {
    contender = resolve
  })
  let publishing = false
  const transact = db.$transaction.bind(db)
  const spy = vi.spyOn(db, '$transaction').mockImplementation((work, options) =>
    transact(
      async (tx) =>
        work(
          new Proxy(tx, {
            get(target, key, receiver) {
              if (key === 'merchant')
                return new Proxy(target.merchant, {
                  get(delegate, method, receiver) {
                    if (method !== 'update') return Reflect.get(delegate, method, receiver)
                    return async (...args: Parameters<typeof delegate.update>) => {
                      publishing = true
                      reached()
                      await release
                      return delegate.update(...args)
                    }
                  },
                })
              if (key === 'platformAccessFence')
                return new Proxy(target.platformAccessFence, {
                  get(delegate, method, receiver) {
                    if (method !== 'upsert') return Reflect.get(delegate, method, receiver)
                    return async (...args: Parameters<typeof delegate.upsert>) => {
                      if (publishing) contender()
                      return delegate.upsert(...args)
                    }
                  },
                })
              return Reflect.get(target, key, receiver)
            },
          }),
        ),
      options,
    ),
  )
  const publication = reviewAdminDeal(db, actor, deal.id, {
    expectedContentVersion: 1,
    expectedOperationVersion: 1,
    note: 'Synthetic publish complete ALL membership',
    decision: 'APPROVE',
  })
  let creation: Promise<import('axios').AxiosResponse<unknown>> | undefined
  try {
    await paused
    creation = http().post('/venues', {
      ...reason,
      ...venueFields,
      name: 'Synthetic new unverified member',
      merchantId: merchant.id,
      expectedMerchantVersion: parent.version,
    })
    await competing
    resume()
    expect((await publication).reviewStatus).toBe('APPROVED')
    expect((await creation).status).toBe(409)
    expect(await db.venue.count({ where: { merchantId: merchant.id } })).toBe(1)
  } finally {
    resume()
    await publication.catch(() => {})
    await creation?.catch(() => {})
    spy.mockRestore()
  }
})
