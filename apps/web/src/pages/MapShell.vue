<script setup lang="ts">
import TicketLoader from '@web/components/TicketLoader.vue'
import AuthPrompt from '@web/modules/account/AuthPrompt.vue'
import { authPrompt } from '@web/modules/account/auth-prompt'
import '@web/modules/map-shell/shell-ui.css'
import '@web/modules/map-shell/motion.css'
import { authClient } from '@web/lib/auth-client'
import BrowseListPanel from '@web/modules/browse-map/BrowseListPanel.vue'
import DealDetailsDialog from '@web/modules/browse-map/DealDetailsDialog.vue'
import DealMap from '@web/modules/browse-map/DealMap.vue'
import type { BrowseFilters } from '@web/modules/browse-map/filters'
import { FOCUS_ZOOM, LOCATE_ZOOM } from '@web/modules/browse-map/map-config'
import type { Coordinates, SelectedDeal } from '@web/modules/browse-map/types'
import { BANNER_LIFE_MS } from '@web/modules/flash-drop/banner-schedule'
import FlashEdgeBanner from '@web/modules/flash-drop/FlashEdgeBanner.vue'
import { provideFlashDrops } from '@web/modules/flash-drop/use-flash-drops'
import { useFlashMap } from '@web/modules/flash-drop/use-flash-map'
import { provideHungryNearby } from '@web/modules/hungry-nearby/use-hungry-nearby'
import LobbieLauncher from '@web/modules/lobbie/LobbieLauncher.vue'
import LobbiePanel from '@web/modules/lobbie/LobbiePanel.vue'
import { provideLobbieChat } from '@web/modules/lobbie/use-lobbie-chat'
import FilterSheet from '@web/modules/map-shell/FilterSheet.vue'
import MapControls from '@web/modules/map-shell/MapControls.vue'
import MapNavigation from '@web/modules/map-shell/MapNavigation.vue'
import MapTutorial from '@web/modules/map-shell/MapTutorial.vue'
import { provideMapPreferences } from '@web/modules/map-shell/map-preferences'
import { type NavDirection, navDirection } from '@web/modules/map-shell/nav-direction'
import { PANEL_FOCUS_KEY } from '@web/modules/map-shell/panel-focus'
import ShellHeader from '@web/modules/map-shell/ShellHeader.vue'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import ShellPanel from '@web/modules/map-shell/ShellPanel.vue'
import ShellToast from '@web/modules/map-shell/ShellToast.vue'
import { browseLocation, dealLocation, panelSnapFor, venueLocation } from '@web/modules/map-shell/shell-routes'
import { provideShellState } from '@web/modules/map-shell/shell-state'
import { useBreakpoint, useFinePointer, usePrefersReducedMotion } from '@web/modules/map-shell/use-breakpoint'
import { provideSavedDeals } from '@web/modules/map-shell/use-saved-deals'
import { useShellLayout } from '@web/modules/map-shell/use-shell-layout'
import { provideToastQueue } from '@web/modules/map-shell/use-toast'
import { SHEET_CONTROL_KEY } from '@web/modules/squad/sheet-control'
import { provideSquadRoom } from '@web/modules/squad/use-squad-room'
import { pendingNavigationFor } from '@web/router/pending-navigation'
import type L from 'leaflet'
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue'
import { type RouteLocationNormalizedLoaded, RouterView, useRoute, useRouter } from 'vue-router'

// The map is mounted once and never leaves. Every feature is a child route rendered in the
// panel slot over it, so moving between features never reloads the map.
const route = useRoute()
const router = useRouter()
const toast = provideToastQueue()
const session = authClient.useSession()
const saved = provideSavedDeals(session)
const flash = provideFlashDrops(session)
const squad = provideSquadRoom()
const shell = provideShellState({ router, route, saved })
const lobbie = provideLobbieChat({ position: shell.position })
const mapPreferences = provideMapPreferences()
const tutorialActive = computed(() => mapPreferences.tutorialStep.value !== null)
const tutorialRestoring = ref(false)
const tutorialDeal = shallowRef<SelectedDeal | null>(null)

const breakpoint = useBreakpoint()
const reducedMotion = usePrefersReducedMotion()
const finePointer = useFinePointer()

const headerRef = ref<InstanceType<typeof ShellHeader> | null>(null)
const header = computed<HTMLElement | null>(() => (headerRef.value?.$el as HTMLElement | undefined) ?? null)
const dealMap = ref<InstanceType<typeof DealMap> | null>(null)
const sheetOpen = ref(false)
const direction = ref<NavDirection>('none')
const focusHeadingOnMount = ref(false)
const locateFocus = shallowRef<Coordinates | null>(null)
// Desktop only: the visitor tucked the panel away to see the whole map.
const panelHidden = ref(false)
provide(PANEL_FOCUS_KEY, focusHeadingOnMount)

