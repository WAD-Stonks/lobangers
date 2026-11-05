import { communityStatus } from '@broke-oclock/contracts/community-policy'
import type { DealPin, DealVoteSummary } from '@broke-oclock/contracts/deals'
import { distanceMetres } from '@web/modules/browse-map/distance'
import type { BrowseFilters, EndingWindow } from '@web/modules/browse-map/filters'
import { matchesLocation } from '@web/modules/browse-map/location-filter'
import type { Coordinates, DealRow, VenuePin } from '@web/modules/browse-map/types'

export type AreaBounds = {
  readonly south: number
  readonly west: number
  readonly north: number
  readonly east: number
}

export type FilterContext = {
  readonly now: Date
  readonly position: Coordinates | null
  readonly area: AreaBounds | null
}

export type SortKey = 'near' | 'ending' | 'newest'

export const WALK_METRES_PER_MINUTE = 80
const SINGAPORE_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_DAYS = 7

export const walkMinutesFor = (metres: number): number =>
  Math.max(1, Math.ceil(metres / WALK_METRES_PER_MINUTE))

export const isVerified = (votes: DealVoteSummary): boolean =>
  (votes.status ?? communityStatus(votes, null)) === 'LIKELY_STILL_ON'

const endOfSingaporeDay = (now: Date): number => {
  const local = now.getTime() + SINGAPORE_OFFSET_MS
  return Math.floor(local / DAY_MS) * DAY_MS + DAY_MS - SINGAPORE_OFFSET_MS
}

const endTime = (deal: Pick<DealPin, 'validUntil'>): number | null => {
  if (deal.validUntil === null) return null
  const time = new Date(deal.validUntil).getTime()
  return Number.isNaN(time) ? null : time
}

export const endsWithin = (
  deal: Pick<DealPin, 'validUntil'>,
  window: EndingWindow,
  now: Date,
): boolean => {
  if (window === 'any') return true
  const end = endTime(deal)
  if (end === null || end <= now.getTime()) return false
  const days = window === 'today' ? 0 : WEEK_DAYS - 1
  return end <= endOfSingaporeDay(now) + days * DAY_MS
}

export const isEndingToday = (deal: Pick<DealPin, 'validUntil'>, now: Date): boolean =>
  endsWithin(deal, 'today', now)

const matchesSearch = (deal: DealPin, q: string): boolean => {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  const haystack = [deal.title, deal.label, ...deal.venues.map((venue) => venue.name)]
  return haystack.some((text) => text.toLowerCase().includes(needle))
}

const matchesDeal = (deal: DealPin, filters: BrowseFilters, now: Date): boolean =>
  matchesSearch(deal, filters.q) &&
  (filters.categories.length === 0 || filters.categories.includes(deal.category.toUpperCase())) &&
  (filters.cuisines.length === 0 ||
    (deal.cuisine !== null && (filters.cuisines as readonly string[]).includes(deal.cuisine))) &&
  (filters.offerTypes.length === 0 || filters.offerTypes.includes(deal.offerType)) &&
  (filters.priceMaxMinor === null ||
    deal.priceMinor === null ||
    deal.priceMinor <= filters.priceMaxMinor) &&
  (!filters.verifiedOnly || isVerified(deal.votes)) &&
  endsWithin(deal, filters.ending, now)

export const filterDeals = (
  deals: readonly DealPin[],
  filters: BrowseFilters,
  context: FilterContext,
): readonly DealPin[] => deals.filter((deal) => matchesDeal(deal, filters, context.now))

const MIN_AREA_HALF_SPAN_DEGREES = 0.0045

const withMinimumReach = (area: AreaBounds): AreaBounds => {
  const lat = (area.north + area.south) / 2
  const lng = (area.east + area.west) / 2
  const halfLat = Math.max((area.north - area.south) / 2, MIN_AREA_HALF_SPAN_DEGREES)
  const halfLng = Math.max((area.east - area.west) / 2, MIN_AREA_HALF_SPAN_DEGREES)
  return { south: lat - halfLat, north: lat + halfLat, west: lng - halfLng, east: lng + halfLng }
}

const insideArea = (point: Coordinates, area: AreaBounds): boolean =>
  point.lat >= area.south &&
  point.lat <= area.north &&
  point.lng >= area.west &&
  point.lng <= area.east

export const filterVenues = (
  pins: readonly VenuePin[],
  filters: BrowseFilters,
  context: FilterContext,
): readonly VenuePin[] => {
  const { position } = context
  const area = context.area && withMinimumReach(context.area)
  return pins.filter((pin) => {
    if (!matchesLocation(pin, filters.location)) return false
    if (area && !insideArea(pin, area)) return false
    if (filters.walkMinutes === null || !position) return true
    return walkMinutesFor(distanceMetres(position, pin)) <= filters.walkMinutes
  })
}

export const uniqueDealCount = (pins: readonly VenuePin[]): number =>
  new Set(pins.flatMap((pin) => pin.deals.map((deal) => deal.id))).size

export const sortRows = (rows: readonly DealRow[], sort: SortKey): readonly DealRow[] => {
  if (sort !== 'ending') return rows
  const rank = (row: DealRow) => endTime(row.deal) ?? Number.POSITIVE_INFINITY
  return [...rows].sort((a, b) => rank(a) - rank(b))
}
