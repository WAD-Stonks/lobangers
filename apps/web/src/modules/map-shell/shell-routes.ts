import { FILTER_QUERY_KEYS, type ShellView } from '@web/modules/map-shell/filter-query'
import type { LocationQuery, RouteLocationRaw, RouteRecordNameGeneric } from 'vue-router'

// Links between shell panels carry the visitor's filters, sort and view along, so going back
// to the list shows the same results. Anything else in the query (at, redirect) is dropped.
const SHELL_QUERY_KEYS: readonly string[] = [...FILTER_QUERY_KEYS, 'sort', 'view']

export const shellQuery = (query: LocationQuery): LocationQuery =>
  Object.fromEntries(Object.entries(query).filter(([key]) => SHELL_QUERY_KEYS.includes(key)))

export const browseLocation = (query: LocationQuery): RouteLocationRaw => ({
  name: 'browse',
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

export const venueLocation = (query: LocationQuery, venueId: string): RouteLocationRaw => ({
  name: 'venue',
  params: { venueId },
  query: shellQuery(query),
})

// Snap index (0 peek, 1 half, 2 full) a panel opens at on a bottom sheet. Forms and the list
// view need room; browsing and deal details leave the map visible.
const FULL_HEIGHT_PANELS = new Set([
  'add-deal',
  'login',
  'register',
  'profile',
  'saved',
  'merchant',
])

export const panelSnapFor = (
  name: RouteRecordNameGeneric | null | undefined,
  view: ShellView,
): number => {
  if (name === 'browse') return view === 'list' ? 2 : 1
  return typeof name === 'string' && FULL_HEIGHT_PANELS.has(name) ? 2 : 1
}
