import { areaFor, nearestArea } from '@web/modules/browse-map/cluster-area'
import { describe, expect, it } from 'vitest'

const ION_ORCHARD = { lat: 1.304, lng: 103.8318 }
const BUGIS_JUNCTION = { lat: 1.2995, lng: 103.8556 }
const TAMPINES_MALL = { lat: 1.3526, lng: 103.9447 }
const JEM = { lat: 1.3332, lng: 103.7436 }

describe('nearestArea', () => {
  it('names the neighbourhood a point sits in', () => {
    expect(nearestArea(ION_ORCHARD)).toBe('Orchard')
    expect(nearestArea(BUGIS_JUNCTION)).toBe('Bugis')
    expect(nearestArea(TAMPINES_MALL)).toBe('Tampines')
  })
})

describe('areaFor', () => {
  it('knows the planning region of the neighbourhood', () => {
    expect(areaFor(ION_ORCHARD).region).toBe('Central')
    expect(areaFor(TAMPINES_MALL).region).toBe('East')
    expect(areaFor(JEM).region).toBe('West')
  })
})
