import { FILTER_QUERY_KEYS, readView, type ShellView } from '@web/modules/map-shell/filter-query'
import type { LocationQuery, RouteLocationRaw, RouteRecordNameGeneric } from 'vue-router'

// Links between shell panels carry the visitor's filters, sort and view along, so going back
// to the list shows the same results. Anything else in the query (at, redirect) is dropped.
const SHELL_QUERY_KEYS: readonly string[] = [
  ...FILTER_QUERY_KEYS,
  'sort',
  'view',
  'split',
  'discovery',
  'results',
  'collection',
]

export const shellQuery = (query: LocationQuery): LocationQuery =>
  Object.fromEntries(Object.entries(query).filter(([key]) => SHELL_QUERY_KEYS.includes(key)))

export const browseLocation = (query: LocationQuery): RouteLocationRaw => ({
  name: query.collection === 'saved' ? 'saved' : 'browse',
  query: shellQuery(query),
})

// `at` picks the outlet when a deal runs at several.
export const dealLocation = (
  query: LocationQuery,
  dealId: string,
  venueId?: string,
): RouteLocationRaw => ({
  name: 'deal',
  params: { dealId },
  query: { ...shellQuery(query), ...(venueId ? { at: venueId } : {}) },
})

export const lobbieLocation = (query: LocationQuery): RouteLocationRaw => ({
  name: 'lobbie',
  query: shellQuery(query),
})

export const lobbieDealLocation = (
  query: LocationQuery,
  dealId: string,
  venueId: string,
): RouteLocationRaw => ({
  name: 'deal',
  params: { dealId },
  query: { ...shellQuery(query), at: venueId, from: 'lobbie' },
})

export const venueLocation = (query: LocationQuery, venueId: string): RouteLocationRaw => ({
  name: 'venue',
  params: { venueId },
  query: shellQuery(query),
})

// Only deal browsing has an All Deals list. Every other panel (account prompts, Squad, codes,
// Lobbie) opens beside the map, even when its entry link carries the list's view.
const LIST_PANELS: readonly string[] = ['browse', 'saved', 'deal', 'venue']

export const routeView = (route: {
  readonly name?: RouteRecordNameGeneric | null
  readonly query: LocationQuery
}): ShellView =>
  typeof route.name === 'string' && LIST_PANELS.includes(route.name) ? readView(route.query) : 'map'

// Snap index (0 peek, 1 half, 2 full) a panel opens at on a bottom sheet. Forms and the list
// view need room; browsing and deal details leave the map visible.
const FULL_HEIGHT_PANELS = new Set([
  'add-deal',
  'login',
  'register',
  'profile',
  'saved',
  'squad-new',
  'squad-join',
  'squad-room',
])

export const panelSnapFor = (
  name: RouteRecordNameGeneric | null | undefined,
  view: ShellView,
): number => {
  if (name === 'browse') return view === 'list' ? 2 : 1
  return typeof name === 'string' && FULL_HEIGHT_PANELS.has(name) ? 2 : 1
}