const isBrowse = computed(() => (route.name === 'browse' || route.name === 'saved'))
const isLobbie = computed(() => route.name === 'lobbie')
// Makan Squad screens are dark, so the sheet around them (and its grip) goes dark too.
const isSquadPanel = computed(() => String(route.name ?? '').startsWith('squad'))
const dealsExperience = computed(
  () => ['browse', 'saved', 'deal', 'venue'].includes(String(route.name)) && route.query.discovery === '1',
)
// The shell has two layouts: the All Deals page (deal browsing in list view) and the map
// workspace, with the navigation rail and the panel on the left, for everything else.
const dealsPage = computed(() => shell.view.value === 'list')
const mapWorkspace = computed(() => !dealsPage.value)
const desktopMap = computed(() => mapWorkspace.value && breakpoint.value === 'desktop')
const bottomNavigation = computed(() => breakpoint.value !== 'desktop')
const navigationOpen = ref(false)
const dealDialogOpen = computed(() => dealsPage.value && route.name === 'deal')
const dealDialogTrigger = shallowRef<HTMLElement | null>(null)
watch(dealDialogOpen, (open) => {
  if (open) dealDialogTrigger.value = document.activeElement instanceof HTMLElement ? document.activeElement : null
}, { immediate: true, flush: 'sync' })
const listBackground = computed(() => dealsPage.value && (isBrowse.value || dealDialogOpen.value))
const closeDealDialog = () => router.replace(browseLocation(route.query))
const wide = computed(() => dealsPage.value ||
  (['browse', 'saved', 'deal', 'venue'].includes(String(route.name)) && shell.cardMode.value),
)
const mapOnly = computed(() => !authPrompt.value && isBrowse.value && dealsExperience.value && shell.view.value === 'map' && !shell.split.value)
const collapsed = computed(() => !authPrompt.value && panelHidden.value && breakpoint.value === 'desktop')
const resultsPreviewHeight = ref<number | null>(null)
const layout = useShellLayout({ breakpoint, wide, header, collapsed, leftPanel: desktopMap, railVisible: mapPreferences.sidebarVisible, bottomNavigation, resultsPreviewHeight })

// A panel behind the session check (Room, Profile, Saved) waits on the network before the URL
// changes. Past a short beat, open the panel with a loader so the click visibly lands; quick
// navigations finish first and never flash it.
const PANEL_LOADER_DELAY_MS = 100
const pendingNavigation = pendingNavigationFor(router)
const panelLoading = ref(false)
let panelLoaderTimer: ReturnType<typeof setTimeout> | undefined
watch(pendingNavigation, (to) => {
  clearTimeout(panelLoaderTimer)
  panelLoading.value = false
  const opensPanel = to !== null && to.matched[0]?.meta.layout === 'canvas' && to.path !== route.path
  if (!opensPanel) return
  panelLoaderTimer = setTimeout(() => {
    panelLoading.value = true
    panelHidden.value = false
    layout.snap.value = panelSnapFor(to.name, 'map')
  }, PANEL_LOADER_DELAY_MS)
})
onBeforeUnmount(() => clearTimeout(panelLoaderTimer))
// Lets a panel (the Squad room) tuck the phone sheet down to its peek height and back.
provide(SHEET_CONTROL_KEY, {
  mode: layout.mode,
  minimised: computed(() => layout.mode.value === 'sheet' && layout.snap.value === 0),
  minimise: () => {
    layout.snap.value = 0
  },
  expand: () => {
    layout.snap.value = layout.heights.value.length - 1
  },
})
const panelRef = ref<InstanceType<typeof ShellPanel> | null>(null)
// Size the initial mobile preview to the first result row, including its toolbar.
watch(
  [panelRef, () => route.name, shell.status, shell.rows, shell.cardMode, shell.locationMessage, breakpoint, dealsPage],
  async (_, __, onCleanup) => {
    let cancelled = false
    let observer: ResizeObserver | null = null
    onCleanup(() => { cancelled = true; observer?.disconnect() })
    if (breakpoint.value === 'desktop' || !isBrowse.value || dealsPage.value) {
      resultsPreviewHeight.value = null
      return
    }
    await nextTick()
    if (cancelled) return
    const panel = panelRef.value?.$el as HTMLElement | undefined
    const body = panel?.querySelector<HTMLElement>('[data-testid="panel-body"]')
    const firstRow = body?.querySelector<HTMLElement>('.deal-rows > li, .food-deal-grid > article')
    if (!panel || !body || !firstRow) return
    const measure = () => {
      if (!firstRow.getBoundingClientRect().height) return
      const height = Math.ceil(firstRow.getBoundingClientRect().bottom - panel.getBoundingClientRect().top + body.scrollTop + 8)
      if (height > 0 && resultsPreviewHeight.value !== height) resultsPreviewHeight.value = height
    }
    measure()
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure)
      observer.observe(firstRow)
      for (const element of body.children) {
        if (!element.contains(firstRow)) observer.observe(element)
      }
    }
  },
  { immediate: true, flush: 'post' },
)

// The outlet the panel is about: a deal's outlet or the venue being viewed.
const selected = computed<SelectedDeal | null>(() =>
  route.name === 'deal'
    ? shell.findDeal(String(route.params.dealId ?? ''), typeof route.query.at === 'string' ? route.query.at : null)
    : null,
)
// A live Makan Squad room: its current deal is the map's selection, so the camera pans to each
// new deal, and other pins are locked until the visitor leaves the room.
const inSquad = computed(() => route.name === 'squad-room' && squad.state.value?.status === 'LIVE' && !squad.state.value.me?.left)
const squadVenueId = computed(() => (inSquad.value ? (squad.currentDeal.value?.venueId ?? null) : null))
const selectedVenueId = computed(() => {
  if (squadVenueId.value) return squadVenueId.value
  if (route.name === 'deal') return selected.value?.venue.id ?? null
  return route.name === 'venue' ? String(route.params.venueId ?? '') : null
})
const selectedPin = computed(() => (selectedVenueId.value ? shell.findVenuePin(selectedVenueId.value) : null))
// The chat's picks frame the map, from the /ask-lobbie panel or the floating window over the map.
const lobbiePins = computed(() => (isLobbie.value || (lobbieWindowOpen.value && mapWorkspace.value) ? lobbie.resultPins.value : []))
const mapFramed = computed(() => lobbiePins.value.length > 0)

