import { DEAL_CUISINES } from '@broke-oclock/contracts/deal-cuisines'
import type { DealPin } from '@broke-oclock/contracts/deals'
import { api } from '@web/lib/api-client'
import {
  type AreaBounds,
  type FilterContext,
  filterDeals,
  filterVenues,
  isVerified,
  type SortKey,
  sortRows,
  uniqueDealCount,
} from '@web/modules/browse-map/apply-filters'
import { distanceMetres } from '@web/modules/browse-map/distance'
import type { BrowseFilters } from '@web/modules/browse-map/filters'
import { toDealRows, toDealsQuery, toVenuePins } from '@web/modules/browse-map/load-deals'
import { isWithinSingapore } from '@web/modules/browse-map/singapore-bounds'
import type { Coordinates, SelectedDeal, VenuePin } from '@web/modules/browse-map/types'
import { type GeolocationStatus, useGeolocation } from '@web/modules/browse-map/use-geolocation'
import {
  filtersFromQuery,
  readSort,
  readView,
  type ShellView,
  withFilters,
} from '@web/modules/map-shell/filter-query'
import { shellQuery } from '@web/modules/map-shell/shell-routes'
import {
  computed,
  type InjectionKey,
  inject,
  onBeforeUnmount,
  provide,
  ref,
  shallowRef,
  watch,
} from 'vue'
import type { LocationQuery, RouteLocationNormalizedLoaded, Router } from 'vue-router'

export type DealsStatus = 'loading' | 'ready' | 'error'
// push adds a history entry (Back undoes it); replace refines the current one.
export type HistoryMode = 'push' | 'replace'

const HOT_DEAL_LIMIT = 4
// "Ending today" and the hot card must move on while a tab stays open.
const CLOCK_TICK_MS = 60_000
const LOCATION_MESSAGES: Partial<Record<GeolocationStatus, string>> = {
  denied: 'Location access was refused, so the map shows all of Singapore.',
  unavailable: 'Location unavailable, so the map shows all of Singapore.',
}
const OUTSIDE_SINGAPORE_MESSAGE = 'You are outside Singapore, so the map shows the whole island.'

const endTime = (deal: DealPin) =>
  deal.validUntil === null ? Number.POSITIVE_INFINITY : new Date(deal.validUntil).getTime()

// Until there is a view count, "hot" means the soonest-ending verified deals (open question 2),
// topped up with other soonest-ending deals.
export const pickHotDeals = (pins: readonly VenuePin[], now: Date): readonly SelectedDeal[] => {
  const seen = new Set<string>()
  const candidates = pins.flatMap((venue) =>
    venue.deals
      .filter((deal) => deal.validUntil !== null && endTime(deal) > now.getTime())
      .map((deal) => ({ deal, venue, distanceMetres: null })),
  )
  const ranked = [...candidates].sort(
    (a, b) =>
      Number(isVerified(b.deal.votes)) - Number(isVerified(a.deal.votes)) ||
      endTime(a.deal) - endTime(b.deal),
  )
  return ranked
    .filter(({ deal }) => (seen.has(deal.id) ? false : Boolean(seen.add(deal.id))))
    .slice(0, HOT_DEAL_LIMIT)
}

type Deps = {
  readonly router: Router
  readonly route: RouteLocationNormalizedLoaded
  readonly geolocation?: Geolocation
  readonly now?: () => Date
}

