import type { DealPin } from '@broke-oclock/contracts/deals'
import { areaFor } from '@web/modules/browse-map/cluster-area'
import type { SingaporeRegion } from '@web/modules/browse-map/singapore-areas'
import { offerLabel, validityLabel } from '@web/modules/venues-feed/deal-format'

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

export const landingOffer = (deal: DealPin) =>
  offerLabel({ ...deal, currency: 'SGD' }) ?? deal.label

export const promotionDates = (deal: DealPin) => {
  const supplied = deal.rawValidityText?.trim()
  // Ingestion metadata is not customer-facing promotion copy.
  if (supplied && !/^Explicit source calendar:/i.test(supplied)) return supplied
  return validityLabel({ validUntil: deal.validUntil, rawValidityText: null })
}