// A filter can hide the deal being viewed; its pin still shows so the map matches the panel.
// A stall running a Flash Drop is drawn by the drop's coral pin instead of its usual one, so the
// two never stack on the same spot. Its usual pin comes back when the drop ends.
// Kept identical while the same stalls have drops, since the countdown clock ticks every second
// and a new set would redraw every pin each time.
const flashVenueIds = computed<ReadonlySet<string>>((previous) => {
  const next = new Set(flash.drops.value.map((drop) => drop.venueId))
  const same = previous && previous.size === next.size && [...next].every((id) => previous.has(id))
  return same ? previous : next
})
const mapPins = computed(() => {
  if (mapFramed.value) return lobbiePins.value
  const pin = selectedPin.value
  const pins =
    pin && !shell.pins.value.some((candidate) => candidate.id === pin.id)
      ? [...shell.pins.value, pin]
      : shell.pins.value
  return flashVenueIds.value.size === 0
    ? pins
    : pins.filter((candidate) => !flashVenueIds.value.has(candidate.id))
})
// Recomputed only when the focused outlet changes, so reloading deals never re-flies the map.
const selectedFocus = computed<Coordinates | null>((previousFocus) => {
  const pin = selectedPin.value
  if (!pin) return null
  return previousFocus && previousFocus.lat === pin.lat && previousFocus.lng === pin.lng
    ? previousFocus
    : { lat: pin.lat, lng: pin.lng }
})
// "Near me" outranks the open deal until the next navigation clears it, so the latest ask wins.
const mapFocus = computed<Coordinates | null>(() => locateFocus.value ?? selectedFocus.value)
const mapFocusZoom = computed(() => locateFocus.value ? LOCATE_ZOOM : FOCUS_ZOOM)

// Below the header the control column needs this much map (Near me + Nearby, then the zoom
// pair, plus the 16px margin and some clearance). When the sheet leaves less, zoom goes first
// (touch screens can pinch), then the whole column, so nothing slides under the header.
const CONTROLS_BASE_ROOM_PX = 124
const CONTROLS_ZOOM_ROOM_PX = 104
const showControls = computed(
  () =>
    mapWorkspace.value &&
    (layout.mode.value === 'side' ||
      (layout.snap.value < layout.heights.value.length - 1 && layout.mapRoom.value >= CONTROLS_BASE_ROOM_PX)),
)
const showZoom = computed(
  () => layout.mode.value === 'side' || layout.mapRoom.value >= CONTROLS_BASE_ROOM_PX + CONTROLS_ZOOM_ROOM_PX,
)
const panelLabel = computed(() => authPrompt.value ? 'Log in or sign up' : (typeof route.meta.panelLabel === 'string' ? route.meta.panelLabel : 'Results'))

// The modal blocks interaction with the page behind it at every screen size.
const modalInert = computed(() => (sheetOpen.value || (dealDialogOpen.value && !authPrompt.value) || tutorialActive.value ? true : undefined))
const backgroundInert = computed(() => (modalInert.value || navigationOpen.value ? true : undefined))
const navigationInert = computed(() => bottomNavigation.value ? backgroundInert.value : modalInert.value)
const headerInert = computed(() => modalInert.value || (navigationOpen.value && desktopMap.value && mapPreferences.sidebarVisible.value) ? true : undefined)
const panelInert = computed(() => authPrompt.value ? undefined : (collapsed.value || mapOnly.value ? true : backgroundInert.value))
const panelTabLabel = computed(() => `${collapsed.value ? 'Show' : 'Hide'} ${panelLabel.value.toLowerCase()} panel`)

const shellStyle = computed(() => layout.cssVars.value)

const applyFilters = (next: BrowseFilters, mode: 'push' | 'replace') => {
  shell.setArea(null)
  void shell.applyFilters(next, mode)
}

// Focus waits a tick: the header stays inert until the closed dialog has re-rendered.
const closeSheet = async () => {
  sheetOpen.value = false
  await nextTick()
  headerRef.value?.focusAllFilters()
}

type TutorialOrigin = {
  path: string
  query: typeof route.query
  hidden: boolean
  snap: number
  scroll: number
  focus: HTMLElement | null
}
let tutorialOrigin: TutorialOrigin | null = null
const prepareTutorialStep = async (step: number) => {
  if (step === 0) { sheetOpen.value = true; return }
  sheetOpen.value = false
  if (step < 4) {
    const first = shell.rows.value[0]
    tutorialDeal.value ??= selected.value ?? (first ? { deal: first.deal, venue: first.venue, distanceMetres: first.distanceMetres } : null)
    if (tutorialDeal.value && (route.name !== 'deal' || route.params.dealId !== tutorialDeal.value.deal.id || route.query.at !== tutorialDeal.value.venue.id)) {
      await router.replace(dealLocation(route.query, tutorialDeal.value.deal.id, tutorialDeal.value.venue.id))
    }
  } else if (tutorialOrigin) {
    await router.replace(browseLocation(tutorialOrigin.query))
  }
}
watch(mapPreferences.tutorialStep, async (step) => {
  if (step === null) return
  if (!tutorialOrigin) {
    tutorialOrigin = {
      path: route.fullPath, query: { ...route.query }, hidden: panelHidden.value, snap: layout.snap.value,
      scroll: (panelRef.value?.$el as HTMLElement | undefined)?.querySelector<HTMLElement>('[data-testid="panel-body"]')?.scrollTop ?? 0,
      focus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    }
    tutorialDeal.value = null
  }
  await prepareTutorialStep(step)
})
watch(shell.status, (status) => {
  const step = mapPreferences.tutorialStep.value
  if (status === 'ready' && step !== null && step > 0 && step < 4 && !tutorialDeal.value) void prepareTutorialStep(step)
})
const finishTutorial = async (addDeal = false) => {
  const origin = tutorialOrigin
  tutorialOrigin = null
  tutorialRestoring.value = true
  mapPreferences.tutorialStep.value = null
  sheetOpen.value = false
  if (addDeal) await router.push({ name: 'submit-deal' })
  else if (origin) await router.replace(origin.path)
  await nextTick()
  if (origin && !addDeal) {
    panelHidden.value = origin.hidden
    layout.snap.value = origin.snap
    const body = (panelRef.value?.$el as HTMLElement | undefined)?.querySelector<HTMLElement>('[data-testid="panel-body"]')
    if (body) body.scrollTop = origin.scroll
    if (origin.focus?.isConnected) origin.focus.focus({ preventScroll: true })
    else document.querySelector<HTMLElement>('[data-testid="nav-toggle"]')?.focus()
  }
  tutorialRestoring.value = false
}
watch(mapPreferences.sidebarVisible, async () => {
  navigationOpen.value = false
  await nextTick()
  document.querySelector<HTMLElement>('[data-testid="nav-toggle"]')?.focus()
})

