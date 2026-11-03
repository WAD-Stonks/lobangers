import { MAX_IMAGE_SOURCES } from '@api/modules/deals/deal-images'
import { publicOutletVenueSelect } from '@api/modules/deals/public-deals'
import { publicImportedImageSelect } from '@api/modules/deals/public-images'
import { activeRecord } from '@api/modules/platform-admin/venues'
import type { db } from '@broke-oclock/db'

type Database = typeof db

// On MongoDB, Prisma resolves every nested relation of a select as its own query, one after
// another, so a deal with four relations costs four or more round trips. These loaders select
// the deal's scalars first and then fetch each relation directly, side by side.

// The scalar half of publicOutletScopeSelect; withOutletScopes supplies the relations.
export const outletScopeKeysSelect = {
  id: true,
  merchantId: true,
  contentVersion: true,
  applicability: true,
  scopeConfirmation: true,
} as const

const groupBy = <Row, Key>(rows: readonly Row[], keyOf: (row: Row) => Key) =>
  rows.reduce((groups, row) => {
    const key = keyOf(row)
    return groups.set(key, [...(groups.get(key) ?? []), row])
  }, new Map<Key, Row[]>())

// Adds the `venues` and `merchant` relations that mapVenuesFor reads, in two round trips.
export const withOutletScopes = async <Deal extends { id: string; merchantId: string | null }>(
  database: Database,
  deals: readonly Deal[],
) => {
  if (deals.length === 0) return []
  const merchantIds = [
    ...new Set(deals.flatMap((deal) => (deal.merchantId ? [deal.merchantId] : []))),
  ]
  const [links, merchants] = await Promise.all([
    database.dealVenue.findMany({
      where: { dealId: { in: deals.map((deal) => deal.id) } },
      orderBy: { id: 'asc' },
      select: { dealId: true, venueId: true, venue: { select: publicOutletVenueSelect } },
    }),
    database.merchant.findMany({
      where: { id: { in: merchantIds } },
      select: {
        id: true,
        deletedAt: true,
        venues: { where: activeRecord, select: publicOutletVenueSelect },
      },
    }),
  ])
  const linksByDeal = groupBy(links, (link) => link.dealId)
  const merchantById = new Map(merchants.map((merchant) => [merchant.id, merchant]))
  return deals.map((deal) => {
    const merchant = deal.merchantId ? merchantById.get(deal.merchantId) : undefined
    return {
      ...deal,
      venues: (linksByDeal.get(deal.id) ?? []).map(({ venueId, venue }) => ({ venueId, venue })),
      merchant: merchant
        ? { deletedAt: merchant.deletedAt ?? null, venues: merchant.venues }
        : null,
    }
  })
}

const MS_PER_HOUR = 3_600_000

// Votes cast inside the community window, grouped by deal, in one round trip.
export const findRecentVotes = async (
  database: Database,
  dealIds: readonly string[],
  now: Date,
  windowHours: number,
) => {
  if (dealIds.length === 0) return new Map<string, never[]>()
  const votes = await database.dealVote.findMany({
    where: {
      dealId: { in: [...dealIds] },
      updatedAt: { gt: new Date(now.getTime() - windowHours * MS_PER_HOUR), lte: now },
    },
    select: { dealId: true, value: true, updatedAt: true },
  })
  return groupBy(votes, (vote) => vote.dealId)
}

// Each deal's imported image sources (as publicImportedImageSelect), keyed by deal id.
export const findDealSources = async (database: Database, dealIds: readonly string[]) => {
  const sources =
    dealIds.length === 0
      ? []
      : await database.dealSource.findMany({
          where: { dealId: { in: [...dealIds] } },
          orderBy: publicImportedImageSelect.orderBy,
          select: { dealId: true, ...publicImportedImageSelect.select },
        })
  const sourcesByDeal = groupBy(sources, (source) => source.dealId)
  return (dealId: string) =>
    (sourcesByDeal.get(dealId) ?? [])
      .slice(0, MAX_IMAGE_SOURCES)
      .map(({ importedPost, images }) => ({ importedPost, images }))
}

// Adds `sources` (as publicImportedImageSelect) and the first active upload as `images`.
export const withDealMedia = async <Deal extends { id: string }>(
  database: Database,
  deals: readonly Deal[],
) => {
  if (deals.length === 0) return []
  const dealIds = deals.map((deal) => deal.id)
  const [sourcesOf, uploads] = await Promise.all([
    findDealSources(database, dealIds),
    database.uploadedFile.findMany({
      where: { dealId: { in: dealIds }, ...activeRecord },
      orderBy: { createdAt: 'asc' },
      select: { dealId: true, url: true },
    }),
  ])
  const uploadsByDeal = groupBy(uploads, (upload) => upload.dealId)
  return deals.map((deal) => ({
    ...deal,
    sources: sourcesOf(deal.id),
    images: (uploadsByDeal.get(deal.id) ?? []).slice(0, 1).map(({ url }) => ({ url })),
  }))
}
