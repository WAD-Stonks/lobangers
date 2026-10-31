import { createDefaultFilters } from '@web/modules/browse-map/filters'
import {
  filtersFromQuery,
  filtersToQuery,
  readSort,
  readView,
  withFilters,
} from '@web/modules/map-shell/filter-query'
import { describe, expect, it } from 'vitest'

describe('filter query', () => {
  it('produces an empty query for the default filters', () => {
    expect(filtersToQuery(createDefaultFilters())).toEqual({})
    expect(filtersFromQuery({})).toEqual(createDefaultFilters())
  })

  it('round-trips every field exactly', () => {
    const filters = {
      q: 'laksa',
      categories: ['FOOD', 'DRINKS'],
      cuisines: ['JAPANESE', 'KOREAN'] as const,
      priceMaxMinor: 550,
      validNow: false,
      offerTypes: ['PERCENT_OFF', 'BUY_ONE_GET_ONE'] as const,
      walkMinutes: 10,
      ending: 'week' as const,
    }
    const query = filtersToQuery(filters)
    expect(query).toEqual({
      q: 'laksa',
      cat: 'food,drinks',
      cuisine: 'japanese,korean',
      max: '5.5',
      now: '0',
      type: 'percent,1for1',
      walk: '10',
      when: 'week',
    })
    expect(filtersFromQuery(query as Record<string, string>)).toEqual(filters)
  })

  it('keeps only cuisines from the fixed list', () => {
    expect(filtersFromQuery({ cuisine: 'Japanese,fusion,japanese,CAFE' }).cuisines).toEqual([
      'JAPANESE',
      'CAFE',
    ])
  })

  it('reads the documented short form', () => {
    const filters = filtersFromQuery({ q: 'laksa', cat: 'food', max: '5', now: '1' })
    expect(filters).toMatchObject({
      q: 'laksa',
      categories: ['FOOD'],
      priceMaxMinor: 500,
      validNow: true,
    })
  })

  it('falls back to defaults for unknown or malformed values', () => {
    const filters = filtersFromQuery({
      cat: 'food,<script>,',
      max: '-3',
      now: 'maybe',
      type: 'free,percent',
      walk: '7',
      when: 'yesterday',
    })
    expect(filters).toEqual({
      ...createDefaultFilters(),
      categories: ['FOOD'],
      offerTypes: ['PERCENT_OFF'],
    })
    expect(filtersFromQuery({ max: 'abc', q: ['first', 'second'] })).toMatchObject({
      priceMaxMinor: null,
      q: 'first',
    })
  })

  it('never mutates the filters it is given', () => {
    const filters = Object.freeze({
      ...createDefaultFilters(),
      categories: Object.freeze(['FOOD']),
    })
    filtersToQuery(filters)
    expect(filters.categories).toEqual(['FOOD'])
  })

  it('swaps filter keys while keeping the view, sort and other keys', () => {
    const next = withFilters(
      { view: 'list', sort: 'ending', q: 'old', cat: 'food' },
      { ...createDefaultFilters(), q: 'new' },
    )
    expect(next).toEqual({ view: 'list', sort: 'ending', q: 'new' })
  })

  it('reads view and sort with safe defaults', () => {
    expect(readView({ view: 'list' })).toBe('list')
    expect(readView({ view: 'grid' })).toBe('map')
    expect(readSort({ sort: 'ending' })).toBe('ending')
    expect(readSort({})).toBe('near')
  })
})
