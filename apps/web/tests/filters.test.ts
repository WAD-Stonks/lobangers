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
      categories: [],
      cuisines: [],
      priceMaxMinor: null,
      validNow: true,
      offerTypes: [],
      walkMinutes: null,
      ending: 'any',
    })
  })

  it('returns a new object for each field and leaves the input alone', () => {
    const base = createDefaultFilters()
    const patches: { [K in keyof BrowseFilters]: BrowseFilters[K] } = {
      q: 'laksa',
      categories: ['FOOD'],
      cuisines: ['KOREAN'],
      priceMaxMinor: 500,
      validNow: false,
      offerTypes: ['PERCENT_OFF'],
      walkMinutes: 10,
      ending: 'today',
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

  it('counts only filters the quick chips and search do not cover', () => {
    const base = createDefaultFilters()
    expect(countSheetFilters(base)).toBe(0)
    // Search, the Under $5 chip and the Ending today chip all have their own control.
    expect(
      countSheetFilters({ ...base, q: 'kopi', priceMaxMinor: QUICK_PRICE_MINOR, ending: 'today' }),
    ).toBe(0)
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
  })
})
