import { execFile } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parseConfig } from '@api/config'
import {
  geographySubjectHash,
  occupancySubjectHash,
  outletScopeHash,
} from '@api/modules/deals/outlet-eligibility'
import type { IngestionRuntime } from '@api/modules/ingestion/runtime'
import { MONEYDIGEST_SOURCE, sourceWhere } from '@api/modules/ingestion/source'
import axios from 'axios'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const required = <Value>(value: Value | null | undefined): Value => {
  if (value == null) throw new Error('Missing synthetic test fixture')
  return value
}
const origin = 'http://localhost:5173'
const root = fileURLToPath(new URL('../../../../', import.meta.url))
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let db: typeof import('@broke-oclock/db').db
let baseURL = ''
let fixtureDatabaseUrl = ''
const clock = new Date('2026-10-03T00:00:00.000Z')
const syntheticPost = (
  id = 101,
  content = 'Singapore pizza 1-for-1. Valid from 1 October 2026 until 31 December 2026.',
) => ({
  id,
  link: `https://www.moneydigest.sg/synthetic-${id}/`,
  date: '2026-10-01T12:00:00',
  title: { rendered: 'Synthetic Pizza' },
  content: { rendered: content },
  excerpt: { rendered: '' },
})
const listPosts = vi.fn<IngestionRuntime['listPosts']>().mockResolvedValue([syntheticPost()])
const runtime: IngestionRuntime = {
  enabled: false,
  reuseApproved: false,
  now: () => clock,
  listPosts,
}

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
  const databaseUrl = mongo.getUri(`ingestion_${randomUUID().replaceAll('-', '')}`)
  fixtureDatabaseUrl = databaseUrl
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  await promisify(execFile)('pnpm', ['--dir', 'packages/db', 'run', 'push', '--skip-generate'], {
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
      { ingestion: runtime },
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

const http = (cookie = admin.cookie, requestOrigin: string | undefined = origin) =>
  axios.create({
    baseURL,
    validateStatus: () => true,
    headers: {
      ...(requestOrigin ? { Origin: requestOrigin } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
  })
const fixture = async () => {
  const source = await db.importSource.upsert({
    where: sourceWhere,
    create: { ...MONEYDIGEST_SOURCE, enabled: true },
    update: { enabled: true },
  })
  const snapshot = JSON.stringify(syntheticPost())
  const hash = createHash('sha256').update(snapshot).digest('hex')
  const post = await db.importedPost.create({
    data: {
      sourceId: source.id,
      externalId: randomUUID(),
      url: syntheticPost().link,
      rawContent: snapshot,
      contentHash: hash,
      processedContentHash: hash,
      status: 'NEEDS_REVIEW',
    },
  })
  const deal = await db.deal.create({
    data: {
      title: 'Synthetic Pizza',
      description: 'Immutable description',
      terms: 'Immutable terms',
      category: 'FOOD',
      offerType: 'BUY_ONE_GET_ONE',
      origin: 'IMPORTED',
      applicability: 'NO_FIXED_LOCATION',
      validFrom: new Date('2026-10-01'),
      validUntil: new Date('2027-01-01'),
      sources: {
        create: {
          importedPostId: post.id,
          sourceContentHash: hash,
          sourceContentSnapshot: snapshot,
          sourceUrl: post.url,
        },
      },
    },
  })
  const merchant = await db.merchant.create({ data: { name: 'Synthetic merchant' } })
  const venue = await db.venue.create({
    data: {
      merchantId: merchant.id,
      name: 'Existing outlet',
      address: 'Existing address',
      latitude: 1.3,
      longitude: 103.8,
    },
  })
  return { deal, post, venue, merchant, source }
}
const associate = (f: Awaited<ReturnType<typeof fixture>>, version = 1, venueId = f.venue.id) =>
  http().patch(`/api/ingestion/drafts/${f.deal.id}/outlet`, {
    expectedContentVersion: version,
    venueId,
  })
const review = (f: Awaited<ReturnType<typeof fixture>>, version = 1, decision = 'APPROVE') =>
  http().post(`/api/ingestion/drafts/${f.deal.id}/review`, {
    expectedContentVersion: version,
    decision,
    note: 'Synthetic evidence checked',
  })
const stored = (id: string) =>
  db.deal.findUniqueOrThrow({ where: { id }, include: { sources: true, venues: true } })

const verifyVenue = async (f: Awaited<ReturnType<typeof fixture>>) => {
  const venue = {
    ...f.venue,
    geographyPrecision: 'PROPERTY' as const,
    catalogueKey: `synthetic:${f.venue.id}`,
  }
  return db.venue.update({
    where: { id: venue.id },
    data: {
      geographyPrecision: venue.geographyPrecision,
      catalogueKey: venue.catalogueKey,
      occupancyEvidence: {
        state: 'VERIFIED',
        provider: 'OFFICIAL_MERCHANT',
        reference: 'synthetic occupancy receipt',
        subjectHash: occupancySubjectHash(venue),
        verifiedAt: clock,
      },
      geographyEvidence: {
        state: 'VERIFIED',
        provider: 'ONEMAP',
        reference: 'synthetic geography receipt',
        subjectHash: geographySubjectHash(venue),
        verifiedAt: clock,
      },
    },
  })
}

const confirmScope = async (f: Awaited<ReturnType<typeof fixture>>) => {
  const deal = await stored(f.deal.id)
  return db.deal.update({
    where: { id: deal.id },
    data: {
      scopeConfirmation: {
        basis: deal.applicability === 'SELECTED_OUTLETS' ? 'SOURCE_SELECTED' : 'SOURCE_ALL',
        contentVersion: deal.contentVersion,
        scopeHash: outletScopeHash({
          ...deal,
          selectedVenueIds: deal.venues.map((link) => link.venueId),
        }),
        evidenceRef: 'synthetic campaign receipt',
        retainedVenueIds: [],
        confirmedAt: clock,
        sourceContentHash: f.post.contentHash,
        sourceUrl: f.post.url,
      },
    },
  })
}

describe('conservative outlet writers with native HTTP and disposable replica', () => {
  it('refuses selected approval when the source receipt is not bound to a current pinned citation', async () => {
    const f = await fixture()
    await verifyVenue(f)
    await associate(f)
    const confirmed = await confirmScope(f)
    await db.deal.update({
      where: { id: f.deal.id },
      data: {
        scopeConfirmation: {
          set: { ...required(confirmed.scopeConfirmation), sourceContentHash: 'forged' },
        },
      },
    })
    expect((await review(f, 2)).status).toBe(412)
  })
  it('invalidates old scope when a verified search selection becomes a real version edit', async () => {
    const f = await fixture()
    await verifyVenue(f)
    await db.deal.update({
      where: { id: f.deal.id },
      data: {
        scopeConfirmation: {
          basis: 'SOURCE_NONSPATIAL',
          contentVersion: 1,
          scopeHash: outletScopeHash({ ...f.deal, selectedVenueIds: [] }),
          evidenceRef: 'synthetic old scope',
          retainedVenueIds: [],
          confirmedAt: clock,
        },
      },
    })
    const response = await associate(f)
    const after = await stored(f.deal.id)
    expect({
      status: response.status,
      version: after.contentVersion,
      scope: after.scopeConfirmation,
    }).toEqual({ status: 200, version: 2, scope: null })
  })
  it('refuses selected approval without source-confirmed scope despite verified outlet proofs', async () => {
    const f = await fixture()
    await verifyVenue(f)
    await associate(f)
    expect((await review(f, 2)).status).toBe(412)
  })
  it('refuses selected approval when geography proof is absent even with current source scope', async () => {
    const f = await fixture()
    await verifyVenue(f)
    await associate(f)
    await confirmScope(f)
    await db.venue.update({
      where: { id: f.venue.id },
      data: { geographyEvidence: { unset: true } },
    })
    expect((await review(f, 2)).status).toBe(412)
  })
  it('refuses unconfirmed ALL approval instead of publishing arbitrary chain scope', async () => {
    const f = await fixture()
    await verifyVenue(f)
    await db.deal.update({
      where: { id: f.deal.id },
      data: { merchantId: f.merchant.id, applicability: 'ALL_MERCHANT_OUTLETS' },
    })
    expect((await review(f)).status).toBe(412)
  })
  it('refuses confirmed ALL approval from a disabled source', async () => {
    const f = await fixture()
    await verifyVenue(f)
    await db.deal.update({
      where: { id: f.deal.id },
      data: { merchantId: f.merchant.id, applicability: 'ALL_MERCHANT_OUTLETS' },
    })
    await confirmScope(f)
    await db.importSource.update({ where: { id: f.source.id }, data: { enabled: false } })
    expect((await review(f)).status).toBe(412)
  })
  it('allows nonspatial content approval without turning unknown scope into publication', async () => {
    const f = await fixture()
    const response = await review(f)
    const after = await stored(f.deal.id)
    expect({
      status: response.status,
      review: after.reviewStatus,
      publishedAt: after.publishedAt,
      scope: after.scopeConfirmation,
    }).toEqual({ status: 200, review: 'APPROVED', publishedAt: null, scope: null })
  })
  it('account picker skips unknown and stale catalogue tuples before selecting a later verified row', async () => {
    const f = await fixture()
    const prefix = `Picker ${randomUUID()}`
    await db.venue.update({ where: { id: f.venue.id }, data: { name: `${prefix} zz verified` } })
    f.venue = await db.venue.findUniqueOrThrow({ where: { id: f.venue.id } })
    await verifyVenue(f)
    for (let i = 0; i < 12; i++)
      await db.venue.create({
        data: {
          merchantId: f.merchant.id,
          name: `${prefix} aa unknown ${i}`,
          address: 'Unknown',
          latitude: 1.3,
          longitude: 103.8,
        },
      })
    const response = await http(member.cookie).get('/api/account/venues', {
      params: { search: prefix },
    })
    expect(response.data.map((v: { id: string }) => v.id)).toEqual([f.venue.id])
  })
  it('admin new-selection picker returns verified tuples only without truncating behind unknown rows', async () => {
    const f = await fixture(),
      next = await fixture()
    const prefix = `AdminPicker ${randomUUID()}`
    for (const item of [f, next]) {
      await db.venue.update({ where: { id: item.venue.id }, data: { name: prefix } })
      item.venue = await db.venue.findUniqueOrThrow({ where: { id: item.venue.id } })
    }
    await verifyVenue(next)
    const response = await http().get('/api/admin/venues', { params: { search: prefix, limit: 1 } })
    expect(response.data).toEqual({
      items: [
        {
          id: next.venue.id,
          name: prefix,
          address: next.venue.address,
          merchantName: next.merchant.name,
        },
      ],
      nextCursor: null,
    })
  })
  it('draft DTO distinguishes content readiness from unconfirmed physical approval readiness', async () => {
    const f = await fixture()
    await verifyVenue(f)
    await associate(f)
    const response = await http().get('/api/ingestion/drafts', { params: { limit: 50 } })
    const draft = response.data.items.find((row: { id: string }) => row.id === f.deal.id)
    expect({
      reviewReady: draft.reviewReady,
      approvalReady: draft.approvalReady,
      scopeStatus: draft.scopeStatus,
      physicalEligibilityReady: draft.physicalEligibilityReady,
    }).toEqual({
      reviewReady: true,
      approvalReady: false,
      scopeStatus: 'UNCONFIRMED',
      physicalEligibilityReady: false,
    })
  })
  it('draft DTO refuses physical readiness for source-confirmed but unverified selected geography', async () => {
    const f = await fixture()
    await verifyVenue(f)
    await associate(f)
    await confirmScope(f)
    await db.venue.update({
      where: { id: f.venue.id },
      data: { geographyEvidence: { unset: true } },
    })
    const response = await http().get('/api/ingestion/drafts', { params: { limit: 50 } })
    const draft = response.data.items.find((row: { id: string }) => row.id === f.deal.id)
    expect({
      reviewReady: draft.reviewReady,
      approvalReady: draft.approvalReady,
      scopeStatus: draft.scopeStatus,
      physicalEligibilityReady: draft.physicalEligibilityReady,
    }).toEqual({
      reviewReady: true,
      approvalReady: false,
      scopeStatus: 'SOURCE_CONFIRMED',
      physicalEligibilityReady: false,
    })
  })
  it('draft DTO displays bounded multi-outlet summaries with an honest full count', async () => {
    const f = await fixture()
    await verifyVenue(f)
    await associate(f)
    for (let i = 0; i < 20; i++) {
      const venue = await db.venue.create({
        data: {
          merchantId: f.merchant.id,
          name: `Synthetic branch ${i}`,
          address: 'Synthetic address',
          latitude: 1.3,
          longitude: 103.8,
        },
      })
      await db.dealVenue.create({ data: { dealId: f.deal.id, venueId: venue.id } })
    }
    const response = await http().get('/api/ingestion/drafts', { params: { limit: 50 } })
    const draft = response.data.items.find((row: { id: string }) => row.id === f.deal.id)
    expect({
      count: draft.outletCount,
      displayed: draft.outlets?.length,
      truncated: draft.outletsTruncated,
      single: draft.outlet,
      approval: draft.approvalReady,
    }).toEqual({ count: 21, displayed: 20, truncated: true, single: null, approval: false })
  })
  it('draft DTO withholds approval readiness when a confirmed physical source is disabled', async () => {
    const f = await fixture()
    await verifyVenue(f)
    await associate(f)
    await confirmScope(f)
    await db.importSource.update({ where: { id: f.source.id }, data: { enabled: false } })
    const response = await http().get('/api/ingestion/drafts', { params: { limit: 50 } })
    const draft = response.data.items.find((row: { id: string }) => row.id === f.deal.id)
    expect(draft.approvalReady).toBe(false)
  })
  it('draft DTO identifies exact legacy retention without granting fresh physical approval readiness', async () => {
    const f = await fixture()
    await verifyVenue(f)
    await associate(f)
    const confirmed = await confirmScope(f)
    await db.deal.update({
      where: { id: f.deal.id },
      data: {
        scopeConfirmation: {
          set: {
            ...required(confirmed.scopeConfirmation),
            basis: 'LEGACY_RETAINED',
            retainedVenueIds: [f.venue.id],
          },
        },
      },
    })
    const response = await http().get('/api/ingestion/drafts', { params: { limit: 50 } })
    const draft = response.data.items.find((row: { id: string }) => row.id === f.deal.id)
    expect({ status: draft.scopeStatus, approvalReady: draft.approvalReady }).toEqual({
      status: 'LEGACY_RETAINED',
      approvalReady: false,
    })
  })
  // Characterization/regression coverage for existing fences and the new fail-closed policy.
  it.each(['null', 'forged', 'stale', 'discovery', 'legacy'] as const)(
    'rejects %s occupancy for a new association without mutating source or draft',
    async (kind) => {
      const f = await fixture()
      const verified = await verifyVenue(f)
      if (kind === 'null')
        await db.venue.update({
          where: { id: f.venue.id },
          data: { occupancyEvidence: { set: null } },
        })
      if (kind === 'forged')
        await db.venue.update({
          where: { id: f.venue.id },
          data: {
            occupancyEvidence: {
              set: { ...required(verified.occupancyEvidence), subjectHash: 'forged' },
            },
          },
        })
      if (kind === 'stale')
        await db.venue.update({ where: { id: f.venue.id }, data: { address: 'Changed identity' } })
      if (kind === 'discovery')
        await db.venue.update({
          where: { id: f.venue.id },
          data: {
            occupancyEvidence: {
              set: { ...required(verified.occupancyEvidence), provider: 'GOOGLE_PLACES' },
            },
          },
        })
      if (kind === 'legacy')
        await db.venue.update({
          where: { id: f.venue.id },
          data: {
            occupancyEvidence: {
              set: {
                ...required(verified.occupancyEvidence),
                state: 'LEGACY_RETAINED',
                provider: 'DATABASE_SNAPSHOT',
              },
            },
          },
        })
      const before = await stored(f.deal.id)
      expect((await associate(f)).status).toBe(412)
      expect(await stored(f.deal.id)).toEqual(before)
    },
  )

  it.each(['stale-version', 'changed-edges', 'forged-hash', 'legacy'] as const)(
    'rejects %s scope for selected approval',
    async (kind) => {
      const f = await fixture()
      await verifyVenue(f)
      await associate(f)
      const confirmed = await confirmScope(f)
      if (kind === 'stale-version')
        await db.deal.update({
          where: { id: f.deal.id },
          data: {
            scopeConfirmation: {
              set: { ...required(confirmed.scopeConfirmation), contentVersion: 1 },
            },
          },
        })
      if (kind === 'forged-hash')
        await db.deal.update({
          where: { id: f.deal.id },
          data: {
            scopeConfirmation: {
              set: { ...required(confirmed.scopeConfirmation), scopeHash: 'forged' },
            },
          },
        })
      if (kind === 'legacy')
        await db.deal.update({
          where: { id: f.deal.id },
          data: {
            scopeConfirmation: {
              set: {
                ...required(confirmed.scopeConfirmation),
                basis: 'LEGACY_RETAINED',
                retainedVenueIds: [f.venue.id],
              },
            },
          },
        })
      if (kind === 'changed-edges') {
        const next = await fixture()
        await db.dealVenue.create({ data: { dealId: f.deal.id, venueId: next.venue.id } })
      }
      const before = await stored(f.deal.id)
      expect((await review(f, 2)).status).toBe(412)
      expect(await stored(f.deal.id)).toEqual(before)
      expect((await review(f, 2, 'REJECT')).status).toBe(200)
    },
  )

  it('approves a current source-confirmed exact selected set without changing its proof or citations', async () => {
    const f = await fixture()
    await verifyVenue(f)
    await associate(f)
    await confirmScope(f)
    const before = await stored(f.deal.id)
    expect((await review(f, 2)).status).toBe(200)
    const after = await stored(f.deal.id)
    expect(after).toMatchObject({
      reviewStatus: 'APPROVED',
      contentVersion: 2,
      reviewedVersion: 2,
      publishedAt: clock,
      scopeConfirmation: before.scopeConfirmation,
      sources: before.sources,
      venues: before.venues,
    })
  })

  it.each(['APPROVED', 'REJECTED'] as const)(
    'keeps already %s drafts immutable through association and review',
    async (reviewStatus) => {
      const f = await fixture()
      await verifyVenue(f)
      await db.deal.update({ where: { id: f.deal.id }, data: { reviewStatus } })
      const before = await stored(f.deal.id)
      expect((await associate(f)).status).toBe(409)
      expect((await review(f)).status).toBe(409)
      expect(await stored(f.deal.id)).toEqual(before)
    },
  )

  it('keeps native authorization, trusted Origin, strict proof-free requests and stale versions', async () => {
    const f = await fixture()
    await verifyVenue(f)
    const path = `/api/ingestion/drafts/${f.deal.id}/outlet`
    const input = { venueId: f.venue.id, expectedContentVersion: 1 }
    const before = await stored(f.deal.id)
    expect((await http('').patch(path, input)).status).toBe(401)
    expect((await http(member.cookie).patch(path, input)).status).toBe(403)
    expect((await http(admin.cookie, 'https://hostile.test').patch(path, input)).status).toBe(403)
    for (const extra of [{ verified: true }, { scopeConfirmation: {} }, { reviewReady: true }]) {
      expect((await http().patch(path, { ...input, ...extra })).status).toBe(400)
      expect(
        (
          await http().post(`/api/ingestion/drafts/${f.deal.id}/review`, {
            expectedContentVersion: 1,
            decision: 'APPROVE',
            note: 'Synthetic note',
            ...extra,
          })
        ).status,
      ).toBe(400)
    }
    expect((await associate(f, 2)).status).toBe(409)
    expect(await stored(f.deal.id)).toEqual(before)
  })

  it('preserves existing grant identity and account readback while excluding that unverified venue from new pickers', async () => {
    const f = await fixture()
    const grant = await db.stallGrant.create({ data: { userId: member.id, venueId: f.venue.id } })
    const response = await http().get(`/api/admin/accounts/${member.id}`)
    expect(response.data.grants).toContainEqual(
      expect.objectContaining({ id: grant.id, venueId: f.venue.id, venueName: f.venue.name }),
    )
    const picker = await http().get('/api/admin/venues', {
      params: { search: f.venue.name, limit: 100 },
    })
    expect(picker.data.items.map((row: { id: string }) => row.id)).not.toContain(f.venue.id)
    expect(await db.stallGrant.findUniqueOrThrow({ where: { id: grant.id } })).toEqual(grant)
  })

  it('replaces one selected outlet at a new pending version and removes old scope without source mutation', async () => {
    const f = await fixture(),
      next = await fixture()
    await verifyVenue(f)
    await verifyVenue(next)
    await associate(f)
    await confirmScope(f)
    const before = await stored(f.deal.id)
    expect((await associate(f, 2, next.venue.id)).status).toBe(200)
    const after = await stored(f.deal.id)
    expect(after).toMatchObject({
      contentVersion: 3,
      merchantId: next.merchant.id,
      reviewStatus: 'PENDING',
      reviewedVersion: null,
      reviewedAt: null,
      reviewedById: null,
      publishedAt: null,
      scopeConfirmation: null,
      sources: before.sources,
    })
    expect(after.venues.map((link) => link.venueId)).toEqual([next.venue.id])
  })

  it.each(['association', 'review'] as const)(
    'conflicts on committed role, source, version and venue identity races during %s',
    async (operation) => {
      const { PrismaClient } = await import('@broke-oclock/db')
      const concurrent = new PrismaClient({ datasourceUrl: fixtureDatabaseUrl })
      try {
        for (const target of [
          'user',
          'deal',
          'venue',
          'merchant',
          'importSource',
          'post',
        ] as const) {
          const f = await fixture()
          await verifyVenue(f)
          if (operation === 'review') {
            await associate(f)
            await confirmScope(f)
          }
          const before = await stored(f.deal.id)
          const transaction = db.$transaction.bind(db)
          let armed = true
          const hookTarget = target === 'post' ? 'deal' : target
          const spy = vi.spyOn(db, '$transaction').mockImplementation((callback, options) =>
            transaction(
              async (tx) =>
                callback(
                  new Proxy(tx, {
                    get(transaction, property, receiver) {
                      if (property !== hookTarget)
                        return Reflect.get(transaction, property, receiver)
                      return new Proxy(transaction[hookTarget], {
                        get(delegate, method, receiver) {
                          if (method !== (hookTarget === 'deal' ? 'findFirst' : 'findUnique'))
                            return Reflect.get(delegate, method, receiver)
                          return async (...args: unknown[]) => {
                            const value = await Reflect.apply(
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
                              if (target === 'deal')
                                await concurrent.deal.update({
                                  where: { id: f.deal.id },
                                  data: { contentVersion: { increment: 1 } },
                                })
                              if (target === 'venue')
                                await concurrent.venue.update({
                                  where: { id: f.venue.id },
                                  data: { address: 'Concurrent identity edit' },
                                })
                              if (target === 'merchant')
                                await concurrent.merchant.update({
                                  where: { id: f.merchant.id },
                                  data: { deletedAt: clock },
                                })
                              if (target === 'importSource')
                                await concurrent.importSource.update({
                                  where: { id: f.source.id },
                                  data: { enabled: false },
                                })
                              if (target === 'post')
                                await concurrent.importedPost.update({
                                  where: { id: f.post.id },
                                  data: { contentHash: 'concurrent-evidence-change' },
                                })
                            }
                            return value
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
            const result = operation === 'review' ? await review(f, 2) : await associate(f)
            expect(result.status, `${operation}:${target}`).toBe(409)
            const after = await stored(f.deal.id)
            expect(after).toEqual({
              ...before,
              ...(target === 'deal'
                ? { contentVersion: before.contentVersion + 1, updatedAt: after.updatedAt }
                : {}),
            })
          } finally {
            spy.mockRestore()
            await concurrent.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
          }
        }
      } finally {
        await concurrent.$disconnect()
      }
    },
  )

  it('refuses a direct-ID new merchant request for unverified occupancy', async () => {
    const f = await fixture()
    const response = await http(member.cookie).post('/api/account/merchant-requests', {
      venueId: f.venue.id,
      message: 'Synthetic request bypassing picker',
    })
    expect(response.status).toBe(412)
  })
  it('refuses a direct-ID new stall grant for unverified occupancy', async () => {
    const f = await fixture()
    const target = member
    const user = await db.user.update({ where: { id: target.id }, data: { role: 'MERCHANT' } })
    const response = await http().post('/api/admin/stall-grants', {
      userId: user.id,
      venueId: f.venue.id,
      expectedUserVersion: user.platformVersion ?? 0,
      note: 'Synthetic direct-ID grant',
    })
    expect(response.status).toBe(412)
  })
  it('refuses approval of an existing pending merchant request after occupancy proof disappears', async () => {
    const f = await fixture()
    await verifyVenue(f)
    const requested = await http(member.cookie).post('/api/account/merchant-requests', {
      venueId: f.venue.id,
      message: 'Synthetic verified request',
    })
    await db.venue.update({
      where: { id: f.venue.id },
      data: { occupancyEvidence: { unset: true } },
    })
    const response = await http().post(`/api/admin/merchant-requests/${requested.data.id}/review`, {
      expectedVersion: requested.data.version,
      decision: 'APPROVE',
      note: 'Synthetic review',
    })
    expect(response.status).toBe(412)
  })
  it.each(['request', 'grant', 'reactivate', 'approve-request'] as const)(
    'blocks direct-ID %s for missing, legacy and stale occupancy without role/grant/audit mutation',
    async (operation) => {
      for (const kind of ['missing', 'legacy', 'stale'] as const) {
        const f = await fixture()
        const target = member
        const verified = await verifyVenue(f)
        let request: { id: string; version: number } | undefined
        if (operation === 'approve-request') {
          const submitted = await http(target.cookie).post('/api/account/merchant-requests', {
            venueId: f.venue.id,
            message: 'Synthetic originally verified request',
          })
          expect(submitted.status).toBe(201)
          request = submitted.data
        }
        if (operation === 'grant' || operation === 'reactivate')
          await db.user.update({ where: { id: target.id }, data: { role: 'MERCHANT' } })
        const oldGrant =
          operation === 'reactivate'
            ? await db.stallGrant.create({
                data: { userId: target.id, venueId: f.venue.id, revokedAt: clock, version: 7 },
              })
            : null
        if (kind === 'missing')
          await db.venue.update({
            where: { id: f.venue.id },
            data: { occupancyEvidence: { unset: true } },
          })
        if (kind === 'legacy')
          await db.venue.update({
            where: { id: f.venue.id },
            data: {
              occupancyEvidence: {
                set: {
                  ...required(verified.occupancyEvidence),
                  state: 'LEGACY_RETAINED',
                  provider: 'DATABASE_SNAPSHOT',
                },
              },
            },
          })
        if (kind === 'stale')
          await db.venue.update({
            where: { id: f.venue.id },
            data: { address: 'Identity changed since proof' },
          })
        const before = await db.user.findUniqueOrThrow({ where: { id: target.id } })
        const auditCount = await db.platformAudit.count({ where: { targetUserId: target.id } })
        const response =
          operation === 'request'
            ? await http(target.cookie).post('/api/account/merchant-requests', {
                venueId: f.venue.id,
                message: 'Synthetic direct-ID new request',
              })
            : operation === 'approve-request'
              ? await http().post(`/api/admin/merchant-requests/${required(request).id}/review`, {
                  expectedVersion: required(request).version,
                  decision: 'APPROVE',
                  note: 'Synthetic pending request review',
                })
              : await http().post('/api/admin/stall-grants', {
                  userId: target.id,
                  venueId: f.venue.id,
                  expectedUserVersion: before.platformVersion ?? 0,
                  note: 'Synthetic direct-ID grant',
                })
        expect(response.status, `${operation}:${kind}`).toBe(412)
        expect(await db.user.findUniqueOrThrow({ where: { id: target.id } })).toEqual(before)
        expect(await db.platformAudit.count({ where: { targetUserId: target.id } })).toBe(
          auditCount,
        )
        expect(
          await db.stallGrant.findUnique({
            where: { userId_venueId: { userId: target.id, venueId: f.venue.id } },
          }),
        ).toEqual(oldGrant)
        if (request)
          expect(
            await db.merchantAccessRequest.findUniqueOrThrow({ where: { id: request.id } }),
          ).toMatchObject({ status: 'PENDING', version: request.version })
      }
    },
  )

  it('retains active legacy grant capability and revocation while verified direct-ID requests, grants and reactivation succeed', async () => {
    const f = await fixture()
    await verifyVenue(f)
    const target = member
    await db.venue.update({
      where: { id: f.venue.id },
      data: { geographyEvidence: { unset: true } },
    })
    const submitted = await http(target.cookie).post('/api/account/merchant-requests', {
      venueId: f.venue.id,
      message: 'Synthetic verified request',
    })
    expect(submitted.status).toBe(201)
    expect(
      (
        await http().post(`/api/admin/merchant-requests/${submitted.data.id}/review`, {
          expectedVersion: submitted.data.version,
          decision: 'APPROVE',
          note: 'Synthetic verified approval',
        })
      ).status,
    ).toBe(200)
    let user = await db.user.findUniqueOrThrow({ where: { id: target.id } })
    expect(user.role).toBe('MERCHANT')
    const grant = await db.stallGrant.findUniqueOrThrow({
      where: { userId_venueId: { userId: target.id, venueId: f.venue.id } },
    })
    await db.venue.update({
      where: { id: f.venue.id },
      data: { occupancyEvidence: { unset: true } },
    })
    const { requireMerchantStall } = await import('@api/modules/platform-admin/capability')
    await db.$transaction((tx) => requireMerchantStall(tx, target.id, f.venue.id))
    expect((await http().get(`/api/admin/accounts/${target.id}`)).data.grants).toContainEqual(
      expect.objectContaining({ id: grant.id }),
    )
    expect(
      (
        await http().delete(`/api/admin/stall-grants/${grant.id}`, {
          data: {
            expectedVersion: grant.version,
            note: 'Synthetic revoke without occupancy proof',
          },
        })
      ).status,
    ).toBe(200)
    const revoked = await db.stallGrant.findUniqueOrThrow({ where: { id: grant.id } })
    expect(revoked.revokedAt).not.toBeNull()
    await verifyVenue(f)
    user = await db.user.findUniqueOrThrow({ where: { id: target.id } })
    expect(
      (
        await http().post('/api/admin/stall-grants', {
          userId: target.id,
          venueId: f.venue.id,
          expectedUserVersion: user.platformVersion ?? 0,
          note: 'Synthetic verified reactivation',
        })
      ).status,
    ).toBe(200)
    expect(await db.stallGrant.findUniqueOrThrow({ where: { id: grant.id } })).toMatchObject({
      id: grant.id,
      version: revoked.version + 1,
      revokedAt: null,
    })
    const next = await fixture()
    await verifyVenue(next)
    user = await db.user.findUniqueOrThrow({ where: { id: target.id } })
    expect(
      (
        await http().post('/api/admin/stall-grants', {
          userId: target.id,
          venueId: next.venue.id,
          expectedUserVersion: user.platformVersion ?? 0,
          note: 'Synthetic verified new grant',
        })
      ).status,
    ).toBe(200)
  })

  it('preserves rejection of old pending requests after occupancy becomes unknown', async () => {
    const f = await fixture()
    await verifyVenue(f)
    const target = member
    const submitted = await http(target.cookie).post('/api/account/merchant-requests', {
      venueId: f.venue.id,
      message: 'Synthetic request',
    })
    await db.venue.update({
      where: { id: f.venue.id },
      data: { occupancyEvidence: { unset: true } },
    })
    expect(
      (
        await http().post(`/api/admin/merchant-requests/${submitted.data.id}/review`, {
          expectedVersion: submitted.data.version,
          decision: 'REJECT',
          note: 'Synthetic rejection without proof',
        })
      ).status,
    ).toBe(200)
    expect(
      await db.merchantAccessRequest.findUniqueOrThrow({ where: { id: submitted.data.id } }),
    ).toMatchObject({ status: 'REJECTED' })
    expect(await db.stallGrant.count({ where: { userId: target.id, venueId: f.venue.id } })).toBe(0)
  })

  it('paginates past stale positive enums without claiming that verified catalogue is exhausted', async () => {
    const f = await fixture()
    const prefix = `BoundedPicker ${randomUUID()}`
    const staleProof = {
      state: 'VERIFIED' as const,
      provider: 'OFFICIAL_MERCHANT' as const,
      reference: 'Synthetic stale receipt',
      subjectHash: 'wrong-subject',
      verifiedAt: clock,
    }
    await db.venue.createMany({
      data: Array.from({ length: 201 }, (_, i) => ({
        merchantId: f.merchant.id,
        name: `${prefix} aa stale ${i}`,
        address: 'Stale identity',
        latitude: 1.3,
        longitude: 103.8,
        geographyPrecision: 'PROPERTY' as const,
        occupancyEvidence: staleProof,
      })),
    })
    const next = await fixture()
    await db.venue.update({ where: { id: next.venue.id }, data: { name: `${prefix} zz verified` } })
    next.venue = await db.venue.findUniqueOrThrow({ where: { id: next.venue.id } })
    await verifyVenue(next)
    const first = await http().get('/api/admin/venues', { params: { search: prefix, limit: 1 } })
    expect(first.data.items).toEqual([])
    expect(first.data.nextCursor).toMatch(/^[a-f0-9]{24}$/)
    const second = await http().get('/api/admin/venues', {
      params: { search: prefix, limit: 1, cursor: first.data.nextCursor },
    })
    expect(second.data.items.map((row: { id: string }) => row.id)).toEqual([next.venue.id])
    expect(second.data.nextCursor).toBeNull()
    const account = await http(member.cookie).get('/api/account/venues', {
      params: { search: prefix },
    })
    expect(account.data.map((row: { id: string }) => row.id)).toEqual([next.venue.id])
  })

  it.each(['request', 'grant', 'approve-request'] as const)(
    'conflicts on a separately committed identity/proof edit during direct-ID %s',
    async (operation) => {
      const f = await fixture()
      await verifyVenue(f)
      if (operation === 'grant')
        await db.user.update({ where: { id: member.id }, data: { role: 'MERCHANT' } })
      let requested: { id: string; version: number } | undefined
      if (operation === 'approve-request') {
        const submitted = await http(member.cookie).post('/api/account/merchant-requests', {
          venueId: f.venue.id,
          message: 'Synthetic verified request',
        })
        expect(submitted.status).toBe(201)
        requested = submitted.data
      }
      const before = await db.user.findUniqueOrThrow({ where: { id: member.id } })
      const auditCount = await db.platformAudit.count({ where: { targetUserId: member.id } })
      const { PrismaClient } = await import('@broke-oclock/db')
      const concurrent = new PrismaClient({ datasourceUrl: fixtureDatabaseUrl })
      const transaction = db.$transaction.bind(db)
      let armed = true
      const spy = vi.spyOn(db, '$transaction').mockImplementation((callback, options) =>
        transaction(
          async (tx) =>
            callback(
              new Proxy(tx, {
                get(transaction, property, receiver) {
                  if (property !== 'venue') return Reflect.get(transaction, property, receiver)
                  return new Proxy(transaction.venue, {
                    get(delegate, method, receiver) {
                      if (method !== 'findUnique') return Reflect.get(delegate, method, receiver)
                      return async (...args: Parameters<typeof delegate.findUnique>) => {
                        const value = await delegate.findUnique(...args)
                        if (armed) {
                          armed = false
                          await concurrent.venue.update({
                            where: { id: f.venue.id },
                            data: { address: 'Concurrent proof-invalidating identity' },
                          })
                        }
                        return value
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
        const result =
          operation === 'request'
            ? await http(member.cookie).post('/api/account/merchant-requests', {
                venueId: f.venue.id,
                message: 'Synthetic direct-ID request',
              })
            : operation === 'grant'
              ? await http().post('/api/admin/stall-grants', {
                  userId: member.id,
                  venueId: f.venue.id,
                  expectedUserVersion: before.platformVersion ?? 0,
                  note: 'Synthetic concurrent grant',
                })
              : await http().post(`/api/admin/merchant-requests/${required(requested).id}/review`, {
                  expectedVersion: required(requested).version,
                  decision: 'APPROVE',
                  note: 'Synthetic concurrent approval',
                })
        expect(result.status).toBe(409)
        expect(armed).toBe(false)
        expect(await db.user.findUniqueOrThrow({ where: { id: member.id } })).toEqual(before)
        expect(await db.platformAudit.count({ where: { targetUserId: member.id } })).toBe(
          auditCount,
        )
        expect(
          await db.stallGrant.count({ where: { userId: member.id, venueId: f.venue.id } }),
        ).toBe(0)
        if (requested)
          expect(
            await db.merchantAccessRequest.findUniqueOrThrow({ where: { id: requested.id } }),
          ).toMatchObject({ status: 'PENDING', version: requested.version })
      } finally {
        spy.mockRestore()
        await concurrent.$disconnect()
      }
    },
  )

  it('account picker refuses an exhausted scan budget explicitly rather than reporting no verified results', async () => {
    const f = await fixture()
    const prefix = `ScanBudget ${randomUUID()}`
    await db.venue.createMany({
      data: Array.from({ length: 1000 }, (_, i) => ({
        merchantId: f.merchant.id,
        name: `${prefix} aa stale ${i}`,
        address: 'Stale identity',
        latitude: 1.3,
        longitude: 103.8,
        geographyPrecision: 'PROPERTY' as const,
        occupancyEvidence: {
          state: 'VERIFIED' as const,
          provider: 'OFFICIAL_MERCHANT' as const,
          reference: 'Synthetic stale receipt',
          subjectHash: 'wrong',
          verifiedAt: clock,
        },
      })),
    })
    const response = await http(member.cookie).get('/api/account/venues', {
      params: { search: prefix },
    })
    expect({ status: response.status, message: response.data.error?.message }).toEqual({
      status: 412,
      message: 'Verified catalogue search is incomplete; narrow the search and retry.',
    })
  })
  it('approves source-confirmed ALL only through current verified physical and source authority', async () => {
    const f = await fixture()
    await verifyVenue(f)
    await db.deal.update({
      where: { id: f.deal.id },
      data: { merchantId: f.merchant.id, applicability: 'ALL_MERCHANT_OUTLETS' },
    })
    const confirmed = await confirmScope(f)
    const response = await review(f)
    const after = await stored(f.deal.id)
    expect({
      status: response.status,
      review: after.reviewStatus,
      publishedAt: after.publishedAt,
      scope: after.scopeConfirmation,
    }).toEqual({
      status: 200,
      review: 'APPROVED',
      publishedAt: clock,
      scope: confirmed.scopeConfirmation,
    })
  })
  it('refuses association to a catalogue row with missing occupancy proof', async () => {
    const f = await fixture()
    expect((await associate(f)).status).toBe(412)
  })
})
