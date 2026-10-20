import { DEAL_CUISINE_LABELS } from '@broke-oclock/contracts/deal-cuisines'
import { formatCategory } from '@web/modules/browse-map/deal-format'
import {
  type BrowseFilters,
  createDefaultFilters,
  OFFER_TYPE_LABELS,
  updateFilters,
} from '@web/modules/browse-map/filters'

// Removable tokens above the results, one per active filter. `next` is the filter state with
// that one filter removed.
export type FilterToken = {
  readonly key: string
  readonly label: string
  readonly next: BrowseFilters
}

const ENDING_LABELS = { today: 'Ending today', week: 'Ending this week' } as const
const CENTS = 100

export const activeFilterTokens = (filters: BrowseFilters): readonly FilterToken[] => {
  const defaults = createDefaultFilters()
  const tokens: FilterToken[] = []
  if (filters.q)
    tokens.push({ key: 'q', label: `Search: ${filters.q}`, next: updateFilters(filters, 'q', '') })
  if (filters.priceMaxMinor !== null) {
    tokens.push({
      key: 'max',
      label: `Up to $${(filters.priceMaxMinor / CENTS).toFixed(2)}`,
      next: updateFilters(filters, 'priceMaxMinor', null),
    })
  }
  for (const category of filters.categories) {
    tokens.push({
      key: `cat-${category}`,
      label: formatCategory(category),
      next: updateFilters(
        filters,
        'categories',
        filters.categories.filter((item) => item !== category),
      ),
    })
  }
  for (const cuisine of filters.cuisines) {
    tokens.push({
      key: `cuisine-${cuisine}`,
      label: DEAL_CUISINE_LABELS[cuisine],
      next: updateFilters(
        filters,
        'cuisines',
        filters.cuisines.filter((item) => item !== cuisine),
      ),
    })
  }
  for (const type of filters.offerTypes) {
    tokens.push({
      key: `type-${type}`,
      label: OFFER_TYPE_LABELS[type],
      next: updateFilters(
        filters,
        'offerTypes',
        filters.offerTypes.filter((item) => item !== type),
      ),
    })
  }
  if (filters.walkMinutes !== null) {
    tokens.push({
      key: 'walk',
      label: `Within ${filters.walkMinutes} min`,
      next: updateFilters(filters, 'walkMinutes', null),
    })
  }
  if (filters.ending !== 'any') {
    tokens.push({
      key: 'when',
      label: ENDING_LABELS[filters.ending],
      next: updateFilters(filters, 'ending', 'any'),
    })
  }
  if (!filters.validNow) {
    tokens.push({
      key: 'now',
      label: 'Including expired',
      next: updateFilters(filters, 'validNow', defaults.validNow),
    })
  }
  return tokens
}