// From a pin: an outlet with one deal opens that deal; with several, the outlet's panel.
const resultsQuery = computed(() => ({ ...route.query, ...(shell.savedOnly.value ? { collection: 'saved' } : {}) }))
const openVenue = (venueId: string) => {
  if (inSquad.value) {
    if (venueId === squadVenueId.value) layout.snap.value = layout.heights.value.length - 1
    else toast.show(`You're in Room ${squad.code.value}. Leave the room to open other deals.`)
    return
  }
  const pin = mapPins.value.find((candidate) => candidate.id === venueId) ?? shell.findVenuePin(venueId)
  if (!pin) return
  const [only] = pin.deals
  void router.push(
    pin.deals.length === 1 && only ? dealLocation(resultsQuery.value, only.id, venueId) : venueLocation(resultsQuery.value, venueId),
  )
}

// Lobbie lives in a floating window behind the "Ask Lobbie" button: in the bottom-right corner
// of the All Deals page, and below the zoom controls on the map. The conversation is the
// shell's, so closing and reopening the window keeps it.
const lobbieWindowOpen = ref(false)
const lobbieLauncher = ref<InstanceType<typeof LobbieLauncher> | null>(null)
const showLobbieLauncher = computed(() => !authPrompt.value && (mapWorkspace.value || (dealsPage.value && isBrowse.value)))
const toggleLobbieWindow = () => { lobbieWindowOpen.value = !lobbieWindowOpen.value }
const closeLobbieWindow = () => {
  lobbieWindowOpen.value = false
  lobbieLauncher.value?.focus()
}
// Opening a deal from the chat (or any other panel) puts the window away; the launcher brings it back.
watch(showLobbieLauncher, (shown) => { if (!shown) lobbieWindowOpen.value = false })
watch(() => route.name, () => { lobbieWindowOpen.value = false })
// Beside the side panel, the open window covers the map's right side, so Lobbie's picks are framed
// in what is left (window 400px, plus the control column and gaps).
const LOBBIE_WINDOW_COVER_PX = 400 + 20 + 52 + 12 + 24
const mapViewPadding = computed(() => {
  const padding = layout.viewPadding.value
  if (!lobbieWindowOpen.value || !mapWorkspace.value || layout.mode.value !== 'side') return padding
  return { ...padding, right: Math.max(padding.right, LOBBIE_WINDOW_COVER_PX) }
})
// Escape closes the window even when focus has left it (a picked suggestion disappears from
// under the pointer), unless the filter sheet or a deal is open over it and should close first.
const closeLobbieOnEscape = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && !sheetOpen.value && !dealDialogOpen.value) closeLobbieWindow()
}
watch(lobbieWindowOpen, (open) => {
  if (open) document.addEventListener('keydown', closeLobbieOnEscape)
  else document.removeEventListener('keydown', closeLobbieOnEscape)
})
onBeforeUnmount(() => document.removeEventListener('keydown', closeLobbieOnEscape))

const nearMe = async () => {
  const startedAt = route.path
  const located = await shell.locate()
  // A slow answer must not pull the map away from a panel opened in the meantime.
  if (route.path !== startedAt) return
  locateFocus.value = located
}

// Flash Drops draw on the Leaflet map once it exists. Their banner only pops up over the plain
// map: never while a deal, the filter sheet or any other panel has the visitor's attention.
const leaflet = shallowRef<L.Map | null>(null)
const flashMap = useFlashMap({
  map: leaflet,
  store: flash,
  enabled: computed(() => isBrowse.value && !sheetOpen.value && !wide.value),
  user: shell.position,
  padding: layout.viewPadding,
  reducedMotion,
  open: (drop) => router.push(dealLocation(route.query, drop.dealId, drop.venueId)),
})
// Hungry Nearby: opt-in lobangers on the same Leaflet map; the toggle lives in MapControls.
provideHungryNearby({ session, map: leaflet, position: shell.position, locate: shell.locate })

const visibleMapArea = shallowRef<Parameters<typeof shell.setArea>[0]>(null)
const updateMapArea = (area: Parameters<typeof shell.setArea>[0]) => {
  visibleMapArea.value = area
  if (mapWorkspace.value) shell.setArea(area)
}
watch(mapWorkspace, (visible) => {
  shell.setArea(visible ? visibleMapArea.value : null)
}, { flush: 'post' })

const keyFor = (child: RouteLocationNormalizedLoaded) => child.path

