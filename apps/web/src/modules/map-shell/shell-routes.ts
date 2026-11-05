import { FILTER_QUERY_KEYS, readView, type ShellView } from '@web/modules/map-shell/filter-query'
import { SHEET_EXPANDED, SHEET_FULL } from '@web/modules/map-shell/use-shell-layout'
import type { LocationQuery, RouteLocationRaw, RouteRecordNameGeneric } from 'vue-router'

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

export const placeLocation = (
  query: LocationQuery,
  venueIds: readonly string[],
): RouteLocationRaw => ({
  name: 'place',
  params: { venueIds: venueIds.join(',') },
  query: shellQuery(query),
})

const LIST_PANELS: readonly string[] = ['browse', 'saved', 'deal', 'venue', 'place']

export const routeView = (route: {
  readonly name?: RouteRecordNameGeneric | null
  readonly query: LocationQuery
}): ShellView =>
  typeof route.name === 'string' && LIST_PANELS.includes(route.name) ? readView(route.query) : 'map'

const EXPANDED_PANELS = new Set(['squad-new', 'squad-join', 'squad-room'])
const FULL_HEIGHT_PANELS = new Set([
  'add-deal',
  'login',
  'register',
  'profile',
  'saved',
  'lobbie',
  'auth-required',
])

export const panelSnapFor = (
  name: RouteRecordNameGeneric | null | undefined,
  view: ShellView,
): number => {
  if (name === 'browse') return view === 'list' ? 2 : 1
  if (typeof name !== 'string') return 1
  if (EXPANDED_PANELS.has(name)) return SHEET_EXPANDED
  return FULL_HEIGHT_PANELS.has(name) ? SHEET_FULL : 1
}
