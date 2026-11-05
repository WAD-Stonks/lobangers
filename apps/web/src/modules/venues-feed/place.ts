import type { VenueDetailResponse } from '@broke-oclock/contracts/venues'

type PlaceVenue = Pick<VenueDetailResponse['venue'], 'name' | 'address' | 'postalCode'>

const SUFFIX_SEPARATOR = ', '
const UNIT_NUMBER = /\s*#[A-Z]?\d+-\d+[A-Z]?,?/gi

const buildingIn = (name: string): string | null => {
  const at = name.lastIndexOf(SUFFIX_SEPARATOR)
  return at > 0 ? name.slice(at + SUFFIX_SEPARATOR.length).trim() || null : null
}

const streetAddress = (venue: PlaceVenue): string =>
  venue.address.replace(UNIT_NUMBER, '').replace(/\s+/g, ' ').trim()

export const sharedBuilding = (names: readonly string[]): string | null => {
  const [first] = names
  const building = first ? buildingIn(first) : null
  if (!building) return null
  const lower = building.toLowerCase()
  return names.every((name) => buildingIn(name)?.toLowerCase() === lower) ? building : null
}

export const placeName = (venues: readonly PlaceVenue[]): string => {
  const [first] = venues
  if (!first) return ''
  const shared = sharedBuilding(venues.map((venue) => venue.name))
  if (shared) return shared
  const street = streetAddress(first)
  const [lead] = street.split(SUFFIX_SEPARATOR)
  return street.includes(SUFFIX_SEPARATOR) && lead ? lead : street
}

export const placeAddress = (venues: readonly PlaceVenue[]): string => {
  const [first] = venues
  if (!first) return ''
  const street = venues.length > 1 ? streetAddress(first) : first.address.trim()
  return first.postalCode && !street.includes(first.postalCode)
    ? `${street}, Singapore ${first.postalCode}`
    : street
}

export const PLACE_ID_SEPARATOR = ','

export const readPlaceIds = (param: unknown): readonly string[] =>
  String(param ?? '')
    .split(PLACE_ID_SEPARATOR)
    .map((id) => id.trim())
    .filter(Boolean)
