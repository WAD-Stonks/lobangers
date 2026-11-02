import { displayStatus, type StoredStatus } from '@api/modules/flash-drops/policy'
import type { Database } from '@api/modules/platform-admin/transaction'
import type { MerchantFlashDrop } from '@broke-oclock/contracts/flash-drops'

// Loads the deal and outlet a drop points at and projects the shapes each audience sees. Drops
// store ids only; the deal title and outlet name are read fresh so a rename shows everywhere.

type Reader = Pick<Database, 'deal' | 'venue' | 'merchant'>

export const dropSelect = {
  id: true,
  dealId: true,
  venueId: true,
  merchantUserId: true,
  flashPriceMinor: true,
  startsAt: true,
  endsAt: true,
  radiusMetres: true,
  codeLimit: true,
  claimedCount: true,
  status: true,
  reviewNote: true,
  version: true,
  demo: true,
} as const

export type DropRow = {
  id: string
  dealId: string
  venueId: string
  merchantUserId: string
  flashPriceMinor: number
  startsAt: Date
  endsAt: Date
  radiusMetres: number
  codeLimit: number
  claimedCount: number
  status: StoredStatus
  reviewNote: string | null
  version: number
  demo: boolean
}

export type DealFacts = { id: string; title: string; category: string; priceMinor: number | null }
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
      select: { id: true, title: true, category: true, priceMinor: true },
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

export const usualPrice = (deal: DealFacts | undefined) =>
  deal?.priceMinor && deal.priceMinor > 0 ? deal.priceMinor : null

export const toMerchantDrop = (
  row: DropRow,
  context: DropContext,
  now: Date,
): MerchantFlashDrop => {
  const deal = context.deals.get(row.dealId)
  return {
    id: row.id,
    dealId: row.dealId,
    dealTitle: deal?.title ?? MISSING,
    outletId: row.venueId,
    outletName: context.venues.get(row.venueId)?.name ?? MISSING,
    flashPriceCents: row.flashPriceMinor,
    usualPriceCents: usualPrice(deal),
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
