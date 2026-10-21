import { declutter } from '@web/modules/browse-map/declutter'
import type { PinGroup } from '@web/modules/browse-map/map-tiers'
import type { Coordinates } from '@web/modules/browse-map/types'
import { describe, expect, it } from 'vitest'
import { makeDeal } from './support/shell-fixtures'

// One unit of lat or lng is one pixel, so positions in the tests read as screen positions.
const project = (point: Coordinates) => ({ x: point.lng, y: -point.lat })

const group = (
  key: string,
  x: number,
  y: number,
  dealCount: number,
  kind: PinGroup['kind'] = 'area',
): PinGroup => ({
  key,
  kind,
  label: key,
  dealCount,
  centre: { lat: -y, lng: x },
  venues: [
    {
      id: key,
      name: key,
      lat: -y,
      lng: x,
      deals: Array.from({ length: dealCount }, () => makeDeal({})),
    },
  ],
})

describe('declutter', () => {
  it('leaves groups that do not touch as full pills', () => {
    const placed = declutter([group('Orchard', 0, 0, 5), group('Bugis', 400, 0, 3)], project)

    expect(placed.map((item) => [item.label, item.compact])).toEqual([
      ['Orchard', false],
      ['Bugis', false],
    ])
  })

  it('shrinks the smaller of two overlapping pills to a count dot', () => {
    const placed = declutter([group('Bugis', 90, 0, 3), group('Orchard', 0, 0, 9)], project)
    const bugis = placed.find((item) => item.label === 'Bugis')

    expect(placed.find((item) => item.label === 'Orchard')?.compact).toBe(false)
    expect(bugis?.compact).toBe(true)
  })

  it('merges a group into its neighbour when even a dot would overlap', () => {
    const placed = declutter([group('Orchard', 0, 0, 9), group('Somerset', 4, 0, 2)], project)

    expect(placed).toHaveLength(1)
    expect(placed[0]?.label).toBe('Orchard')
    expect(placed[0]?.dealCount).toBe(11)
    expect(placed[0]?.venues.map((venue) => venue.id)).toEqual(['Orchard', 'Somerset'])
  })

  it('moves a group out from under "Near you" instead of hiding it there', () => {
    const placed = declutter(
      [group('Near you', 0, 0, 2, 'near'), group('Central', 4, 0, 60, 'region')],
      project,
    )
    const central = placed.find((item) => item.label === 'Central')

    expect(placed).toHaveLength(2)
    expect(placed.find((item) => item.kind === 'near')?.dealCount).toBe(2)
    expect(central?.compact).toBe(false)
    expect(central?.offset).toEqual({ x: 0, y: -42 })
  })

  it('tries below "Near you" when above is taken', () => {
    const placed = declutter(
      [group('Near you', 0, 0, 2, 'near'), group('Orchard', 0, -42, 9), group('Outram', 4, 0, 6)],
      project,
    )

    expect(placed.find((item) => item.label === 'Outram')?.offset).toEqual({ x: 0, y: 42 })
  })

  it('never folds far-away deals into "Near you"', () => {
    const placed = declutter(
      [
        group('Near you', 0, 0, 2, 'near'),
        group('Orchard', 0, -42, 9),
        group('Tiong Bahru', 0, 42, 8),
        group('Outram', 4, 0, 6),
      ],
      project,
    )

    expect(placed.find((item) => item.kind === 'near')?.dealCount).toBe(2)
    expect(placed.find((item) => item.label === 'Outram')?.compact).toBe(true)
  })

  it('places "Near you" first whatever its size', () => {
    const placed = declutter(
      [group('Outram', 60, 0, 30), group('Near you', 0, 0, 1, 'near')],
      project,
    )

    expect(placed.find((item) => item.kind === 'near')?.offset).toEqual({ x: 0, y: 0 })
    expect(placed.find((item) => item.label === 'Outram')?.offset).not.toEqual({ x: 0, y: 0 })
  })
})
