import { displayStatus, type StoredStatus } from '@api/modules/flash-drops/policy'
import type { Database } from '@api/modules/platform-admin/transaction'
import { activeRecord } from '@api/modules/platform-admin/venues'
import type { MerchantFlashDrop } from '@broke-oclock/contracts/flash-drops'

// Loads the deal and outlet a drop points at and projects the shapes each audience sees. Drops
// store ids only; the deal title and outlet name are read fresh so a rename shows everywhere.

type Reader = Pick<Database, 'deal' | 'venue' | 'merchant'>

export const dropSelect = {
  id: true,
  dealId: true,
  venueId: true,
  merchantUserId: true,
  offerType: true,
  discountPercent: true,
  flashPriceMinor: true,
  usualPriceMinor: true,
  startsAt: true,
  endsAt: true,
  radiusMetres: true,
  codeLimit: true,
  claimedCount: true,
  status: true,
  startsOnGoLive: true,
  reviewNote: true,
  version: true,
  demo: true,
} as const

export type DropRow = {
  id: string
  dealId: string
  venueId: string
  merchantUserId: string
  offerType: MerchantFlashDrop['offerType'] | null
  discountPercent: number | null
  flashPriceMinor: number | null
  usualPriceMinor: number | null
  startsAt: Date
  endsAt: Date
  radiusMetres: number
  codeLimit: number
  claimedCount: number
  status: StoredStatus
  startsOnGoLive: boolean
  reviewNote: string | null
  version: number
  demo: boolean
}

export type DealFacts = {
  id: string
  title: string
  description: string
  category: string
  cuisine: string | null
  offerType: MerchantFlashDrop['deal']['offerType']
  discountPercent: number | null
  priceMinor: number | null
  terms: string | null
  images: { key: string; url: string }[]
}
export type VenueFacts = {
  id: string
  name: string
  merchantId: string
  latitude: number
  longitude: number
  geographyEvidence: unknown
}

export type DropContext = {
  deals: ReadonlyMap<string, DealFacts>
  venues: ReadonlyMap<string, VenueFacts>
  merchants: ReadonlyMap<string, string>
}

export const loadContext = async (
  database: Reader,
  rows: readonly Pick<DropRow, 'dealId' | 'venueId'>[],
): Promise<DropContext> => {
  const dealIds = [...new Set(rows.map((row) => row.dealId))]
  const venueIds = [...new Set(rows.map((row) => row.venueId))]
  const [deals, venues] = await Promise.all([
    database.deal.findMany({
      where: { id: { in: dealIds } },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        cuisine: true,
        offerType: true,
        discountPercent: true,
        priceMinor: true,
        terms: true,
        // The deal's photo: its first upload that has not been removed.
        images: {
          where: activeRecord,
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { key: true, url: true },
        },
      },
    }),
    database.venue.findMany({
      where: { id: { in: venueIds } },
      select: {
        id: true,
        name: true,
        merchantId: true,
        latitude: true,
        longitude: true,
        geographyEvidence: true,
      },
    }),
  ])
  const merchantIds = [...new Set(venues.map((venue) => venue.merchantId))]
  const merchants = await database.merchant.findMany({
    where: { id: { in: merchantIds } },
    select: { id: true, name: true },
  })
  return {
    deals: new Map(deals.map((deal) => [deal.id, deal])),
    venues: new Map(venues.map((venue) => [venue.id, venue])),
    merchants: new Map(merchants.map((merchant) => [merchant.id, merchant.name])),
  }
}

const MISSING = 'Unavailable'

export const usualPrice = (deal: Pick<DealFacts, 'priceMinor'> | undefined) =>
  deal?.priceMinor && deal.priceMinor > 0 ? deal.priceMinor : null

// The flash offer every audience sees. Flash deals made before offer types were a fixed flash
// price, and their usual price was their deal's own price.
export const flashOfferOf = (row: DropRow, deal: Pick<DealFacts, 'priceMinor'> | undefined) => {
  const legacy = !row.offerType
  return {
    offerType: row.offerType ?? ('FIXED_PRICE' as const),
    discountPercent: row.discountPercent ?? null,
    flashPriceCents: row.flashPriceMinor ?? null,
    usualPriceCents: legacy ? usualPrice(deal) : (row.usualPriceMinor ?? null),
  }
}

// The fields every audience (merchant and admin) shares.
export const toDropCore = (row: DropRow, context: DropContext, now: Date) => {
  const deal = context.deals.get(row.dealId)
  return {
    id: row.id,
    dealId: row.dealId,
    dealTitle: deal?.title ?? MISSING,
    outletId: row.venueId,
    outletName: context.venues.get(row.venueId)?.name ?? MISSING,
    ...flashOfferOf(row, deal),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    radiusMetres: row.radiusMetres,
    codeLimit: row.codeLimit,
    claimedCount: row.claimedCount,
    status: displayStatus(row, now),
    reviewNote: row.reviewNote ?? null,
    version: row.version,
    demo: row.demo,
  }
}

export const toMerchantDrop = (
  row: DropRow,
  context: DropContext,
  now: Date,
): MerchantFlashDrop => {
  const deal = context.deals.get(row.dealId)
  const photo = deal?.images[0]
  return {
    ...toDropCore(row, context, now),
    deal: {
      title: deal?.title ?? MISSING,
      description: deal?.description ?? '',
      category: deal?.category ?? '',
      cuisine: deal?.cuisine ?? null,
      offerType: deal?.offerType ?? 'OTHER',
      discountPercent: deal?.discountPercent ?? null,
      priceCents: deal?.priceMinor ?? null,
      terms: deal?.terms ?? '',
      photo: photo ? { key: photo.key, url: photo.url } : null,
    },
    startsOnGoLive: row.startsOnGoLive ?? false,
  }
}
