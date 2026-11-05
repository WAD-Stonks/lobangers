import { RAIL_STATIONS } from '@broke-oclock/contracts/rail-stations'
import { SINGAPORE_BOUNDS } from '@web/modules/browse-map/singapore-bounds'
import {
  LINE_STYLES,
  ringFor,
  STATIONS_FROM_ZOOM,
  stationsVisibleAt,
} from '@web/modules/browse-map/station-layer'
import { describe, expect, it } from 'vitest'

describe('station layer', () => {
  it('hides stations at island view', () => {
    expect(stationsVisibleAt(STATIONS_FROM_ZOOM - 1)).toBe(false)
    expect(stationsVisibleAt(STATIONS_FROM_ZOOM)).toBe(true)
  })

  it('places every station inside Singapore on at least one line of its kind', () => {
    for (const [name, kind, lat, lng, lines] of RAIL_STATIONS) {
      expect(lat).toBeGreaterThan(SINGAPORE_BOUNDS.south)
      expect(lat).toBeLessThan(SINGAPORE_BOUNDS.north)
      expect(lng).toBeGreaterThan(SINGAPORE_BOUNDS.west)
      expect(lng).toBeLessThan(SINGAPORE_BOUNDS.east)
      expect(lines.length, name).toBeGreaterThan(0)
      const lrtLines = lines.filter((line) => LINE_STYLES[line].name.endsWith('LRT'))
      if (kind === 'LRT') expect(lrtLines, name).toEqual(lines)
      else expect(lrtLines.length, name).toBeLessThan(lines.length)
    }
  })

  it('rings a one-line station in its colour and splits an interchange', () => {
    expect(ringFor(['NS'])).toBe('#d42e12')
    expect(ringFor(['NS', 'EW'])).toBe('conic-gradient(#d42e12 0deg 180deg, #009645 180deg 360deg)')
    expect(ringFor(['BP', 'SK'])).toBe('#748477')
  })
})
