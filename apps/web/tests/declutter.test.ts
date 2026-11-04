import { clusterPins, declutter, pinBox } from '@web/modules/browse-map/declutter'
import type { PinGroup } from '@web/modules/browse-map/map-tiers'
import type { Coordinates } from '@web/modules/browse-map/types'
import { makeDeal } from '@web-tests/support/shell-fixtures'
import { describe, expect, it } from 'vitest'

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
  it('preserves a country-level count circle and its anchor', () => {
    const country = { ...group('Singapore', 100, 100, 13, 'region'), compact: true }
    const [placed] = declutter([country], project)
    expect(placed?.compact).toBe(true)
    expect(placed?.centre).toEqual(country.centre)
    expect(placed?.offset).toEqual({ x: 0, y: 0 })
  })

  it('leaves groups that do not touch as full pills', () => {
    const placed = declutter([group('Orchard', 0, 0, 5), group('Bugis', 400, 0, 3)], project)

    expect(placed.map((item) => [item.label, item.compact])).toEqual([
      ['Orchard', false],
      ['Bugis', false],
    ])
  })

  it('shrinks the smaller of two overlapping pills to a count dot', () => {
    const placed = declutter([group('Bugis', 150, 0, 3), group('Orchard', 0, 0, 9)], project)
    const bugis = placed.find((item) => item.label === 'Bugis')

    expect(placed.find((item) => item.label === 'Orchard')?.compact).toBe(false)
    expect(bugis?.compact).toBe(true)
  })

  it('merges a group into its neighbour when even a dot would overlap', () => {
    const placed = declutter([group('Orchard', 0, 0, 9), group('Somerset', 4, 0, 2)], project)

    expect(placed).toHaveLength(1)
    expect(placed[0]?.label).toBe('Orchard')
    expect(placed[0]?.dealCount).toBe(11)
    expect(placed[0]?.compact).toBe(true)
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
    expect(central?.offset).toEqual({ x: 0, y: -52 })
  })

  it('tries below "Near you" when above is taken', () => {
    const placed = declutter(
      [group('Near you', 0, 0, 2, 'near'), group('Orchard', 0, -52, 9), group('Outram', 4, 0, 6)],
      project,
    )

    expect(placed.find((item) => item.label === 'Outram')?.offset).toEqual({ x: 0, y: 52 })
  })

  it('never folds far-away deals into "Near you"', () => {
    const placed = declutter(
      [
        group('Near you', 0, 0, 2, 'near'),
        group('Orchard', 0, -52, 9),
        group('Tiong Bahru', 0, 52, 8),
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

  it('keeps a pill off the deal pins shown beside it', () => {
    const pin = pinBox({ deals: [makeDeal({})] }, { x: 0, y: 0 })
    const placed = declutter([group('Bugis', 0, -30, 3)], project, [pin])
    const bugis = placed[0]

    expect(bugis?.compact).toBe(true)
    expect(bugis?.offset).not.toEqual({ x: 0, y: 0 })
  })

  it('leaves a pill alone when the pins are well clear of it', () => {
    const pin = pinBox({ deals: [makeDeal({})] }, { x: 400, y: 0 })
    const [bugis] = declutter([group('Bugis', 0, 0, 3)], project, [pin])

    expect(bugis?.compact).toBe(false)
    expect(bugis?.offset).toEqual({ x: 0, y: 0 })
  })
})

const outlet = (id: string, x: number, y: number, deals = 1) => ({
  id,
  name: id,
  lat: -y,
  lng: x,
  deals: Array.from({ length: deals }, () => makeDeal({})),
})

describe('clusterPins', () => {
  it('keeps pins that do not touch as pins', () => {
    const layout = clusterPins([outlet('a', 0, 0), outlet('b', 400, 0)], project)

    expect(layout.pins.map((pin) => pin.id)).toEqual(['a', 'b'])
    expect(layout.stacks).toEqual([])
  })

  it('stacks pins whose ovals would overlap, on the busiest outlet', () => {
    const layout = clusterPins([outlet('a', 0, 0), outlet('b', 60, 10, 3)], project)

    expect(layout.pins).toEqual([])
    expect(layout.stacks).toHaveLength(1)
    expect(layout.stacks[0]).toMatchObject({ kind: 'stack', compact: true, dealCount: 4 })
    expect(layout.stacks[0]?.centre).toEqual({ lat: -10, lng: 60 })
    expect(layout.stacks[0]?.venues.map((venue) => venue.id)).toEqual(['b', 'a'])
  })

  it('stacks pins that overlap even when well apart sideways, since the ovals are wide', () => {
    const layout = clusterPins([outlet('a', 0, 0), outlet('b', 110, 0)], project)

    expect(layout.stacks).toHaveLength(1)
  })

  it('leaves a pin clear of a stack once the stacked pins shrink to a dot', () => {
    const layout = clusterPins(
      [outlet('a', 0, 0, 2), outlet('b', 20, 0), outlet('c', 0, 120)],
      project,
    )

    expect(layout.stacks).toHaveLength(1)
    expect(layout.pins.map((pin) => pin.id)).toEqual(['c'])
    expect(layout.boxes).toHaveLength(2)
  })
})