// Keyed on a string so query-only changes (filters, sort) never count as navigation.
let previous = { name: route.name, path: route.path }
watch(
  () => `${String(route.name)}|${route.path}`,
  () => {
    const next = { name: route.name, path: route.path }
    direction.value = navDirection(next, previous)
    previous = next
    focusHeadingOnMount.value = true
    locateFocus.value = null
    // Opening a pin, deal or any other panel brings a tucked-away panel back.
    panelHidden.value = false
    // A filter change from a deal or venue lands on browse with the sheet still in use. Any
    // other navigation closes it, and the new panel's heading takes focus.
    if (route.name !== 'browse') sheetOpen.value = false
  },
)
watch(mapOnly, (only) => { panelHidden.value = only }, { immediate: true })
watch(shell.split, (split) => { if (split) panelHidden.value = false })
// Switching to the list needs the panel, so it slides back in.
watch(wide, (isWide) => {
  if (isWide) panelHidden.value = false
})
watch(authPrompt, (prompt) => { if (prompt) layout.snap.value = Math.max(1, layout.snap.value) })
// Each panel opens at a height that suits it; the visitor can drag from there.
watch(
  () => [route.name, shell.view.value, dealsPage.value] as const,
  ([name, view, page]) => {
    layout.snap.value = page ? 2 : (name === 'saved' && bottomNavigation.value ? 1 : panelSnapFor(name, view))
  },
  { immediate: true },
)

// A new visitor should not land on the whole island: once their position is known (and they are
// in Singapore) and the map is showing with nothing else in focus, centre on them a single time.
// `locateFocus` flies through `focusOffset`, so they land in the visible part beside the panel.
// After that the camera is theirs; Near me remains the way to come back.
const visitorHere = shallowRef<Coordinates | null>(null)
let centredOnArrival = false
watch(
  () => [visitorHere.value, shell.view.value, isBrowse.value, selectedFocus.value] as const,
  ([here, view, browse, selected]) => {
    if (centredOnArrival || !here || view !== 'map' || !browse || selected) return
    centredOnArrival = true
    locateFocus.value = { ...here }
  },
  { immediate: true, flush: 'post' },
)

onMounted(() => {
  document.documentElement.classList.add('is-canvas')
  void shell.locate().then((here) => { visitorHere.value = here })
})
onBeforeUnmount(() => document.documentElement.classList.remove('is-canvas'))
</script>

