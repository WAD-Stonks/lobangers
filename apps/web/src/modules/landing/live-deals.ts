import type { DealPin } from '@broke-oclock/contracts/deals'
import { areaFor } from '@web/modules/browse-map/cluster-area'
import { formatValidity } from '@web/modules/browse-map/deal-format'
import type { SingaporeRegion } from '@web/modules/browse-map/singapore-areas'

export const venuesInRegion = (deal: DealPin, region: SingaporeRegion) =>
  deal.venues.filter((venue) => areaFor(venue).region === region)

// Choose a deal first, so chains with many outlets get the same chance as a single outlet.
export const randomRegionalDeal = (
  deals: DealPin[],
  region: SingaporeRegion,
  random = Math.random,
) => {
  const candidates = deals.filter((deal) => venuesInRegion(deal, region).length > 0)
  const deal = candidates[Math.floor(random() * candidates.length)]
  if (!deal) return null
  const venue = venuesInRegion(deal, region)[0]
  return venue ? { deal, venue } : null
}

// Matches the deal page: a known end date reads "Until 31 Dec 2026". The scraped validity text
// is only a fallback, and ingestion notes such as "Publisher window (Singapore): <ISO> to <ISO>"
// are never shown to customers.
const INGESTION_NOTE = /^(Explicit source calendar|Publisher window)\b/i
export const promotionDates = (deal: DealPin) => {
  const supplied = deal.rawValidityText?.trim()
  const customerText = supplied && !INGESTION_NOTE.test(supplied) ? supplied : null
  return formatValidity(deal.validUntil, customerText, deal.limitedTime)
}

// Never infer a recent verification badge from lifetime counts or unknown dates.
export const isLikelyStillOn = (deal: DealPin) =>
  deal.votes.status === 'LIKELY_STILL_ON' &&
  (!deal.validUntil || new Date(deal.validUntil).getTime() > Date.now())
// Opens the deal over the All Deals list (list view), not the map.
export const landingDealLink = (deal: DealPin, venueId: string) =>
  `/deals/${deal.id}?at=${venueId}&view=list&discovery=1`
