import type { PlacedGroup } from '@web/modules/browse-map/declutter'
import L from 'leaflet'

// A group is a sunny pill naming its neighbourhood or region with the deal count on a white
// inset; "Near you" is sky blue to match the visitor's dot. Groups carry no food, so a 3D food
// sprite on the map always means one real outlet. Styled in DealMap.vue.
export const CLUSTER_CLASS = 'deal-map-cluster'
// Outlets in the same building (a mall's food court) stack into one chip; neighbouring shops
// stay separate pins even when they overlap a little.
export const STACK_CLASS = 'deal-map-stack'
const SAME_SPOT_METRES = 30
const MIN_STACK_RADIUS_PX = 8
const MAX_STACK_RADIUS_PX = 40
// Web Mercator ground resolution at zoom 0 at Singapore's latitude (1.3° N).
const METRES_PER_PX_AT_ZOOM_0 = 156_543.03 * Math.cos((1.3 * Math.PI) / 180)

export const stackRadiusFor = (zoom: number): number => {
  const radius = Math.round(SAME_SPOT_METRES / (METRES_PER_PX_AT_ZOOM_0 / 2 ** zoom))
  return Math.min(MAX_STACK_RADIUS_PX, Math.max(MIN_STACK_RADIUS_PX, radius))
}

const span = (className: string, text: string): HTMLSpanElement => {
  const element = document.createElement('span')
  element.className = className
  element.textContent = text
  return element
}

const deals = (count: number) => `${count} ${count === 1 ? 'deal' : 'deals'}`

export const describeGroup = (group: PlacedGroup): string =>
  group.kind === 'near'
    ? `${deals(group.dealCount)} within a 10-minute walk`
    : `${deals(group.dealCount)} in ${group.label}`

// Built from DOM nodes; the name and count are set as text, never HTML. The icon is a
// zero-size anchor so the pill can centre itself on the point whatever its width.
export const createGroupIcon = (group: PlacedGroup): L.DivIcon => {
  const chip = document.createElement('div')
  chip.className = [
    `${CLUSTER_CLASS}__chip`,
    `${CLUSTER_CLASS}__chip--${group.kind}`,
    ...(group.compact ? [`${CLUSTER_CLASS}__chip--compact`] : []),
  ].join(' ')
  chip.setAttribute('aria-label', describeGroup(group))
  if (!group.compact) chip.append(span(`${CLUSTER_CLASS}__name`, group.label))
  chip.append(span(`${CLUSTER_CLASS}__count`, String(group.dealCount)))
  // A negative anchor draws the pill `offset` px away from the group's point.
  const anchor: L.PointTuple = [-group.offset.x || 0, -group.offset.y || 0]
  return L.divIcon({ className: CLUSTER_CLASS, html: chip, iconSize: [0, 0], iconAnchor: anchor })
}

export const createStackIcon = (outletCount: number): L.DivIcon => {
  const chip = span(`${STACK_CLASS}__chip`, `${outletCount} places`)
  return L.divIcon({ className: STACK_CLASS, html: chip, iconSize: [0, 0] })
}
