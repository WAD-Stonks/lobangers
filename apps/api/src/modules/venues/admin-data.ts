import {
  hasVerifiedGeography,
  hasVerifiedOccupancy,
  isSelectableCatalogueVenue,
} from '@api/modules/deals/outlet-eligibility'
import { DomainError } from '@api/modules/domain-error'
import { legacyVersionWhere, normalizeVersion } from '@api/modules/platform-admin/operation-version'
import {
  type AccessTransaction,
  conflict,
  type Database,
} from '@api/modules/platform-admin/transaction'

type MerchantRow = Awaited<ReturnType<Database['merchant']['findUniqueOrThrow']>> & {
  _count: { venues: number; deals: number }
}
type VenueRow = Awaited<ReturnType<Database['venue']['findUniqueOrThrow']>> & {
  merchant: Awaited<ReturnType<Database['merchant']['findUniqueOrThrow']>>
  _count: { deals: number }
}

import type {
  catalogueMerchantsQuerySchema,
  catalogueVenuesQuerySchema,
} from '@broke-oclock/contracts/admin-catalogue'
import type { z } from 'zod'

type Reader = Database | AccessTransaction
export const activeCatalogue = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] }
const merchantInclude = { _count: { select: { venues: true, deals: true } } } as const
const venueInclude = { merchant: true, _count: { select: { deals: true } } } as const
const merchantView = (row: MerchantRow) => ({
  id: row.id,
  name: row.name,
  version: normalizeVersion(row.catalogueVersion),
  archived: row.deletedAt != null,
  venueCount: row._count.venues,
  dealCount: row._count.deals,
})
const venueView = async (db: Reader, row: VenueRow) => ({
  id: row.id,
  merchantId: row.merchantId,
  merchantName: row.merchant.name,
  parentArchived: row.merchant.deletedAt != null,
  name: row.name,
  address: row.address,
  postalCode: row.postalCode,
  area: row.area,
  latitude: row.latitude,
  longitude: row.longitude,
  imageUrl: row.imageUrl,
  geographyPrecision: row.geographyPrecision,
  catalogueKey: row.catalogueKey,
  version: normalizeVersion(row.catalogueVersion),
  archived: row.deletedAt != null,
  selectable: row.merchant.deletedAt == null && isSelectableCatalogueVenue(row),
  geographyVerified: hasVerifiedGeography(row),
  occupancyVerified: hasVerifiedOccupancy(row),
  geographyState: row.geographyEvidence?.state ?? 'UNVERIFIED',
  occupancyState: row.occupancyEvidence?.state ?? 'UNVERIFIED',
  dealCount: row._count.deals,
  grantCount: await db.stallGrant.count({ where: { venueId: row.id } }),
  requestCount: await db.merchantAccessRequest.count({ where: { venueId: row.id } }),
})
const statusWhere = (status: 'active' | 'archived' | 'all') =>
  status === 'active' ? activeCatalogue : status === 'archived' ? { deletedAt: { not: null } } : {}
const page = <T extends { id: string }>(rows: T[], limit: number) => ({
  items: rows.slice(0, limit),
  nextCursor: rows.length > limit ? (rows[limit - 1]?.id ?? null) : null,
})
export const listCatalogueMerchants = async (
  db: Reader,
  query: z.output<typeof catalogueMerchantsQuerySchema>,
) => {
  const rows = await db.merchant.findMany({
    where: {
      ...statusWhere(query.status),
      ...(query.cursor ? { id: { gt: query.cursor } } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    },
    orderBy: { id: 'asc' },
    take: query.limit + 1,
    include: merchantInclude,
  })
  return page(rows.map(merchantView), query.limit)
}
export const getCatalogueMerchant = async (db: Reader, id: string) => {
  const row = await db.merchant.findUnique({ where: { id }, include: merchantInclude })
  if (!row) throw new DomainError('NOT_FOUND', 'Merchant not found')
  return merchantView(row)
}
export const listCatalogueVenues = async (
  db: Reader,
  query: z.output<typeof catalogueVenuesQuerySchema>,
) => {
  const rows = await db.venue.findMany({
    where: {
      AND: [
        statusWhere(query.status),
        ...(query.search
          ? [
              {
                OR: [
                  { name: { contains: query.search, mode: 'insensitive' as const } },
                  { address: { contains: query.search, mode: 'insensitive' as const } },
                  { postalCode: { contains: query.search } },
                ],
              },
            ]
          : []),
      ],
      ...(query.cursor ? { id: { gt: query.cursor } } : {}),
      ...(query.merchantId ? { merchantId: query.merchantId } : {}),
    },
    orderBy: { id: 'asc' },
    take: query.limit + 1,
    include: venueInclude,
  })
  return page(await Promise.all(rows.map((row) => venueView(db, row))), query.limit)
}
export const getCatalogueVenue = async (db: Reader, id: string) => {
  const row = await db.venue.findUnique({ where: { id }, include: venueInclude })
  if (!row) throw new DomainError('NOT_FOUND', 'Outlet not found')
  const history = await db.adminEvidence.findMany({
    where: { subjectType: 'VENUE', subjectId: id, kind: { in: ['GEOGRAPHY', 'OCCUPANCY'] } },
    orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
    take: 101,
  })
  return {
    ...(await venueView(db, row)),
    evidence: history.slice(0, 100).map((e) => ({
      id: e.id,
      kind: e.kind,
      subjectHash: e.subjectHash,
      provider: e.provider,
      reference: e.reference,
      sourceUrl: e.sourceUrl,
      statement: e.statement,
      observedAt: e.observedAt?.toISOString() ?? null,
      recordedAt: e.recordedAt.toISOString(),
      catalogueVersion: e.catalogueVersion,
      actorName: e.actorName,
    })),
    evidenceTruncated: history.length > 100,
  }
}

export const claimCatalogueParent = async (
  tx: AccessTransaction,
  merchantId: string,
  expected?: number,
) => {
  const parent = await tx.merchant.findUnique({ where: { id: merchantId } })
  if (
    !parent ||
    parent.deletedAt ||
    (expected !== undefined && normalizeVersion(parent.catalogueVersion) !== expected)
  )
    throw conflict()
  const version = normalizeVersion(parent.catalogueVersion)
  const claim = await tx.merchant.updateMany({
    where: {
      id: merchantId,
      AND: [activeCatalogue, legacyVersionWhere('catalogueVersion', version)],
    },
    data: { catalogueVersion: version + 1 },
  })
  if (claim.count !== 1) throw conflict()
}
export const currentCatalogueVenue = async (
  tx: AccessTransaction,
  id: string,
  expected: number,
) => {
  const row = await tx.venue.findUnique({ where: { id } })
  if (!row || row.deletedAt || normalizeVersion(row.catalogueVersion) !== expected) throw conflict()
  return row
}
