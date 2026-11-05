import {
  type BrowseFilters,
  countSheetFilters,
  createDefaultFilters,
  QUICK_PRICE_MINOR,
  toggleValue,
  updateFilters,
} from '@web/modules/browse-map/filters'
import { describe, expect, it } from 'vitest'

describe('browse filters', () => {
  it('gives every field a default', () => {
    expect(createDefaultFilters()).toEqual({
      q: '',
      location: '',
      categories: [],
      cuisines: [],
      priceMaxMinor: null,
      validNow: true,
      offerTypes: [],
      walkMinutes: null,
      ending: 'any',
      verifiedOnly: false,
    })
  })

  it('returns a new object for each field and leaves the input alone', () => {
    const base = createDefaultFilters()
    const patches: { [K in keyof BrowseFilters]: BrowseFilters[K] } = {
      q: 'laksa',
      location: 'Bedok',
      categories: ['FOOD'],
      cuisines: ['KOREAN'],
      priceMaxMinor: 500,
      validNow: false,
      offerTypes: ['PERCENT_OFF'],
      walkMinutes: 10,
      ending: 'today',
      verifiedOnly: true,
    }
    for (const key of Object.keys(patches) as (keyof BrowseFilters)[]) {
      const next = updateFilters(base, key, patches[key])
      expect(next).not.toBe(base)
      expect(next[key]).toEqual(patches[key])
    }
    expect(base).toEqual(createDefaultFilters())
  })

  it('toggles a value in or out of a list without mutating it', () => {
    const list = Object.freeze(['FOOD'])
    expect(toggleValue(list, 'DRINKS')).toEqual(['FOOD', 'DRINKS'])
    expect(toggleValue(list, 'FOOD')).toEqual([])
    expect(list).toEqual(['FOOD'])
  })

  it('counts all selected filters including quick chips, excluding search and defaults', () => {
    const base = createDefaultFilters()
    expect(countSheetFilters(base)).toBe(0)
    expect(countSheetFilters({ ...base, location: 'Bedok' })).toBe(1)
    expect(
      countSheetFilters({ ...base, q: 'kopi', priceMaxMinor: QUICK_PRICE_MINOR, ending: 'today' }),
    ).toBe(2)
    expect(
      countSheetFilters({
        ...base,
        categories: ['FOOD', 'DRINKS'],
        cuisines: ['MALAY'],
        offerTypes: ['OTHER'],
        priceMaxMinor: 800,
        walkMinutes: 5,
        ending: 'week',
        validNow: false,
      }),
    ).toBe(8)
    expect(countSheetFilters({ ...base, verifiedOnly: true })).toBe(1)
  })
})
