import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import {
  geographySubjectHash,
  hasConfirmedOutletScope,
  hasVerifiedGeography,
  hasVerifiedOccupancy,
  occupancySubjectHash,
  outletScopeHash,
} from '@api/modules/deals/outlet-eligibility'
import type { OutletScopeConfirmation, OutletVerificationEvidence } from '@broke-oclock/db/client'
import { Prisma, PrismaClient } from '@broke-oclock/db/constructor'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

const required = <Value>(value: Value | null | undefined): Value => {
  if (value == null) throw new Error('Missing required disposable fixture value')
  return value
}

const root = fileURLToPath(new URL('../../../../', import.meta.url))
let mongo: MongoMemoryReplSet | undefined
let db: PrismaClient | undefined
const client = () => {
  if (!db) throw new Error('Disposable client not initialized')
  return db
}
const venueData = (merchantId: string) => ({
  merchantId,
  name: 'SYNTHETIC outlet — not a real listing',
  address: 'SYNTHETIC fixture address',
  latitude: 12.3,
  longitude: -45.6,
})
const dealData = () => ({
  title: 'SYNTHETIC campaign',
  description: 'Disposable fixture, not source evidence',
  category: 'fixture',
  offerType: 'OTHER' as const,
  applicability: 'NO_FIXED_LOCATION' as const,
})

const evidence = (subjectHash: string): OutletVerificationEvidence => ({
  state: 'VERIFIED',
  provider: 'OFFICIAL_PROPERTY',
  reference: 'SYNTHETIC fixture receipt — no real-world verification',
  subjectHash,
  sourceUrl: 'https://example.test/synthetic-only',
  sourceContentHash: 'a'.repeat(64),
  observedAt: new Date('2026-01-01T01:02:03.004Z'),
  verifiedAt: new Date('2026-01-02T03:04:05.006Z'),
})
const confirmation = (
  contentVersion: number,
  retainedVenueIds: string[],
): OutletScopeConfirmation => ({
  basis: 'LEGACY_RETAINED',
  contentVersion,
  scopeHash: 'b'.repeat(64),
  evidenceRef: 'SYNTHETIC campaign receipt — no real-world verification',
  retainedVenueIds,
  sourceContentHash: null,
  sourceUrl: null,
  confirmedAt: null,
  reasonCode: 'SYNTHETIC_BASELINE_ONLY',
})
const rawRows = async (command: Prisma.InputJsonObject) => {
  const result = await client().$runCommandRaw(command)
  return z
    .object({ cursor: z.object({ firstBatch: z.array(z.record(z.string(), z.unknown())) }) })
    .parse(result).cursor.firstBatch
}

beforeAll(async () => {
  // Never download a binary or inherit an application datasource.
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const databaseUrl = mongo.getUri(`outlet_evidence_${randomUUID().replaceAll('-', '')}`)
  if (!databaseUrl.startsWith('mongodb://127.0.0.1:')) throw new Error('Non-loopback fixture URI')
  await promisify(execFile)('pnpm', ['--dir', 'packages/db', 'run', 'push', '--skip-generate'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    timeout: 60_000,
  })
  db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
}, 180_000)

afterAll(async () => {
  try {
    await db?.$disconnect()
  } finally {
    await mongo?.stop()
  }
})

