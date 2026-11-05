import type { DealImage, DealPin } from '@broke-oclock/contracts/deals'
import type { VenueDealSummary, VenueDetailResponse } from '@broke-oclock/contracts/venues'
import { distanceMetres } from '@web/modules/browse-map/distance'
import type { Coordinates, DealRow, VenuePin } from '@web/modules/browse-map/types'
import { offerLabel } from '@web/modules/venues-feed/deal-format'

type VenueRef = Pick<VenueDetailResponse['venue'], 'id' | 'name'>

export type LoadedDeals = {
  readonly deals: readonly DealPin[]
  readonly pin: VenuePin | null
  readonly position: Coordinates | null
}

const imagesFor = (summary: VenueDealSummary): readonly DealImage[] =>
  summary.imageUrl?.startsWith('https://')
    ? [{ url: summary.imageUrl, alt: summary.imageAltText ?? null }]
    : []

const toDealPin = (summary: VenueDealSummary): DealPin => ({
  id: summary.id,
  title: summary.title,
  category: summary.category,
  cuisine: null,
  label: offerLabel(summary) ?? '',
  description: '',
  offerType: summary.offerType,
  priceMinor: summary.priceMinor,
  discountPercent: summary.discountPercent,
  terms: null,
  imageUrl: summary.imageUrl,
  imageAltText: summary.imageAltText ?? null,
  validUntil: summary.validUntil,
  rawValidityText: summary.rawValidityText,
  limitedTime: summary.limitedTime,
  outletUnconfirmed: summary.outletUnconfirmed,
  votes: { alive: 0, dead: 0 },
  commentCount: 0,
  images: [...imagesFor(summary)],
  venues: [],
})

const fallbackPin = (venue: VenueRef, deals: readonly DealPin[]): VenuePin => ({
  id: venue.id,
  name: venue.name,
  lat: Number.NaN,
  lng: Number.NaN,
  deals,
})

export const toVenueDealRows = (
  venue: VenueRef,
  summaries: readonly VenueDealSummary[],
  loaded: LoadedDeals,
): readonly DealRow[] => {
  const byId = new Map(loaded.deals.map((deal) => [deal.id, deal]))
  const deals = summaries.map((summary) => byId.get(summary.id) ?? toDealPin(summary))
  const pin = loaded.pin ?? fallbackPin(venue, deals)
  const distance =
    loaded.pin && loaded.position ? distanceMetres(loaded.position, loaded.pin) : null
  return deals.map((deal) => ({
    key: `${deal.id}:${venue.id}`,
    deal,
    venue: pin,
    distanceMetres: distance,
    outletCount: Math.max(deal.venues.length, 1),
  }))
}
