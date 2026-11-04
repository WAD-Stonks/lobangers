import type { PinGroup } from '@web/modules/browse-map/map-tiers'
import type { Coordinates, VenuePin } from '@web/modules/browse-map/types'
import { pinBadgeText, pinTag } from '@web/modules/browse-map/venue-pin'

// Nothing on the map may sit on top of anything else. Deal pins go first: a pin whose oval would
// touch one already placed joins it, and the two become a stack, a count dot on the first pin's
// spot (see clusterPins). Then the groups, which must also stay off the pins and stacks; bigger
// groups claim their spot first ("Near you" before all). "Near you" sits wherever the visitor happens to be, so a pill it
// covers is moved just above or below it. Otherwise a group that would overlap shrinks to a
// count dot, and one whose dot would still overlap folds into the group it hits, or failing
// that steps just aside. Nothing far away is ever folded into "Near you", which would make it
// lie about walking distance.
type Point = { readonly x: number; readonly y: number }

// `offset` (px) is where the pill is drawn relative to the group's real centre.
export type PlacedGroup = PinGroup & { readonly compact: boolean; readonly offset: Point }

export type Box = {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}
type Placed = { readonly group: PlacedGroup; readonly box: Box }

// Rough rendered sizes (px) of the group oval in DealMap.vue; a few px of slack is fine. The
// second line ("12 deals · from $1.20") sets a floor on the text width.
const PILL_HEIGHT_PX = 46
const PILL_CHAR_PX = 8.6
const PILL_META_PX = 140
const PILL_CHROME_PX = 96
const DOT_PX = 44
// Room a stack of pins takes. It is either a count dot centred on its spot or, for a mall, a
// pin ("n deals" with a building) standing above it on a stem, so the room covers both.
const STACK_WIDTH_PX = 112
const STACK_RISE_PX = 58
const STACK_DROP_PX = 24
const GAP_PX = 6
const NUDGE_PX = PILL_HEIGHT_PX + GAP_PX
const DOT_NUDGE_PX = DOT_PX + GAP_PX
const NO_OFFSET: Point = { x: 0, y: 0 }
const NEAR_YOU_NUDGES: readonly Point[] = [
  { x: 0, y: -NUDGE_PX },
  { x: 0, y: NUDGE_PX },
]
// Below first (a pin rises above its point), then the sides, then above; one step, then two.
const DOT_NUDGES: readonly Point[] = [1, 2].flatMap((step) => [
  { x: 0, y: step * DOT_NUDGE_PX },
  { x: step * DOT_NUDGE_PX, y: 0 },
  { x: -step * DOT_NUDGE_PX, y: 0 },
  { x: 0, y: -step * DOT_NUDGE_PX },
])
// A venue pin (venue-pin.ts) hangs above its point: the food and oval reach about 70px up and
// the dot a few px below. Its width follows the price and tag.
const PIN_RISE_PX = 76
const PIN_DROP_PX = 8
const PIN_CHROME_PX = 66
const PIN_CHAR_PX = 8.5
const PIN_TAG_CHROME_PX = 20
const PIN_TAG_CHAR_PX = 6.5

const boxAround = (centre: Point, width: number, height: number): Box => ({
  left: centre.x - width / 2 - GAP_PX / 2,
  right: centre.x + width / 2 + GAP_PX / 2,
  top: centre.y - height / 2 - GAP_PX / 2,
  bottom: centre.y + height / 2 + GAP_PX / 2,
})

const overlaps = (a: Box, b: Box): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

const priority = (a: PinGroup, b: PinGroup): number =>
  Number(b.kind === 'near') - Number(a.kind === 'near') ||
  b.dealCount - a.dealCount ||
  a.label.localeCompare(b.label)

const absorb = (target: PlacedGroup, extra: PinGroup): PlacedGroup => ({
  ...target,
  // A merged cluster spans multiple areas; show its count without a misleading area name.
  compact: true,
  dealCount: target.dealCount + extra.dealCount,
  venues: [...target.venues, ...extra.venues],
})

const pillBox = (group: PinGroup, at: Point): Box =>
  boxAround(
    at,
    Math.max(group.label.length * PILL_CHAR_PX, PILL_META_PX) + PILL_CHROME_PX,
    PILL_HEIGHT_PX,
  )

export const pinBox = (pin: Pick<VenuePin, 'deals'>, at: Point): Box => {
  const tag = pinTag(pin.deals)
  const width =
    PIN_CHROME_PX +
    pinBadgeText(pin.deals).length * PIN_CHAR_PX +
    (tag ? PIN_TAG_CHROME_PX + tag.text.length * PIN_TAG_CHAR_PX : 0)
  return {
    left: at.x - width / 2 - GAP_PX / 2,
    right: at.x + width / 2 + GAP_PX / 2,
    top: at.y - PIN_RISE_PX - GAP_PX / 2,
    bottom: at.y + PIN_DROP_PX + GAP_PX / 2,
  }
}

