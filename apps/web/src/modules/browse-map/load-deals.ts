import type { DealPin, DealsQuery } from '@broke-oclock/contracts/deals'
import { distanceMetres, sortByDistance } from '@web/modules/browse-map/distance'
import type { BrowseFilters } from '@web/modules/browse-map/filters'
import type {
  Coordinates,
  DealRow,
  SelectedDeal,
  SelectedVenue,
  Selection,
  VenuePin,
} from '@web/modules/browse-map/types'

export const toDealsQuery = (filters: Pick<BrowseFilters, 'validNow'>): DealsQuery => ({
  validNow: filters.validNow ? 'true' : 'false',
})

export const toVenuePins = (deals: readonly DealPin[]): readonly VenuePin[] => {
  const pins = new Map<string, VenuePin>()
  for (const deal of deals) {
    for (const venue of deal.venues) {
      const existing = pins.get(venue.id)
      pins.set(
        venue.id,
        existing
          ? { ...existing, deals: [...existing.deals, deal] }
          : { id: venue.id, name: venue.name, lat: venue.lat, lng: venue.lng, deals: [deal] },
      )
    }
  }
  return [...pins.values()]
}

const rowKey = (deal: DealPin, venue: VenuePin) => `${deal.id}:${venue.id}`

export const toDealRows = (
  pins: readonly VenuePin[],
  position: Coordinates | null,
): readonly DealRow[] => {
  const ordered = position
    ? sortByDistance(pins, position)
    : pins.map((pin) => ({ ...pin, distanceMetres: null }))
  const outletCounts = new Map<string, number>()
  for (const venue of pins) {
    for (const deal of venue.deals) outletCounts.set(deal.id, (outletCounts.get(deal.id) ?? 0) + 1)
  }
  const seen = new Set<string>()
  return ordered.flatMap((venue) =>
    venue.deals.flatMap((deal) => {
      if (seen.has(deal.id)) return []
      seen.add(deal.id)
      return [
        {
          key: rowKey(deal, venue),
          deal,
          venue,
          distanceMetres: venue.distanceMetres,
          outletCount: outletCounts.get(deal.id) ?? 1,
        },
      ]
    }),
  )
}

const distanceTo = (venue: VenuePin, position: Coordinates | null) =>
  position ? distanceMetres(position, venue) : null

export const findSelectedVenue = (
  pins: readonly VenuePin[],
  selection: Selection | null,
  position: Coordinates | null,
): SelectedVenue | null => {
  if (!selection) return null
  const venue = pins.find((pin) => pin.id === selection.venueId)
  return venue ? { venue, distanceMetres: distanceTo(venue, position) } : null
}

export const findSelectedDeal = (
  pins: readonly VenuePin[],
  selection: Selection | null,
  position: Coordinates | null,
): SelectedDeal | null => {
  const selected = findSelectedVenue(pins, selection, position)
  if (!selected || !selection?.dealId) return null
  const deal = selected.venue.deals.find((candidate) => candidate.id === selection.dealId)
  return deal ? { deal, venue: selected.venue, distanceMetres: selected.distanceMetres } : null
}
