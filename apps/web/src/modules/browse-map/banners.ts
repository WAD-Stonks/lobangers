import { DEAL_CATEGORIES, type DealCategory } from '@broke-oclock/contracts/deal-categories'
import { categoryStyle } from '@web/modules/browse-map/category-style'
import { type BrowseFilters, toggleValue } from '@web/modules/browse-map/filters'
import { type FoodKind, foodKindForCategory } from '@web/modules/browse-map/food-kind'

export type CategoryTile = {
  readonly code: DealCategory
  readonly label: string
  readonly kind: FoodKind
  readonly tint: string
  readonly count: number
  readonly active: boolean
}

const CATEGORY_LABELS: Record<DealCategory, string> = {
  FOOD: 'Food',
  DRINKS: 'Drinks',
  DESSERT: 'Dessert',
  SNACKS: 'Snacks',
  BAKERY: 'Bakery',
}

export const toggleEndingSoon = (filters: BrowseFilters): BrowseFilters => ({
  ...filters,
  ending: filters.ending === 'week' ? 'any' : 'week',
})

export const toggleCategory = (filters: BrowseFilters, code: DealCategory): BrowseFilters => ({
  ...filters,
  categories: toggleValue(filters.categories, code),
})

export const categoryTiles = (
  filters: BrowseFilters,
  countFor: (next: BrowseFilters) => number,
): readonly CategoryTile[] =>
  DEAL_CATEGORIES.map((code) => {
    const style = categoryStyle(code)
    return {
      code,
      label: CATEGORY_LABELS[code],
      kind: foodKindForCategory(code),
      tint: style.tint,
      count: countFor({ ...filters, categories: [code] }),
      active: filters.categories.includes(code),
    }
  })
    .filter((tile) => tile.count > 0)
    .sort((a, b) => b.count - a.count)
