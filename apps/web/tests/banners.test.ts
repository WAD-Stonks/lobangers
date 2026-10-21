import { categoryTiles, toggleCategory, toggleEndingSoon } from '@web/modules/browse-map/banners'
import { type BrowseFilters, createDefaultFilters } from '@web/modules/browse-map/filters'
import { describe, expect, it } from 'vitest'

const base = createDefaultFilters()

describe('toggleEndingSoon', () => {
  it('switches the ending-this-week filter on and off, leaving the rest alone', () => {
    const withQuery: BrowseFilters = { ...base, q: 'kopi' }
    const on = toggleEndingSoon(withQuery)
    expect(on).toEqual({ ...withQuery, ending: 'week' })
    expect(toggleEndingSoon(on)).toEqual({ ...withQuery, ending: 'any' })
  })
})

describe('toggleCategory', () => {
  it('adds or removes one category without touching the others', () => {
    const drinks = toggleCategory(base, 'DRINKS')
    expect(drinks.categories).toEqual(['DRINKS'])
    expect(toggleCategory(drinks, 'DESSERT').categories).toEqual(['DRINKS', 'DESSERT'])
    expect(toggleCategory(drinks, 'DRINKS').categories).toEqual([])
  })
})

describe('categoryTiles', () => {
  const counts: Record<string, number> = { FOOD: 25, DRINKS: 6, DESSERT: 0, SNACKS: 1, BAKERY: 0 }
  const countFor = (filters: BrowseFilters) => counts[filters.categories[0] ?? ''] ?? 0

  it('lists categories that have deals, busiest first, with counts and icons', () => {
    const tiles = categoryTiles(base, countFor)
    expect(tiles.map((t) => [t.code, t.count])).toEqual([
      ['FOOD', 25],
      ['DRINKS', 6],
      ['SNACKS', 1],
    ])
    expect(tiles[1]).toMatchObject({ label: 'Drinks', kind: 'kopi', active: false })
  })

  it('counts each category on its own, so picking one does not zero the others', () => {
    const tiles = categoryTiles({ ...base, categories: ['DRINKS'] }, countFor)
    expect(tiles.find((t) => t.code === 'FOOD')?.count).toBe(25)
    expect(tiles.find((t) => t.code === 'DRINKS')?.active).toBe(true)
  })
})