<template>
  <div
    class="map-shell"
    :class="[`map-shell--${layout.mode.value}`, { 'map-shell--collapsed': collapsed, 'map-shell--squad': isSquadPanel, 'map-shell--discovery': dealsExperience, 'map-shell--deals-page': dealsPage, 'map-shell--map-only': mapOnly, 'map-shell--map-workspace': desktopMap, 'map-shell--bottom-nav': bottomNavigation }]"
    :style="shellStyle"
    data-testid="map-shell"
  >
    <!-- First stop for keyboard users: jump past the navigation and header to the results. -->
    <a class="map-shell__skip" href="#shell-main" :inert="backgroundInert">Skip to content</a>
    <MapNavigation v-if="desktopMap && mapPreferences.sidebarVisible.value && !bottomNavigation" :inert="navigationInert" :panel-open="!collapsed" @open-panel="panelHidden = false; layout.snap.value = Math.max(1, layout.snap.value)" @menu-change="navigationOpen = $event" />
    <!-- Header first so keyboard users reach the menu and search before the map. -->
    <ShellHeader
      :inert="headerInert"
      ref="headerRef"
      :filters="shell.filters.value"
      :sheet-open="sheetOpen"
      :discovery="dealsExperience"
      :deals-header="dealsPage"
      :map-layout="desktopMap"
      :sidebar-visible="mapPreferences.sidebarVisible.value"
      :bottom-nav="bottomNavigation"
      :map-tools="mapWorkspace"
      :categories="shell.categories.value"
      :cuisines="shell.cuisines.value"
      :count-for="shell.countFor"
      :show-location="dealsPage"
      :location-known="shell.position.value !== null"
      @apply="applyFilters"
      @open-sheet="sheetOpen = !sheetOpen"
      @menu-change="navigationOpen = $event"
    />
    <!-- The map is a named region; the panel's content below is the page's main landmark. -->
    <section class="map-shell__map" aria-label="Deal map" :inert="backgroundInert">
      <DealMap
        ref="dealMap"
        :pins="mapPins"
        :framed="mapFramed"
        :focus="mapFocus"
        :focus-zoom="mapFocusZoom"
        :focus-offset="mapOnly && !desktopMap ? { x: 0, y: 0 } : layout.focusOffset.value"
        :view-padding="mapOnly && !desktopMap ? { top: 0, right: 0, bottom: 0, left: 0 } : mapViewPadding"
        :search-padding="layout.searchPadding.value"
        :user-position="shell.position.value"
        :user-accuracy-metres="shell.accuracyMetres.value"
        :selected-venue-id="selectedVenueId"
        :hovered-venue-id="shell.hoveredVenueId.value"
        :hover-enabled="finePointer"
        :reduced-motion="reducedMotion"
        @select="openVenue"
        @hover="shell.setHovered"
        @moved="updateMapArea"
        @ready="leaflet = $event"
      />
    </section>

    <Transition name="flash-edge">
      <FlashEdgeBanner
        v-if="flashMap.edge.value"
        :banner="flashMap.edge.value"
        :now="flash.now.value"
        :life-ms="BANNER_LIFE_MS"
        :inset="{ left: layout.viewPadding.value.left, right: layout.viewPadding.value.right }"
        :inert="backgroundInert"
        @open="flashMap.edge.value && flashMap.openDrop(flashMap.edge.value.drop)"
        @hover="flashMap.setPaused"
      />
    </Transition>


    <Transition name="shell-fade">
      <div v-show="showControls" class="map-shell__controls" :inert="backgroundInert">
        <MapControls
          class="map-shell__map-controls"
          :locating="shell.geoStatus.value === 'locating'"
          :show-zoom="showZoom"
          @near-me="nearMe"
          @zoom-in="dealMap?.zoomIn()"
          @zoom-out="dealMap?.zoomOut()"
        />
        <LobbieLauncher v-if="mapWorkspace && showLobbieLauncher" ref="lobbieLauncher" :open="lobbieWindowOpen" controls="lobbie-window" @toggle="toggleLobbieWindow" />
      </div>
    </Transition>

    <button
      v-if="layout.mode.value === 'side' && !mapOnly && !dealsPage"
      type="button"
      class="map-shell__panel-tab"
      data-testid="panel-collapse"
      :aria-label="panelTabLabel"
      :title="panelTabLabel"
      :aria-expanded="!collapsed"
      aria-controls="shell-panel"
      :inert="backgroundInert"
      @click="panelHidden = !panelHidden"
    >
      <ShellIcon :name="collapsed ? 'chevronRight' : 'chevronLeft'" :size="16" />
    </button>

    <!-- An unstyled wrapper: the panel is positioned against .map-shell, so layout is unchanged. -->
    <main id="shell-main" class="map-shell__main" tabindex="-1">
    <ShellPanel
      id="shell-panel"
      ref="panelRef"
      :inert="panelInert"
      v-model:snap="layout.snap.value"
      :mode="layout.mode.value"
      :heights="layout.heights.value"
      :wide="wide"
      :collapsed="collapsed"
      :label="panelLabel"
    >
      <AuthPrompt v-if="authPrompt" />
      <div v-if="panelLoading && !authPrompt" class="map-shell__panel-loading" role="status" data-testid="panel-loading">
        <TicketLoader class="map-shell__ticket" />
        <span>Loading…</span>
      </div>
      <div v-show="!authPrompt && !panelLoading" class="map-shell__panel-route">
      <BrowseListPanel v-if="listBackground" />
      <RouterView v-else v-slot="{ Component, route: child }">
        <component v-if="mapWorkspace" :is="Component" :key="keyFor(child)" />
        <Transition v-else :name="`panel-${direction}`" :css="!tutorialActive && !tutorialRestoring" :mode="tutorialActive || tutorialRestoring ? 'default' : 'out-in'">
          <component :is="Component" :key="keyFor(child)" />
        </Transition>
      </RouterView>
      </div>
    </ShellPanel>
    </main>

    <template v-if="showLobbieLauncher">
      <Transition name="lobbie-window">
        <div v-if="lobbieWindowOpen" id="lobbie-window" class="map-shell__lobbie-window" :class="{ 'map-shell__lobbie-window--map': mapWorkspace }">
          <LobbiePanel windowed @close="closeLobbieWindow" />
        </div>
      </Transition>
      <LobbieLauncher v-if="!mapWorkspace" ref="lobbieLauncher" class="map-shell__lobbie-launcher" :open="lobbieWindowOpen" controls="lobbie-window" @toggle="toggleLobbieWindow" />
    </template>

    <DealDetailsDialog v-if="dealDialogOpen && !authPrompt" :restore-focus-to="dealDialogTrigger" @close="closeDealDialog" />

    <FilterSheet
      :inactive="tutorialActive"
      :open="sheetOpen"
      :breakpoint="breakpoint"
      :filters="shell.filters.value"
      :categories="shell.categories.value"
      :cuisines="shell.cuisines.value"
      :count-for="shell.countFor"
      :price-values="shell.deals.value.flatMap((deal) => deal.priceMinor === null ? [] : [deal.priceMinor])"
      :show-location="dealsPage"
      :location-known="shell.position.value !== null"
      @apply="applyFilters"
      @close="closeSheet"
    />

    <!-- The bottom tab bar comes after the header and panel in the tab order, as it sits below them. -->
    <MapNavigation v-if="bottomNavigation" bottom :inert="navigationInert" :panel-open="!mapOnly" @open-panel="panelHidden = false; layout.snap.value = Math.max(1, layout.snap.value)" @menu-change="navigationOpen = $event" />

    <MapTutorial
      v-if="mapPreferences.tutorialStep.value !== null"
      :step="mapPreferences.tutorialStep.value"
      :no-deals="!tutorialDeal"
      @next="mapPreferences.tutorialStep.value = Math.min(4, (mapPreferences.tutorialStep.value ?? 0) + 1)"
      @back="mapPreferences.tutorialStep.value = Math.max(0, (mapPreferences.tutorialStep.value ?? 0) - 1)"
      @close="finishTutorial()"
      @add-deal="finishTutorial(true)"
    />

    <ShellToast />
  </div>
</template>

<style scoped>
.map-shell__panel-route { height: 100%; }

/* Lobbie's launcher and chat window float in the bottom-right corner of the All Deals page,
   above the bottom tab bar on phones and tablets. */
.map-shell__lobbie-launcher {
  position: fixed;
  right: calc(24px + env(safe-area-inset-right, 0px));
  bottom: calc(24px + var(--bottom-nav-h, 0px) + env(safe-area-inset-bottom, 0px));
  z-index: 40;
}
.map-shell__lobbie-window {
  position: fixed;
  right: calc(24px + env(safe-area-inset-right, 0px));
  bottom: calc(24px + 52px + 16px + var(--bottom-nav-h, 0px) + env(safe-area-inset-bottom, 0px));
  z-index: 40;
  width: min(400px, calc(100vw - 32px));
  height: min(620px, calc(100dvh - var(--bottom-nav-h, 0px) - 140px));
  transform-origin: bottom right;
}
/* Beside the map: left of the control column, so zoom and Near me stay in reach. */
.map-shell__lobbie-window--map {
  right: calc(20px + 52px + 12px + env(safe-area-inset-right, 0px));
  bottom: 28px;
  height: min(620px, calc(100dvh - var(--shell-header-bottom, 88px) - 120px));
}
/* With a bottom sheet the controls ride on the sheet, so the window takes the space between the
   header and the tab bar instead; its own close button stays in reach. */