export const createShellState = ({ router, route, geolocation, now = () => new Date() }: Deps) => {
  const deals = shallowRef<readonly DealPin[]>([])
  const categories = shallowRef<readonly string[]>([])
  // Cuisine options follow the fixed list's order, limited to cuisines some loaded deal has.
  const cuisines = computed(() =>
    DEAL_CUISINES.filter((cuisine) => deals.value.some((deal) => deal.cuisine === cuisine)),
  )
  const status = ref<DealsStatus>('loading')
  const area = shallowRef<AreaBounds | null>(null)
  const hoveredVenueId = ref<string | null>(null)
  const outsideSingapore = ref(false)
  const geo = useGeolocation(geolocation)
  let latestRequest = 0

  const filters = computed(() => filtersFromQuery(route.query))
  const sort = computed(() => readSort(route.query))
  const view = computed(() => readView(route.query))

  const clock = ref(now())
  const tick = () => {
    clock.value = now()
  }
  const timer = setInterval(tick, CLOCK_TICK_MS)
  const onVisibility = () => {
    if (!document.hidden) tick()
  }
  document.addEventListener('visibilitychange', onVisibility)
  onBeforeUnmount(() => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibility)
  })

  const context = computed<FilterContext>(() => ({
    now: clock.value,
    position: geo.position.value,
    area: area.value,
  }))

  const pinsFor = (next: BrowseFilters): readonly VenuePin[] =>
    filterVenues(toVenuePins(filterDeals(deals.value, next, context.value)), next, context.value)

  // Every outlet with any loaded deal, unfiltered: deal and venue panels still resolve their
  // target when a filter hides it from the list.
  const allPins = computed(() => toVenuePins(deals.value))
  const pins = computed(() => pinsFor(filters.value))
  const rows = computed(() => sortRows(toDealRows(pins.value, geo.position.value), sort.value))
  const dealCount = computed(() => uniqueDealCount(pins.value))
  const countFor = (next: BrowseFilters) => uniqueDealCount(pinsFor(next))
  const hotDeals = computed(() => pickHotDeals(pins.value, context.value.now))

  const locationMessage = computed(() =>
    outsideSingapore.value
      ? OUTSIDE_SINGAPORE_MESSAGE
      : (LOCATION_MESSAGES[geo.status.value] ?? ''),
  )

  const load = async (validNow: boolean) => {
    const request = ++latestRequest
    status.value = 'loading'
    try {
      const response = await api.deals.list(toDealsQuery({ validNow }))
      if (request !== latestRequest) return
      deals.value = response.items
      categories.value = response.categories
      status.value = 'ready'
    } catch (error) {
      if (request !== latestRequest) return
      console.error('Could not load deals', error)
      status.value = 'error'
    }
  }
  const reload = () => load(filters.value.validNow)
  watch(() => filters.value.validNow, load, { immediate: true })

  // From another panel, filters land on browse as a new history entry (Back returns to the
  // panel) and only shell keys travel along, never `at`, `redirect` or `notice`.
  const navigate = (query: Record<string, unknown>, mode: HistoryMode) => {
    if (route.name !== 'browse') {
      return router.push({ name: 'browse', query: shellQuery(query as LocationQuery) })
    }
    const location = { query: query as LocationQuery }
    return mode === 'push' ? router.push(location) : router.replace(location)
  }

  const applyFilters = (next: BrowseFilters, mode: HistoryMode = 'push') =>
    navigate(withFilters(route.query, next), mode)

  const setSort = (next: SortKey) => navigate({ ...route.query, sort: next }, 'replace')

  const setView = (next: ShellView) => {
    const { view: _drop, ...rest } = route.query
    return navigate(next === 'list' ? { ...rest, view: 'list' } : rest, 'push')
  }

  // Centre on the visitor when they are in Singapore; otherwise keep the island and say why.
  const locate = async (): Promise<Coordinates | null> => {
    const located = await geo.locate()
    outsideSingapore.value = located !== null && !isWithinSingapore(located)
    return located && !outsideSingapore.value ? { ...located } : null
  }

  const findVenuePin = (venueId: string) => allPins.value.find((pin) => pin.id === venueId) ?? null

  // A deal at a chosen outlet, else at its first loaded outlet.
  const findDeal = (dealId: string, venueId?: string | null): SelectedDeal | null => {
    const venues = allPins.value.filter((pin) => pin.deals.some((deal) => deal.id === dealId))
    const venue = venues.find((pin) => pin.id === venueId) ?? venues[0]
    const deal = venue?.deals.find((candidate) => candidate.id === dealId)
    if (!venue || !deal) return null
    const position = geo.position.value
    return { deal, venue, distanceMetres: position ? distanceMetres(position, venue) : null }
  }

  return {
    deals,
    categories,
    cuisines,
    status,
    filters,
    sort,
    view,
    pins,
    rows,
    dealCount,
    hotDeals,
    area,
    hoveredVenueId,
    position: geo.position,
    accuracyMetres: geo.accuracyMetres,
    geoStatus: geo.status,
    locationMessage,
    countFor,
    reload,
    applyFilters,
    setSort,
    setView,
    locate,
    findDeal,
    findVenuePin,
    setArea: (next: AreaBounds | null) => {
      area.value = next
    },
    setHovered: (venueId: string | null) => {
      hoveredVenueId.value = venueId
    },
  }
}

export type ShellState = ReturnType<typeof createShellState>

const SHELL_KEY: InjectionKey<ShellState> = Symbol('map-shell')

export const provideShellState = (deps: Deps): ShellState => {
  const state = createShellState(deps)
  provide(SHELL_KEY, state)
  return state
}

export const useShell = (): ShellState => {
  const state = inject(SHELL_KEY, null)
  if (!state) throw new Error('useShell() must be called inside MapShell')
  return state
}
