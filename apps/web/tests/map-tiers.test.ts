import { NEAR_YOU_LABEL, planMapLayers, tierFor } from '@web/modules/browse-map/map-tiers'
import type { VenuePin } from '@web/modules/browse-map/types'
import { describe, expect, it } from 'vitest'
import { makeDeal } from './support/shell-fixtures'

const venue = (id: string, lat: number, lng: number, deals = 1): VenuePin => ({
  id,
  name: id,
  lat,
  lng,
  deals: Array.from({ length: deals }, (_, index) =>
    makeDeal({ id: `${id}${index}`.padEnd(24, '0') }),
  ),
})

// The visitor stands in Tiong Bahru; only the market is within a ten-minute walk.
const USER = { lat: 1.286, lng: 103.827 }
const TIONG_BAHRU_MARKET = venue('market', 1.285, 103.832, 2)
const ION_ORCHARD = venue('ion', 1.304, 103.8318, 3)
const BUGIS_JUNCTION = venue('junction', 1.2995, 103.8556, 1)
const BUGIS_PLUS = venue('bugisplus', 1.3, 103.855, 2)
const MAXWELL = venue('maxwell', 1.2803, 103.8448, 1)
const TAMPINES_MALL = venue('tampines', 1.3526, 103.9447, 4)
const PINS = [TIONG_BAHRU_MARKET, ION_ORCHARD, BUGIS_JUNCTION, BUGIS_PLUS, MAXWELL, TAMPINES_MALL]

const ids = (pins: readonly VenuePin[]) => pins.map((pin) => pin.id).sort()

describe('tierFor', () => {
  it('shows regions at island zoom, neighbourhoods in between and pins at street zoom', () => {
    expect(tierFor(11)).toBe('region')
    expect(tierFor(12)).toBe('region')
    expect(tierFor(13)).toBe('area')
    expect(tierFor(15)).toBe('area')
    expect(tierFor(16)).toBe('street')
    expect(tierFor(19)).toBe('street')
  })
})

describe('planMapLayers', () => {
  it('shows every outlet as a pin at street zoom', () => {
    const plan = planMapLayers({ pins: PINS, zoom: 16, user: USER, selectedVenueId: null })

    expect(ids(plan.loose)).toEqual(ids(PINS))
    expect(plan.groups).toEqual([])
  })

  it('keeps walkable deals as pins and gives each farther neighbourhood exactly one group', () => {
    const plan = planMapLayers({ pins: PINS, zoom: 15, user: USER, selectedVenueId: null })

    expect(ids(plan.loose)).toEqual(['market'])
    expect(plan.groups.map((group) => group.label).sort()).toEqual([
      'Bugis',
      'Chinatown',
      'Orchard',
      'Tampines',
    ])
    const bugis = plan.groups.find((group) => group.label === 'Bugis')
    expect(bugis?.kind).toBe('area')
    expect(bugis?.dealCount).toBe(3)
    expect(ids(bugis?.venues ?? [])).toEqual(['bugisplus', 'junction'])
  })

  it('places a group at the average position of its outlets', () => {
    const plan = planMapLayers({ pins: PINS, zoom: 15, user: USER, selectedVenueId: null })
    const bugis = plan.groups.find((group) => group.label === 'Bugis')

    expect(bugis?.centre.lat).toBeCloseTo((1.2995 + 1.3) / 2, 6)
    expect(bugis?.centre.lng).toBeCloseTo((103.8556 + 103.855) / 2, 6)
  })

  it('folds walkable deals into a "Near you" group on the visitor once zoomed out', () => {
    const plan = planMapLayers({ pins: PINS, zoom: 14, user: USER, selectedVenueId: null })
    const near = plan.groups.find((group) => group.kind === 'near')

    expect(plan.loose).toEqual([])
    expect(near?.label).toBe(NEAR_YOU_LABEL)
    expect(near?.centre).toEqual(USER)
    expect(near?.dealCount).toBe(2)
  })

  it('groups the rest by region at island zoom', () => {
    const plan = planMapLayers({ pins: PINS, zoom: 11, user: USER, selectedVenueId: null })
    const byLabel = new Map(plan.groups.map((group) => [group.label, group]))

    expect([...byLabel.keys()].sort()).toEqual(['Central', 'East', NEAR_YOU_LABEL])
    expect(byLabel.get('Central')?.dealCount).toBe(7)
    expect(byLabel.get('East')?.dealCount).toBe(4)
    expect(byLabel.get('Central')?.kind).toBe('region')
  })

  it('has no "Near you" without a located visitor', () => {
    const plan = planMapLayers({ pins: PINS, zoom: 15, user: null, selectedVenueId: null })

    expect(plan.loose).toEqual([])
    expect(plan.groups.some((group) => group.kind === 'near')).toBe(false)
    expect(plan.groups.find((group) => group.label === 'Tiong Bahru')?.dealCount).toBe(2)
  })

  it('always shows the selected outlet as a pin so the panel never points at a group', () => {
    const plan = planMapLayers({ pins: PINS, zoom: 11, user: USER, selectedVenueId: 'ion' })

    expect(ids(plan.loose)).toEqual(['ion'])
    expect(plan.groups.find((group) => group.label === 'Central')?.dealCount).toBe(4)
  })
})
