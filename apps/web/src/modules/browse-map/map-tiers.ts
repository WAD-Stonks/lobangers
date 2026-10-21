import { areaFor } from '@web/modules/browse-map/cluster-area'
import { distanceMetres } from '@web/modules/browse-map/distance'
import type { Coordinates, VenuePin } from '@web/modules/browse-map/types'

// What the map shows at each zoom, from a student's point of view: deals within a short walk
// are the point, so they stay real pins whenever they are big enough to read. Everything
// farther away is summed up once per neighbourhood, or once per region at island view.
export type MapTier = 'region' | 'area' | 'street'
export type GroupKind = 'near' | 'area' | 'region'

export type PinGroup = {
  readonly key: string
  readonly kind: GroupKind
  readonly label: string
  readonly dealCount: number
  readonly centre: Coordinates
  readonly venues: readonly VenuePin[]
}

export type LayerPlan = {
  readonly tier: MapTier
  readonly loose: readonly VenuePin[]
  readonly groups: readonly PinGroup[]
}

export const NEAR_YOU_LABEL = 'Near you'
// About a ten-minute walk.
export const WALK_RADIUS_METRES = 800
export const AREA_FROM_ZOOM = 13
// The zoom the map opens at around the visitor; the walkable deals show as pins from here.
export const NEAR_PINS_FROM_ZOOM = 15
export const STREET_FROM_ZOOM = 16
// Tapping a group never zooms in past this, even for a group of outlets on one street.
export const OPEN_GROUP_MAX_ZOOM = 17

export const tierFor = (zoom: number): MapTier => {
  if (zoom >= STREET_FROM_ZOOM) return 'street'
  return zoom >= AREA_FROM_ZOOM ? 'area' : 'region'
}

const dealCountOf = (venues: readonly VenuePin[]): number =>
  venues.reduce((sum, venue) => sum + venue.deals.length, 0)

const centreOf = (venues: readonly VenuePin[]): Coordinates => ({
  lat: venues.reduce((sum, venue) => sum + venue.lat, 0) / venues.length,
  lng: venues.reduce((sum, venue) => sum + venue.lng, 0) / venues.length,
})

const makeGroup = (
  kind: GroupKind,
  label: string,
  venues: readonly VenuePin[],
  centre: Coordinates,
): PinGroup => ({
  key: `${kind}:${label}`,
  kind,
  label,
  dealCount: dealCountOf(venues),
  centre,
  venues,
})

const groupBy = (
  venues: readonly VenuePin[],
  kind: GroupKind,
  labelOf: (venue: VenuePin) => string,
): readonly PinGroup[] => {
  const buckets = venues.reduce<ReadonlyMap<string, readonly VenuePin[]>>((acc, venue) => {
    const label = labelOf(venue)
    return new Map(acc).set(label, [...(acc.get(label) ?? []), venue])
  }, new Map())
  return [...buckets].map(([label, members]) => makeGroup(kind, label, members, centreOf(members)))
}

export type PlanInput = {
  readonly pins: readonly VenuePin[]
  readonly zoom: number
  readonly user: Coordinates | null
  readonly selectedVenueId: string | null
}

export const planMapLayers = ({ pins, zoom, user, selectedVenueId }: PlanInput): LayerPlan => {
  const tier = tierFor(zoom)
  if (tier === 'street') return { tier, loose: pins, groups: [] }

  // The open outlet always stays a pin, so the panel never points at a group.
  const selected = pins.filter((pin) => pin.id === selectedVenueId)
  const rest = pins.filter((pin) => pin.id !== selectedVenueId)
  const isNear = (pin: VenuePin) => user !== null && distanceMetres(user, pin) <= WALK_RADIUS_METRES
  const near = rest.filter(isNear)
  const far = rest.filter((pin) => !isNear(pin))

  const nearAsPins = zoom >= NEAR_PINS_FROM_ZOOM
  const nearGroups =
    user && near.length > 0 && !nearAsPins
      ? [makeGroup('near', NEAR_YOU_LABEL, near, { lat: user.lat, lng: user.lng })]
      : []
  const farGroups =
    tier === 'area'
      ? groupBy(far, 'area', (pin) => areaFor(pin).name)
      : groupBy(far, 'region', (pin) => areaFor(pin).region)

  return {
    tier,
    loose: nearAsPins ? [...selected, ...near] : selected,
    groups: [...nearGroups, ...farGroups],
  }
}
