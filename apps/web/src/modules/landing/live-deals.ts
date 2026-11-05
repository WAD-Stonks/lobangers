import type { DealPin } from '@broke-oclock/contracts/deals'
import { areaFor } from '@web/modules/browse-map/cluster-area'
import { formatValidity } from '@web/modules/browse-map/deal-format'
import type { SingaporeRegion } from '@web/modules/browse-map/singapore-areas'

export const venuesInRegion = (deal: DealPin, region: SingaporeRegion) =>
  deal.venues.filter((venue) => areaFor(venue).region === region)

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

const INGESTION_NOTE = /^(Explicit source calendar|Publisher window)\b/i
export const promotionDates = (deal: DealPin) => {
  const supplied = deal.rawValidityText?.trim()
  const customerText = supplied && !INGESTION_NOTE.test(supplied) ? supplied : null
  return formatValidity(deal.validUntil, customerText, deal.limitedTime)
}

export const isLikelyStillOn = (deal: DealPin) =>
  deal.votes.status === 'LIKELY_STILL_ON' &&
  (!deal.validUntil || new Date(deal.validUntil).getTime() > Date.now())
export const landingDealLink = (deal: DealPin, venueId: string) =>
  `/deals/${deal.id}?at=${venueId}&view=list&discovery=1`
