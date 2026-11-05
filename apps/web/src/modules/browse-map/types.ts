import type { DealPin } from '@broke-oclock/contracts/deals'

export type Coordinates = {
  readonly lat: number
  readonly lng: number
}

export type VenuePin = {
  readonly id: string
  readonly name: string
  readonly lat: number
  readonly lng: number
  readonly deals: readonly DealPin[]
}

export type DealRow = {
  readonly key: string
  readonly deal: DealPin
  readonly venue: VenuePin
  readonly distanceMetres: number | null
  readonly outletCount: number
}

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