describe('additive outlet evidence on a disposable Mongo replica', () => {
  it('reads omitted and explicit-null metadata as unknown with no positive defaults', async () => {
    const merchant = await client().merchant.create({ data: { name: 'SYNTHETIC merchant' } })
    const venue = await client().venue.create({ data: venueData(merchant.id) })
    const deal = await client().deal.create({ data: dealData() })
    const stored = await client().venue.findUniqueOrThrow({ where: { id: venue.id } })
    expect(stored).toMatchObject({
      catalogueKey: null,
      geographyEvidence: null,
      geographyPrecision: null,
      occupancyEvidence: null,
    })
    expect(deal).toMatchObject({ scopeConfirmation: null })
    const raw = await rawRows({ find: 'Venue', filter: { _id: { $oid: venue.id } } })
    expect(raw[0]).not.toHaveProperty('geographyEvidence')
    const explicit = await client().venue.create({
      data: {
        ...venueData(merchant.id),
        catalogueKey: null,
        geographyEvidence: null,
        geographyPrecision: null,
        occupancyEvidence: null,
      },
    })
    expect(explicit.geographyEvidence).toBeNull()
    expect(explicit.occupancyEvidence).toBeNull()
    const explicitRaw = await rawRows({ find: 'Venue', filter: { _id: { $oid: explicit.id } } })
    expect(explicitRaw[0]).toMatchObject({
      catalogueKey: null,
      geographyEvidence: null,
      geographyPrecision: null,
      occupancyEvidence: null,
    })
    const explicitDeal = await client().deal.create({
      data: { ...dealData(), scopeConfirmation: null },
    })
    expect(explicitDeal.scopeConfirmation).toBeNull()
    const scopeRaw = await rawRows({ find: 'Deal', filter: { _id: { $oid: explicitDeal.id } } })
    expect(scopeRaw[0]).toHaveProperty('scopeConfirmation', null)
    expect(hasConfirmedOutletScope({ ...explicitDeal, selectedVenueIds: [] })).toBe(false)
  })

  // Characterization after the additive schema tracer bullet; not claimed as feature REDs.
  it('round-trips typed composites with native dates and retained native ObjectId arrays', async () => {
    const merchant = await client().merchant.create({
      data: { name: 'SYNTHETIC composite merchant' },
    })
    const created = await client().venue.create({
      data: {
        ...venueData(merchant.id),
        catalogueKey: 'synthetic:outlet:composite',
        geographyPrecision: 'PROPERTY',
      },
    })
    const geo = evidence(geographySubjectHash(created))
    const occupancy = evidence(occupancySubjectHash(created))
    await client().venue.update({
      where: { id: created.id },
      data: { geographyEvidence: geo, occupancyEvidence: occupancy },
    })
    const stored = await client().venue.findUniqueOrThrow({ where: { id: created.id } })
    expect(stored.geographyEvidence).toEqual(geo)
    expect(stored.occupancyEvidence).toEqual(occupancy)
    expect(hasVerifiedGeography(stored)).toBe(true)
    expect(hasVerifiedOccupancy(stored)).toBe(true)
    const campaign = await client().deal.create({
      data: {
        ...dealData(),
        merchantId: merchant.id,
        applicability: 'SELECTED_OUTLETS',
        contentVersion: 9,
      },
    })
    const scope = {
      ...confirmation(9, [stored.id]),
      scopeHash: outletScopeHash({ ...campaign, selectedVenueIds: [stored.id] }),
      confirmedAt: new Date('2026-01-03T04:05:06.007Z'),
    }
    await client().deal.update({ where: { id: campaign.id }, data: { scopeConfirmation: scope } })
    expect(
      (await client().deal.findUniqueOrThrow({ where: { id: campaign.id } })).scopeConfirmation,
    ).toEqual(scope)
    const types = await rawRows({
      aggregate: 'Deal',
      pipeline: [
        { $match: { _id: { $oid: campaign.id } } },
        {
          $project: {
            _id: 0,
            retainedType: { $type: { $arrayElemAt: ['$scopeConfirmation.retainedVenueIds', 0] } },
            versionType: { $type: '$scopeConfirmation.contentVersion' },
            confirmedType: { $type: '$scopeConfirmation.confirmedAt' },
          },
        },
      ],
      cursor: {},
    })
    expect(types).toEqual([
      { retainedType: 'objectId', versionType: 'long', confirmedType: 'date' },
    ])
    const dateTypes = await rawRows({
      aggregate: 'Venue',
      pipeline: [
        { $match: { _id: { $oid: stored.id } } },
        {
          $project: {
            _id: 0,
            observed: { $type: '$geographyEvidence.observedAt' },
            verified: { $type: '$occupancyEvidence.verifiedAt' },
            provider: { $type: '$geographyEvidence.provider' },
          },
        },
      ],
      cursor: {},
    })
    expect(dateTypes).toEqual([{ observed: 'date', verified: 'date', provider: 'string' }])
  })

  it('round-trips every native evidence enum without positive coercion or defaults', async () => {
    const merchant = await client().merchant.create({ data: { name: 'SYNTHETIC enum merchant' } })
    const v = await client().venue.create({ data: venueData(merchant.id) })
    for (const state of ['UNVERIFIED', 'VERIFIED', 'LEGACY_RETAINED'] as const) {
      for (const provider of [
        'DATABASE_SNAPSHOT',
        'ONEMAP',
        'GOOGLE_PLACES',
        'OFFICIAL_MERCHANT',
        'OFFICIAL_PROPERTY',
        'ADMIN',
      ] as const) {
        const saved = await client().venue.update({
          where: { id: v.id },
          data: { geographyEvidence: { ...evidence('c'.repeat(64)), state, provider } },
        })
        expect(saved.geographyEvidence).toMatchObject({ state, provider })
      }
    }
    for (const geographyPrecision of ['UNKNOWN', 'PROPERTY', 'OUTLET'] as const) {
      expect(
        (await client().venue.update({ where: { id: v.id }, data: { geographyPrecision } }))
          .geographyPrecision,
      ).toBe(geographyPrecision)
    }
    const d = await client().deal.create({ data: dealData() })
    for (const basis of [
      'UNCONFIRMED',
      'SOURCE_SELECTED',
      'SOURCE_ALL',
      'SOURCE_NONSPATIAL',
      'LEGACY_RETAINED',
    ] as const) {
      const updated = await client().deal.update({
        where: { id: d.id },
        data: { scopeConfirmation: { ...confirmation(1, []), basis } },
      })
      expect(updated.scopeConfirmation?.basis).toBe(basis)
    }
    const unknown = await client().venue.update({
      where: { id: v.id },
      data: {
        geographyEvidence: {
          state: 'UNVERIFIED',
          provider: 'DATABASE_SNAPSHOT',
          reference: 'SYNTHETIC unknown receipt',
          subjectHash: 'unknown',
        },
      },
    })
    expect(unknown.geographyEvidence).toMatchObject({
      observedAt: null,
      verifiedAt: null,
      sourceUrl: null,
      sourceContentHash: null,
    })
    expect(hasVerifiedGeography(unknown)).toBe(false)
    const unconfirmed = await client().deal.update({
      where: { id: d.id },
      data: {
        scopeConfirmation: {
          ...confirmation(1, []),
          basis: 'UNCONFIRMED',
          reasonCode: 'SYNTHETIC_UNKNOWN',
        },
      },
    })
    expect(hasConfirmedOutletScope({ ...unconfirmed, selectedVenueIds: [] })).toBe(false)
  })

  it('keeps catalogueKey nonunique for duplicate, missing and explicit-null old rows', async () => {
    const merchant = await client().merchant.create({ data: { name: 'SYNTHETIC index merchant' } })
    for (const fields of [
      {},
      {},
      { catalogueKey: null },
      { catalogueKey: null },
      { catalogueKey: 'synthetic:duplicate' },
      { catalogueKey: 'synthetic:duplicate' },
    ]) {
      await client().venue.create({ data: { ...venueData(merchant.id), ...fields } })
    }
    expect(await client().venue.count({ where: { merchantId: merchant.id } })).toBe(6)
    const indexes = await rawRows({ listIndexes: 'Venue' })
    const catalogue = indexes.filter(
      (index) => (index.key as Record<string, unknown>).catalogueKey === 1,
    )
    expect(catalogue).toHaveLength(1)
    expect(catalogue[0]?.unique ?? false).toBe(false)
    expect(indexes.map((index) => index.name)).toEqual(
      expect.arrayContaining([
        '_id_',
        'Venue_merchantId_name_idx',
        'Venue_latitude_longitude_idx',
        'Venue_area_idx',
      ]),
    )
  })

  it('has exactly five optional model fields, two typed composites and no positive defaults', () => {
    const venueModel = required(Prisma.dmmf.datamodel.models.find(({ name }) => name === 'Venue'))
    const dealModel = required(Prisma.dmmf.datamodel.models.find(({ name }) => name === 'Deal'))
    for (const [model, names] of [
      [
        venueModel,
        ['catalogueKey', 'geographyEvidence', 'geographyPrecision', 'occupancyEvidence'],
      ],
      [dealModel, ['scopeConfirmation']],
    ] as const) {
      for (const name of names) {
        const field = model.fields.find((candidate) => candidate.name === name)
        expect(field).toMatchObject({ isRequired: false, hasDefaultValue: false, isUnique: false })
      }
    }
    expect(Prisma.dmmf.datamodel.types.map(({ name }) => name).sort()).toEqual([
      'OutletScopeConfirmation',
      'OutletVerificationEvidence',
    ])
    for (const composite of Prisma.dmmf.datamodel.types) {
      expect(composite.fields.every((field) => !field.hasDefaultValue)).toBe(true)
    }
    const scope = required(
      Prisma.dmmf.datamodel.types.find(({ name }) => name === 'OutletScopeConfirmation'),
    )
    expect(scope.fields.find(({ name }) => name === 'retainedVenueIds')).toMatchObject({
      isList: true,
      isRequired: true,
    })
  })

  it('commits only explicit metadata fields while preserving all core content, edges, versions and timestamps', async () => {
    const merchant = await client().merchant.create({
      data: { name: 'SYNTHETIC exact-write merchant' },
    })
    const v = await client().venue.create({ data: venueData(merchant.id) })
    const d = await client().deal.create({
      data: {
        ...dealData(),
        merchantId: merchant.id,
        applicability: 'SELECTED_OUTLETS',
        reviewStatus: 'APPROVED',
        contentVersion: 4,
        reviewedVersion: 4,
        publishedAt: new Date('2026-01-01T00:00:00Z'),
        venues: { create: { venueId: v.id } },
      },
    })
    const before = await rawRows({ find: 'Venue', filter: { _id: { $oid: v.id } } })
    const beforeDeal = await rawRows({ find: 'Deal', filter: { _id: { $oid: d.id } } })
    const beforeEdges = await client().dealVenue.findMany({ where: { dealId: d.id } })
    await client().$transaction(async (tx) => {
      await tx.venue.update({
        where: { id: v.id },
        data: {
          catalogueKey: 'synthetic:metadata-only',
          geographyPrecision: 'UNKNOWN',
          geographyEvidence: { ...evidence('d'.repeat(64)), state: 'UNVERIFIED', verifiedAt: null },
          occupancyEvidence: null,
          updatedAt: v.updatedAt,
        },
      })
      await tx.deal.update({
        where: { id: d.id },
        data: {
          scopeConfirmation: {
            ...confirmation(4, []),
            basis: 'UNCONFIRMED',
            reasonCode: 'SYNTHETIC_HOLD',
          },
          updatedAt: d.updatedAt,
        },
      })
    })
    const after = await rawRows({ find: 'Venue', filter: { _id: { $oid: v.id } } })
    const afterDeal = await rawRows({ find: 'Deal', filter: { _id: { $oid: d.id } } })
    const { catalogueKey, geographyPrecision, geographyEvidence, occupancyEvidence, ...coreVenue } =
      required(after[0])
    const { scopeConfirmation, ...coreDeal } = required(afterDeal[0])
    expect(coreVenue).toEqual(before[0])
    expect(coreDeal).toEqual(beforeDeal[0])
    expect({
      catalogueKey,
      geographyPrecision,
      geographyEvidence,
      occupancyEvidence,
    }).toMatchObject({
      catalogueKey: 'synthetic:metadata-only',
      geographyPrecision: 'UNKNOWN',
      geographyEvidence: { state: 'UNVERIFIED' },
      occupancyEvidence: null,
    })
    expect(scopeConfirmation).toMatchObject({
      basis: 'UNCONFIRMED',
      contentVersion: 4,
      reasonCode: 'SYNTHETIC_HOLD',
    })
    expect(await client().dealVenue.findMany({ where: { dealId: d.id } })).toEqual(beforeEdges)
  })

  it('rolls back both composite metadata writes in a real multi-record transaction', async () => {
    const merchant = await client().merchant.create({
      data: { name: 'SYNTHETIC rollback merchant' },
    })
    const v = await client().venue.create({ data: venueData(merchant.id) })
    const d = await client().deal.create({ data: dealData() })
    await expect(
      client().$transaction(async (tx) => {
        await tx.venue.update({
          where: { id: v.id },
          data: {
            geographyEvidence: evidence('e'.repeat(64)),
            catalogueKey: 'synthetic:rolled-back',
          },
        })
        await tx.deal.update({
          where: { id: d.id },
          data: { scopeConfirmation: confirmation(1, []) },
        })
        throw new Error('SYNTHETIC intentional rollback')
      }),
    ).rejects.toThrow('SYNTHETIC intentional rollback')
    expect(await client().venue.findUniqueOrThrow({ where: { id: v.id } })).toEqual(v)
    expect(await client().deal.findUniqueOrThrow({ where: { id: d.id } })).toEqual(d)
  })
})
