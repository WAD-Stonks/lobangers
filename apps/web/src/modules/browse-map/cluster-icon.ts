import type { PlacedGroup } from '@web/modules/browse-map/declutter'
import type { FoodKind } from '@web/modules/browse-map/food-kind'
import { createFoodSprite } from '@web/modules/browse-map/food-sprite'
import { DEAL_PIN_CLASS } from '@web/modules/browse-map/map-config'
import { pinBadgeText, pinFoodKind } from '@web/modules/browse-map/venue-pin'
import L from 'leaflet'

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
// A building: the tower, its lower wing, the ground line and three rows of windows.
const BUILDING_PATHS = [
  'M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16',
  'M15 9h4a1 1 0 0 1 1 1v11',
  'M2.5 21h19',
  'M8 8h3',
  'M8 12h3',
  'M8 16h3',
]

// A group is the same dark oval as a pin, holding its most common food, its neighbourhood or
// region and "n deals · from $x"; "Near you" is sky blue to match the visitor's dot. One food
// keeps a screen of groups calm; the name and count tell it apart from one outlet. Every
// cluster without room for a name (a crowded group, the island-wide count, a stack of
// overlapping pins) is the same compact dot: one food and its deal count. Styled in DealMap.vue.
export const CLUSTER_CLASS = 'deal-map-cluster'

const span = (className: string, text: string): HTMLSpanElement => {
  const element = document.createElement('span')
  element.className = className
  element.textContent = text
  return element
}

const deals = (count: number) => `${count} ${count === 1 ? 'deal' : 'deals'}`

const DESCRIBE: Record<PlacedGroup['kind'], (group: PlacedGroup) => string> = {
  near: (group) => `${deals(group.dealCount)} within a 10-minute walk`,
  area: (group) => `${deals(group.dealCount)} in ${group.label}`,
  region: (group) => `${deals(group.dealCount)} in ${group.label}`,
  stack: (group) => `${deals(group.dealCount)} at ${group.venues.length} places close together`,
  place: (group) => `${deals(group.dealCount)} at ${group.venues.length} shops in ${group.label}`,
}

export const describeGroup = (group: PlacedGroup): string => DESCRIBE[group.kind](group)

const MAX_GROUP_FOODS = 1

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
const createBuilding = (): SVGSVGElement => {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg')
  svg.setAttribute('class', `${DEAL_PIN_CLASS}__building`)
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2.2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  for (const d of BUILDING_PATHS) {
    const path = document.createElementNS(SVG_NAMESPACE, 'path')
    path.setAttribute('d', d)
    svg.append(path)
  }
  return svg
}

// A mall is drawn as an outlet's pin (venue-pin.ts), so it reads as a place to go rather than
// a count to open: an oval holding a building and "n deals", on a stem down to a dot on the
// building's exact spot. No food: a mall has many, and the building says what it is. It takes the pin's classes,
// so it is hovered, focused and opened (coral) like a pin; `--place` inverts its colours.
const createPlaceMarker = (group: PlacedGroup): HTMLElement => {
  const part = (name: string, text?: string) => span(`${DEAL_PIN_CLASS}__${name}`, text ?? '')
  const bubble = part('bubble')
  bubble.append(createBuilding(), part('badge', deals(group.dealCount)))
  const root = part('stack')
  root.setAttribute('aria-label', describeGroup(group))
  root.append(bubble, part('stem'), part('dot'))
  return root
}

export const createGroupIcon = (group: PlacedGroup): L.DivIcon => {
  if (group.kind === 'place')
    return L.divIcon({
      className: `${CLUSTER_CLASS} ${DEAL_PIN_CLASS} ${DEAL_PIN_CLASS}--place`,
      html: createPlaceMarker(group),
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    })
  const chip = document.createElement('div')
  chip.className = [
    `${CLUSTER_CLASS}__chip`,
    `${CLUSTER_CLASS}__chip--${group.kind}`,
    ...(group.compact ? [`${CLUSTER_CLASS}__chip--compact`] : []),
  ].join(' ')
  chip.setAttribute('aria-label', describeGroup(group))
  const fan = span(`${CLUSTER_CLASS}__fan`, '')
  for (const kind of groupFoods(group))
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
