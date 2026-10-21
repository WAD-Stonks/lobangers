import type { DealCuisine } from '@broke-oclock/contracts/deal-cuisines'
import type { DealPin } from '@broke-oclock/contracts/deals'

// Filter state shared by the map, the list panel, the quick chips and the filter sheet. It lives
// in the route query (see map-shell/filter-query.ts), so a shared link reproduces the same view.
// Halal, vegetarian and "fresh in 24h" are left out until deals carry that data.
export type OfferType = DealPin['offerType']
export type EndingWindow = 'any' | 'today' | 'week'

export type BrowseFilters = {
  readonly q: string
  readonly categories: readonly string[]
  readonly cuisines: readonly DealCuisine[]
  readonly priceMaxMinor: number | null
  readonly validNow: boolean
  readonly offerTypes: readonly OfferType[]
  readonly walkMinutes: number | null
  readonly ending: EndingWindow
}

// The "Under $5" chip sets this cap; any other cap counts as a sheet filter.
export const QUICK_PRICE_MINOR = 500
export const WALK_MINUTE_OPTIONS = [5, 10, 15] as const
export const OFFER_TYPES: readonly OfferType[] = [
  'BUY_ONE_GET_ONE',
  'PERCENT_OFF',
  'FIXED_PRICE',
  'OTHER',
]
export const OFFER_TYPE_LABELS: Record<OfferType, string> = {
  BUY_ONE_GET_ONE: '1-for-1',
  PERCENT_OFF: '% off',
  FIXED_PRICE: 'Fixed price',
  OTHER: 'Other',
}

export const createDefaultFilters = (): BrowseFilters => ({
  q: '',
  categories: [],
  cuisines: [],
  priceMaxMinor: null,
  validNow: true,
  offerTypes: [],
  walkMinutes: null,
  ending: 'any',
})

export const updateFilters = <K extends keyof BrowseFilters>(
  filters: BrowseFilters,
  key: K,
  value: BrowseFilters[K],
): BrowseFilters => ({ ...filters, [key]: value })

// New list with the value added, or removed if it was already there.
export const toggleValue = <T>(list: readonly T[], value: T): readonly T[] =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value]

// Badge on "All filters": active filters that search and the quick chips don't already show.
export const countSheetFilters = (filters: BrowseFilters): number =>
  filters.categories.length +
  filters.cuisines.length +
  filters.offerTypes.length +
  (filters.priceMaxMinor !== null && filters.priceMaxMinor !== QUICK_PRICE_MINOR ? 1 : 0) +
  (filters.walkMinutes !== null ? 1 : 0) +
  (filters.ending === 'week' ? 1 : 0) +
  (filters.validNow ? 0 : 1)