.map-shell--sheet .map-shell__lobbie-window--map {
  top: calc(var(--shell-header-bottom, 72px) + 8px);
  right: calc(16px + env(safe-area-inset-right, 0px));
  bottom: calc(12px + var(--bottom-nav-h, 0px) + env(safe-area-inset-bottom, 0px));
  height: auto;
}
@media (max-width: 599.98px) {
  .map-shell__lobbie-launcher { right: 16px; bottom: calc(16px + var(--bottom-nav-h, 0px) + env(safe-area-inset-bottom, 0px)); }
  .map-shell__lobbie-window { right: 16px; bottom: calc(16px + 44px + 12px + var(--bottom-nav-h, 0px) + env(safe-area-inset-bottom, 0px)); }
  .map-shell--sheet .map-shell__lobbie-window--map { right: 12px; width: calc(100vw - 24px); }
}
.lobbie-window-enter-active, .lobbie-window-leave-active { transition: opacity 180ms ease, transform 220ms var(--ease-out); }
.lobbie-window-enter-from, .lobbie-window-leave-to { opacity: 0; transform: translateY(12px) scale(0.96); }
@media (prefers-reduced-motion: reduce) {
  .lobbie-window-enter-active, .lobbie-window-leave-active { transition: opacity 120ms ease; }
  .lobbie-window-enter-from, .lobbie-window-leave-to { transform: none; }
}

.map-shell__panel-loading {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 160px;
  font: 600 0.9375rem/1.4 var(--font-sans);
  color: var(--ink-muted);
}

/* The splash screen's tumbling ticket, in sunny against the panel's paper. */
.map-shell__ticket { color: var(--sunny-deep); }
/* Keep the bottom inset for the part of the sheet below the screen, or its last rows (the account
   links and the Dark mode switch) cannot be scrolled into view. */
.map-shell :deep(.auth-prompt__content) { padding: 28px 22px calc(28px + var(--sheet-offset, 0px) + env(safe-area-inset-bottom, 0px)); }
.map-shell--map-workspace.map-shell--side :deep(.auth-prompt__content) { padding-top: calc(var(--shell-header-bottom) + 20px); }
.map-shell {
  --shell-gutter: var(--space-4);
  /* Desktop, as on the Prototype board: the header floats top left, the panel is a card on the
     right, and the map controls and pills centre on the part of the map left of the panel. */
  --panel-w: 380px; /* fallback; use-shell-layout.ts sets the live value inline */
  --header-w: max-content;
  --map-centre-x: calc((100% - var(--panel-w) - 2 * var(--shell-gutter)) / 2);
  --toast-bottom: 84px;
  position: relative;
  height: 100vh;
  /* clip, not hidden: focus and scrollIntoView can still scroll a hidden box. */
  overflow: clip;
  font-family: var(--font-sans);
  color: var(--ink);
  background: var(--map-canvas);
}

@supports (height: 100dvh) {
  .map-shell {
    height: 100dvh;
  }
}

/* Hidden until focused, then shown above the header in the top-left corner. */
.map-shell__skip {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + var(--space-2));
  left: calc(env(safe-area-inset-left, 0px) + var(--space-2));
  z-index: 100;
  padding: 10px 16px;
  font-weight: 700;
  color: var(--on-accent);
  background: var(--sunny);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-pill);
  text-decoration: none;
  transform: translateY(calc(-100% - 24px));
}

.map-shell__skip:focus {
  transform: none;
}

/* Programmatic focus target for the skip link; the panel inside shows where focus went. */
.map-shell__main:focus {
  outline: none;
}

/* Leaflet's panes use z-indexes up to 1000; isolating the map keeps them under the overlays. */
.map-shell__map {
  position: absolute;
  inset: 0;
  z-index: 0;
  isolation: isolate;
}

/* Lobbie's button sits below the control column, right-aligned with it. The controls stack above
   the button, so Lobbie peeking up from it never covers them. */
.map-shell__map-controls {
  position: relative;
  z-index: 1;
}

.map-shell__controls {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-3);
  right: calc(20px + env(safe-area-inset-right, 0px));
  bottom: 28px;
  z-index: 10;
}

/* A tab on the drawer's right edge hides it; it stays beside the rail to bring it back. Placed
   with top, not a transform, because the list/map morph slides it with transform. */
.map-shell__panel-tab {
  position: absolute;
  top: calc(50% - 28px);
  left: calc(var(--map-rail-w) + var(--panel-w));
  z-index: 21;
  display: grid;
  place-items: center;
  width: 28px;
  height: 56px;
  padding: 0;
  color: var(--on-accent);
  background: var(--sunny);
  border: 1px solid var(--hairline);
  border-left: 0;
  border-radius: 0 12px 12px 0;
  box-shadow: var(--shadow-pill);
  cursor: pointer;
  transition:
    transform var(--dur-sheet) var(--ease-drawer),
    color 150ms ease,
    background-color 150ms ease;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.map-shell__panel-tab:hover {
  color: var(--on-accent);
  background: var(--sunny);
}

.map-shell__panel-tab:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
}




/* The deals route is a dedicated browse page. Keep the map mounted for fast toggling, but
   let the cards use the full canvas until the visitor explicitly asks for a map. */
.map-shell--deals-page:not(.map-shell--map-only) .map-shell__map {
  visibility: hidden;
  pointer-events: none;
}

