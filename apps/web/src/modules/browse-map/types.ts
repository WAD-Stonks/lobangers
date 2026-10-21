import type { DealPin } from '@broke-oclock/contracts/deals'

export type Coordinates = {
  readonly lat: number
  readonly lng: number
}

// One map pin per outlet, carrying every listed deal at that outlet in query order.
export type VenuePin = {
  readonly id: string
  readonly name: string
  readonly lat: number
  readonly lng: number
  readonly deals: readonly DealPin[]
}

// One list row per deal, shown at its nearest listed outlet (its first one when the visitor is
// not located). `outletCount` is how many listed outlets run it, that one included.
export type DealRow = {
  readonly key: string
  readonly deal: DealPin
  readonly venue: VenuePin
  readonly distanceMetres: number | null
  readonly outletCount: number
}

// What the visitor has opened: an outlet, and optionally one of its deals.
export type Selection = {
  readonly venueId: string
  readonly dealId: string | null
}

export type SelectedVenue = {
  readonly venue: VenuePin
  readonly distanceMetres: number | null
}

export type SelectedDeal = {
  readonly deal: DealPin
  readonly venue: VenuePin
  readonly distanceMetres: number | null
}
