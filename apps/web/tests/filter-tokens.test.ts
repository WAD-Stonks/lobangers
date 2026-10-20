import { activeFilterTokens } from '@web/modules/browse-map/filter-tokens'
import { createDefaultFilters } from '@web/modules/browse-map/filters'
import { describe, expect, it } from 'vitest'

describe('active filter tokens', () => {
  it('has no tokens for the default filters', () => {
    expect(activeFilterTokens(createDefaultFilters())).toEqual([])
  })

  it('lists each active filter with the filters left after removing it', () => {
    const filters = {
      ...createDefaultFilters(),
      q: 'kopi',
      categories: ['FOOD', 'FAST_FOOD'],
      cuisines: ['JAPANESE'] as const,
      priceMaxMinor: 500,
      offerTypes: ['BUY_ONE_GET_ONE'] as const,
      walkMinutes: 10,
      ending: 'today' as const,
      validNow: false,
    }
    const tokens = activeFilterTokens(filters)
    expect(tokens.map((token) => token.label)).toEqual([
      'Search: kopi',
      'Up to $5.00',
      'Food',
      'Fast food',
      'Japanese',
      '1-for-1',
      'Within 10 min',
      'Ending today',
      'Including expired',
    ])
    const fastFood = tokens.find((token) => token.label === 'Fast food')
    expect(fastFood?.next.categories).toEqual(['FOOD'])
    expect(tokens.find((token) => token.label === 'Japanese')?.next.cuisines).toEqual([])
    expect(tokens[0]?.next.q).toBe('')
    expect(tokens.at(-1)?.next.validNow).toBe(true)
    expect(filters.categories).toEqual(['FOOD', 'FAST_FOOD'])
  })
})