const shift = (at: Point, by: Point): Point => ({ x: at.x + by.x, y: at.y + by.y })

const place = (
  placed: readonly Placed[],
  pins: readonly Box[],
  group: PinGroup,
  at: Point,
): readonly Placed[] => {
  const fits = (box: Box) =>
    !placed.some((item) => overlaps(item.box, box)) && !pins.some((pin) => overlaps(pin, box))
  const asDot = (offset: Point): Placed => ({
    group: { ...group, compact: true, offset },
    box: boxAround(shift(at, offset), DOT_PX, DOT_PX),
  })
  const asPill = (offset: Point): Placed => ({
    group: { ...group, compact: false, offset },
    box: pillBox(group, shift(at, offset)),
  })

  const inPlace = group.compact ? asDot(NO_OFFSET) : asPill(NO_OFFSET)
  if (fits(inPlace.box)) return [...placed, inPlace]
  const coversNearYou = placed.some(
    (item) => item.group.kind === 'near' && overlaps(item.box, inPlace.box),
  )
  const nudged = coversNearYou
    ? NEAR_YOU_NUDGES.map(asPill).find((candidate) => fits(candidate.box))
    : undefined
  if (nudged) return [...placed, nudged]

  const dot = asDot(NO_OFFSET)
  if (fits(dot.box)) return [...placed, dot]
  const target = placed.find((item) => overlaps(item.box, dot.box) && item.group.kind !== 'near')
  if (target)
    return placed.map((item) =>
      item === target ? { ...item, group: absorb(item.group, group) } : item,
    )
  const aside = DOT_NUDGES.map(asDot).find((candidate) => fits(candidate.box))
  return [...placed, aside ?? dot]
}

// `obstacles` is the room already taken by pins and stacks (clusterPins' `boxes`).
export const declutter = (
  groups: readonly PinGroup[],
  project: (point: Coordinates) => Point,
  obstacles: readonly Box[] = [],
): readonly PlacedGroup[] =>
  [...groups]
    .sort(priority)
    .reduce<readonly Placed[]>(
      (placed, group) => place(placed, obstacles, group, project(group.centre)),
      [],
    )
    .map((item) => item.group)

export type PinLayout = {
  // Outlets drawn as their own pin.
  readonly pins: readonly VenuePin[]
  // Outlets whose pins would overlap, each lot drawn as one count dot.
  readonly stacks: readonly PlacedGroup[]
  // The room both take on screen, for the groups to keep clear of.
  readonly boxes: readonly Box[]
}

type Cluster = {
  readonly members: readonly [VenuePin, ...VenuePin[]]
  readonly at: Point
  readonly box: Box
}

// Outlets with more deals claim their spot first, so the busiest stays a full pin; the id keeps
// ties in the same order on every redraw.
const pinPriority = (a: VenuePin, b: VenuePin): number =>
  b.deals.length - a.deals.length || a.id.localeCompare(b.id)

const toStack = ([leader, ...rest]: readonly [VenuePin, ...VenuePin[]]): PlacedGroup => ({
  key: `stack:${leader.id}`,
  kind: 'stack',
  label: leader.name,
  dealCount: [leader, ...rest].reduce((sum, venue) => sum + venue.deals.length, 0),
  centre: { lat: leader.lat, lng: leader.lng },
  venues: [leader, ...rest],
  compact: true,
  offset: NO_OFFSET,
})

// Positions are in projected pixels at one zoom, so panning never changes the result; only a
// new zoom (or new pins) can. A stack stays on its first pin's spot, which no other pin touched.
export const clusterPins = (
  pins: readonly VenuePin[],
  project: (point: Coordinates) => Point,
): PinLayout => {
  const clusters: Cluster[] = []
  for (const pin of [...pins].sort(pinPriority)) {
    const at = project(pin)
    const box = pinBox(pin, at)
    const index = clusters.findIndex((cluster) => overlaps(cluster.box, box))
    const hit = clusters[index]
    if (!hit) clusters.push({ members: [pin], at, box })
    else
      clusters[index] = {
        ...hit,
        members: [...hit.members, pin],
        box: {
          left: hit.at.x - STACK_WIDTH_PX / 2 - GAP_PX / 2,
          right: hit.at.x + STACK_WIDTH_PX / 2 + GAP_PX / 2,
          top: hit.at.y - STACK_RISE_PX - GAP_PX / 2,
          bottom: hit.at.y + STACK_DROP_PX + GAP_PX / 2,
        },
      }
  }
  return {
    pins: clusters.flatMap((cluster) => (cluster.members.length === 1 ? cluster.members : [])),
    stacks: clusters
      .filter((cluster) => cluster.members.length > 1)
      .map((cluster) => toStack(cluster.members)),
    boxes: clusters.map((cluster) => cluster.box),
  }
}