.map-shell--deals-page:not(.map-shell--map-only) {
  --panel-w: calc(100% - 2 * var(--shell-gutter));
  background: var(--page-background, var(--paper-white));
}

.map-shell--deals-page:not(.map-shell--map-only) .shell-panel--side {
  top: calc(var(--shell-header-bottom) + var(--space-4));
  right: var(--shell-gutter);
  bottom: var(--shell-gutter);
  left: var(--shell-gutter);
  width: auto;
}

.map-shell--deals-page .shell-panel {
  background: var(--page-background, var(--paper-white));
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.map-shell--deals-page :deep(.panel-frame__body) {
  width: 100%;
  max-width: 1600px;
  margin-inline: auto;
}

.map-shell--deals-page :deep(.shell-panel__grip) {
  display: none;
}

.map-shell--deals-page :deep(.shell-panel__content) {
  padding-top: 0;
}

.map-shell--map-only .shell-panel {
  visibility: hidden;
  pointer-events: none;
}

.map-shell--bottom-nav .shell-panel--sheet {
  bottom: var(--bottom-nav-h);
}

/* Below 992px the panel is a bottom sheet: the header spans the screen, and the controls ride
   just above the visible part of the sheet. */
.map-shell--sheet {
  /* 16px, the same as the All Deals header, so the map and list views line up. */
  --shell-gutter: var(--space-4);
  --header-w: calc(100% - 2 * var(--shell-gutter));
  --map-centre-x: 50%;
  --toast-top: calc(var(--shell-header-bottom) + var(--space-3));
  --toast-bottom: auto;
}

.map-shell--sheet .map-shell__controls {
  right: var(--space-4);
  bottom: calc(var(--space-4) + var(--bottom-nav-h, 0px));
  transform: translateY(calc(-1 * var(--sheet-visible)));
  transition: transform var(--dur-sheet) var(--ease-drawer);
}

.map-shell--map-only.map-shell--sheet .map-shell__controls {
  /* Full-bleed map: clear the home indicator as well as the bottom tab bar. */
  bottom: calc(var(--space-4) + var(--bottom-nav-h, 0px) + env(safe-area-inset-bottom, 0px));
  transform: none;
}



.map-shell--deals-page.map-shell--sheet:not(.map-shell--map-only) .map-shell__map {
  visibility: hidden;
  pointer-events: none;
}

@media (min-width: 768px) and (max-width: 991.98px) {
  .map-shell--sheet {
    --sheet-gutter: var(--space-3);
  }
}

/* Desktop map workspace: navigation rail, left results drawer and an uninterrupted map. */
.map-shell--map-workspace {
  --map-centre-x: calc((100% + var(--map-rail-w) + var(--panel-w)) / 2);
}

.map-shell--map-workspace.map-shell--collapsed {
  --map-centre-x: calc((100% + var(--map-rail-w)) / 2);
}

.map-shell--map-workspace.map-shell--side .shell-panel--side {
  /* The scroll container fills the drawer, including the space behind search. */
  top: 0;
  padding-top: 0;
  right: auto;
  bottom: 0;
  left: var(--map-rail-w);
  width: var(--panel-w);
  border: 0;
  border-right: 1px solid var(--hairline);
  border-radius: 0;
  box-shadow: 4px 0 16px rgb(0 0 0 / 0.08);
  transition:
    transform var(--dur-sheet) var(--ease-drawer),
    visibility 0s linear;

}

.map-shell--map-workspace.map-shell--side :deep(.panel-frame__body) {
  /* Initial clearance scrolls away with the content instead of clipping its top edge. */
  padding-top: calc(var(--shell-header-bottom) + 8px);
  scroll-padding-top: calc(var(--shell-header-bottom) + 8px);
}

/* Squad screens (create, join, room) bring their own scrolling body instead of PanelFrame's, so
   they need the same clearance under the floating search field and Room button. */
.map-shell--map-workspace.map-shell--side :deep(.squad-room__body) {
  padding-top: calc(var(--shell-header-bottom) + 8px);
  scroll-padding-top: calc(var(--shell-header-bottom) + 8px);
}

/* The back link's negative top margin would tuck it under the floating search field. */
.map-shell--map-workspace.map-shell--side :deep(.panel-frame__back) {
  margin-top: 0;
}

/* Give the results count more breathing room below the floating search field. */
.map-shell--map-workspace.map-shell--side :deep(.browse-list .panel-frame__body) {
  padding-top: calc(var(--shell-header-bottom) + 24px);
  scroll-padding-top: calc(var(--shell-header-bottom) + 24px);
}

/* Compact cards in the desktop results drawer; full posters remain uncropped. */
.map-shell--map-workspace :deep(.food-deal-grid) {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px 12px;
}

/* The venue page asks for two wider cards instead. */
.map-shell--map-workspace :deep(.food-deal-grid--two) {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.map-shell--map-workspace :deep(.food-deal-card__body) {
  padding: 10px;
}

.map-shell--map-workspace :deep(.browse-list__skeleton-cards) {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.map-shell--map-workspace.map-shell--side .shell-panel--side.is-collapsed {
  visibility: hidden;
  transform: translateX(calc(-100% - 8px));
  transition:
    transform var(--dur-sheet) var(--ease-drawer),
    visibility 0s linear var(--dur-sheet);
}

.map-shell--map-workspace.map-shell--collapsed .map-shell__panel-tab {
  transform: translateX(calc(-1 * var(--panel-w)));
}


@media (prefers-reduced-motion: reduce) {
  .map-shell--map-workspace.map-shell--side .shell-panel--side,
  .map-shell--map-workspace.map-shell--side .shell-panel--side.is-collapsed,
  .map-shell--sheet .map-shell__controls,
  .map-shell__panel-tab {
    transition: none;
  }

}
</style>
