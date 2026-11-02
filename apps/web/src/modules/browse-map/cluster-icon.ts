import type { PlacedGroup } from '@web/modules/browse-map/declutter'
import type { FoodKind } from '@web/modules/browse-map/food-kind'
import { createFoodSprite } from '@web/modules/browse-map/food-sprite'
import { pinBadgeText, pinFoodKind } from '@web/modules/browse-map/venue-pin'
import L from 'leaflet'

// A group is the same dark oval as a pin, holding up to three of its foods, its neighbourhood or
// region and "n deals · from $x"; "Near you" is sky blue to match the visitor's dot. Several
// foods side by side inside the oval tell a group apart from one outlet. Styled in DealMap.vue.
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

const MAX_GROUP_FOODS = 3

// The group's most common foods, most common first, without repeats.
export const groupFoods = (
  group: Pick<PlacedGroup, 'venues'>,
  limit = MAX_GROUP_FOODS,
): FoodKind[] => {
  const counts = group.venues.reduce<ReadonlyMap<FoodKind, number>>((acc, venue) => {
    const kind = pinFoodKind(venue)
    return new Map(acc).set(kind, (acc.get(kind) ?? 0) + 1)
  }, new Map())
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([kind]) => kind)
}

export const groupMeta = (group: Pick<PlacedGroup, 'venues' | 'dealCount'>): string => {
  const lead = pinBadgeText(group.venues.flatMap((venue) => venue.deals))
  return lead.startsWith('from ') ? `${deals(group.dealCount)} · ${lead}` : deals(group.dealCount)
}

// Built from DOM nodes; the name and count are set as text, never HTML. The icon is a
// zero-size anchor so the oval can centre itself on the point whatever its width.
export const createGroupIcon = (group: PlacedGroup): L.DivIcon => {
  const chip = document.createElement('div')
  chip.className = [
    `${CLUSTER_CLASS}__chip`,
    `${CLUSTER_CLASS}__chip--${group.kind}`,
    ...(group.compact ? [`${CLUSTER_CLASS}__chip--compact`] : []),
  ].join(' ')
  chip.setAttribute('aria-label', describeGroup(group))
  const fan = span(`${CLUSTER_CLASS}__fan`, '')
  for (const kind of groupFoods(group, group.compact ? 1 : MAX_GROUP_FOODS))
    fan.append(createFoodSprite(kind, { animated: false, phase: 0 }))
  if (fan.childElementCount > 0) chip.append(fan)
  if (group.compact) {
    chip.append(span(`${CLUSTER_CLASS}__count`, String(group.dealCount)))
  } else {
    const text = span(`${CLUSTER_CLASS}__text`, '')
    text.append(span(`${CLUSTER_CLASS}__name`, group.label))
    text.append(span(`${CLUSTER_CLASS}__count`, groupMeta(group)))
    chip.append(text)
  }
  // A negative anchor draws the pill `offset` px away from the group's point.
  const anchor: L.PointTuple = [-group.offset.x || 0, -group.offset.y || 0]
  return L.divIcon({ className: CLUSTER_CLASS, html: chip, iconSize: [0, 0], iconAnchor: anchor })
}

export const createStackIcon = (outletCount: number): L.DivIcon => {
  const chip = span(`${STACK_CLASS}__chip`, `${outletCount} places`)
  return L.divIcon({ className: STACK_CLASS, html: chip, iconSize: [0, 0] })
}
