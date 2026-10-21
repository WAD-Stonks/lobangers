import { isDealCuisine } from '@broke-oclock/contracts/deal-cuisines'
import type { SortKey } from '@web/modules/browse-map/apply-filters'
import {
  type BrowseFilters,
  createDefaultFilters,
  type EndingWindow,
  OFFER_TYPES,
  type OfferType,
  WALK_MINUTE_OPTIONS,
} from '@web/modules/browse-map/filters'
import type { LocationQuery, LocationQueryRaw } from 'vue-router'

// Filters <-> route query, e.g. ?q=laksa&cat=food&cuisine=japanese&max=5&now=1. Pure functions: a shared link
// reproduces the view, and the back button undoes a filter change. Defaults are left out so the
// plain map has a clean URL. Anything unknown or malformed falls back to the default.

export type ShellView = 'map' | 'list'

export const FILTER_QUERY_KEYS = [
  'q',
  'cat',
  'cuisine',
  'max',
  'now',
  'type',
  'walk',
  'when',
] as const

const MAX_QUERY_TEXT = 80
const MAX_LIST_ITEMS = 12
const MAX_PRICE_DOLLARS = 10_000
const CENTS = 100
const CATEGORY_PATTERN = /^[a-z][a-z_]{0,39}$/
const LIST_SEPARATOR = ','

const OFFER_SLUGS: Record<OfferType, string> = {
  BUY_ONE_GET_ONE: '1for1',
  PERCENT_OFF: 'percent',
  FIXED_PRICE: 'fixed',
  OTHER: 'other',
}
const ENDING_VALUES: readonly EndingWindow[] = ['today', 'week']
const SORT_VALUES: readonly SortKey[] = ['near', 'ending', 'newest']

const first = (value: LocationQuery[string] | undefined): string => {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === 'string' ? raw.trim() : ''
}

const list = (value: LocationQuery[string] | undefined): string[] =>
  first(value)
    .toLowerCase()
    .split(LIST_SEPARATOR)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_LIST_ITEMS)

const unique = <T>(items: readonly T[]): T[] => [...new Set(items)]

const parsePrice = (value: string): number | null => {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null
  const dollars = Number(value)
  return dollars <= MAX_PRICE_DOLLARS ? Math.round(dollars * CENTS) : null
}

const parseWalk = (value: string): number | null => {
  const minutes = Number(value)
  return (WALK_MINUTE_OPTIONS as readonly number[]).includes(minutes) ? minutes : null
}

export const filtersFromQuery = (query: LocationQuery): BrowseFilters => {
  const defaults = createDefaultFilters()
  const now = first(query.now)
  const when = first(query.when) as EndingWindow
  return {
    q: first(query.q).slice(0, MAX_QUERY_TEXT),
    categories: unique(list(query.cat).filter((item) => CATEGORY_PATTERN.test(item))).map((item) =>
      item.toUpperCase(),
    ),
    cuisines: unique(list(query.cuisine).map((item) => item.toUpperCase())).filter(isDealCuisine),
    priceMaxMinor: parsePrice(first(query.max)),
    validNow: now === '0' || now === 'false' ? false : defaults.validNow,
    offerTypes: unique(
      list(query.type).flatMap((slug) => OFFER_TYPES.filter((type) => OFFER_SLUGS[type] === slug)),
    ),
    walkMinutes: parseWalk(first(query.walk)),
    ending: ENDING_VALUES.includes(when) ? when : defaults.ending,
  }
}

const formatDollars = (minor: number): string => String(minor / CENTS)

export const filtersToQuery = (filters: BrowseFilters): Record<string, string> => ({
  ...(filters.q.trim() ? { q: filters.q.trim() } : {}),
  ...(filters.categories.length
    ? { cat: filters.categories.map((item) => item.toLowerCase()).join(LIST_SEPARATOR) }
    : {}),
  ...(filters.cuisines.length
    ? { cuisine: filters.cuisines.map((item) => item.toLowerCase()).join(LIST_SEPARATOR) }
    : {}),
  ...(filters.priceMaxMinor === null ? {} : { max: formatDollars(filters.priceMaxMinor) }),
  ...(filters.validNow ? {} : { now: '0' }),
  ...(filters.offerTypes.length
    ? { type: filters.offerTypes.map((type) => OFFER_SLUGS[type]).join(LIST_SEPARATOR) }
    : {}),
  ...(filters.walkMinutes === null ? {} : { walk: String(filters.walkMinutes) }),
  ...(filters.ending === 'any' ? {} : { when: filters.ending }),
})

// The current query with its filter keys replaced; view, sort and anything else survive.
export const withFilters = (query: LocationQuery, filters: BrowseFilters): LocationQueryRaw => {
  const kept = Object.fromEntries(
    Object.entries(query).filter(
      ([key]) => !(FILTER_QUERY_KEYS as readonly string[]).includes(key),
    ),
  )
  return { ...kept, ...filtersToQuery(filters) }
}

export const readView = (query: LocationQuery): ShellView =>
  first(query.view) === 'list' ? 'list' : 'map'

export const readSort = (query: LocationQuery): SortKey => {
  const sort = first(query.sort) as SortKey
  return SORT_VALUES.includes(sort) ? sort : 'near'
}
