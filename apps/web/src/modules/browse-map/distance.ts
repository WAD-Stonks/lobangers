import type { Coordinates } from '@web/modules/browse-map/types'

export type WithDistance<T> = T & { readonly distanceMetres: number }

const EARTH_RADIUS_METRES = 6_371_000

const toRadians = (degrees: number) => (degrees * Math.PI) / 180

// Great-circle distance (haversine). Accurate to well under 1% at Singapore's scale.
export const distanceMetres = (from: Coordinates, to: Coordinates): number => {
  const dLat = toRadians(to.lat - from.lat)
  const dLng = toRadians(to.lng - from.lng)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(a))
}

// Returns a new nearest-first array; the input is never reordered.
export const sortByDistance = <T extends Coordinates>(
  items: readonly T[],
  origin: Coordinates,
): readonly WithDistance<T>[] =>
  items
    .map((item) => ({ ...item, distanceMetres: distanceMetres(origin, item) }))
    .sort((a, b) => a.distanceMetres - b.distanceMetres)

// Kept here so existing callers keep importing from the distance module; the Intl copy lives in
// the shared formatter.
export { formatDistance } from '@web/lib/format'
