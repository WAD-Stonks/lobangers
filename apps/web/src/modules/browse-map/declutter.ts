import type { PinGroup } from '@web/modules/browse-map/map-tiers'
import type { Coordinates } from '@web/modules/browse-map/types'

// Neighbouring pills must never sit on top of each other. Bigger groups claim their spot
// first ("Near you" before all). "Near you" sits wherever the visitor happens to be, so a pill
// it covers is moved just above or below it. Otherwise a group that would overlap shrinks to a
// count dot, and one whose dot would still overlap folds into the group it hits. Nothing far
// away is ever folded into "Near you", which would make it lie about walking distance.
type Point = { readonly x: number; readonly y: number }

// `offset` (px) is where the pill is drawn relative to the group's real centre.
export type PlacedGroup = PinGroup & { readonly compact: boolean; readonly offset: Point }

type Box = {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}
type Placed = { readonly group: PlacedGroup; readonly box: Box }

// Rough rendered sizes (px) of the pill in DealMap.vue; a few px of slack is fine.
const PILL_HEIGHT_PX = 36
const PILL_CHAR_PX = 8.6
const PILL_CHROME_PX = 66
const DOT_PX = 34
const GAP_PX = 6
const NUDGE_PX = PILL_HEIGHT_PX + GAP_PX
const NO_OFFSET: Point = { x: 0, y: 0 }
const NEAR_YOU_NUDGES: readonly Point[] = [
  { x: 0, y: -NUDGE_PX },
  { x: 0, y: NUDGE_PX },
]

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
  dealCount: target.dealCount + extra.dealCount,
  venues: [...target.venues, ...extra.venues],
})

const pillBox = (group: PinGroup, at: Point): Box =>
  boxAround(at, group.label.length * PILL_CHAR_PX + PILL_CHROME_PX, PILL_HEIGHT_PX)

const shift = (at: Point, by: Point): Point => ({ x: at.x + by.x, y: at.y + by.y })

const place = (placed: readonly Placed[], group: PinGroup, at: Point): readonly Placed[] => {
  const fits = (box: Box) => !placed.some((item) => overlaps(item.box, box))
  const asPill = (offset: Point): Placed => ({
    group: { ...group, compact: false, offset },
    box: pillBox(group, shift(at, offset)),
  })

  const inPlace = asPill(NO_OFFSET)
  if (fits(inPlace.box)) return [...placed, inPlace]
  const coversNearYou = placed.some(
    (item) => item.group.kind === 'near' && overlaps(item.box, inPlace.box),
  )
  const nudged = coversNearYou
    ? NEAR_YOU_NUDGES.map(asPill).find((candidate) => fits(candidate.box))
    : undefined
  if (nudged) return [...placed, nudged]

  const dot = boxAround(at, DOT_PX, DOT_PX)
  const target = placed.find((item) => overlaps(item.box, dot) && item.group.kind !== 'near')
  if (!target)
    return [...placed, { group: { ...group, compact: true, offset: NO_OFFSET }, box: dot }]
  return placed.map((item) =>
    item === target ? { ...item, group: absorb(item.group, group) } : item,
  )
}

export const declutter = (
  groups: readonly PinGroup[],
  project: (point: Coordinates) => Point,
): readonly PlacedGroup[] =>
  [...groups]
    .sort(priority)
    .reduce<readonly Placed[]>((placed, group) => place(placed, group, project(group.centre)), [])
    .map((item) => item.group)
