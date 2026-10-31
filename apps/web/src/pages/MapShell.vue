<script setup lang="ts">
import '@web/modules/map-shell/shell-ui.css'
import '@web/modules/map-shell/motion.css'
import { authClient } from '@web/lib/auth-client'
import DealMap from '@web/modules/browse-map/DealMap.vue'
import { type BrowseFilters, createDefaultFilters } from '@web/modules/browse-map/filters'
import { FOCUS_ZOOM, LOCATE_ZOOM } from '@web/modules/browse-map/map-config'
import type { Coordinates, SelectedDeal } from '@web/modules/browse-map/types'
import { provideLobbieChat } from '@web/modules/lobbie/use-lobbie-chat'
import FilterSheet from '@web/modules/map-shell/FilterSheet.vue'
import { withFilters } from '@web/modules/map-shell/filter-query'
import HotCard from '@web/modules/map-shell/HotCard.vue'
import MapControls from '@web/modules/map-shell/MapControls.vue'
import { type NavDirection, navDirection } from '@web/modules/map-shell/nav-direction'
import { PANEL_FOCUS_KEY } from '@web/modules/map-shell/panel-focus'
import ShellHeader from '@web/modules/map-shell/ShellHeader.vue'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import ShellPanel from '@web/modules/map-shell/ShellPanel.vue'
import ShellToast from '@web/modules/map-shell/ShellToast.vue'
import {
  browseLocation,
  dealLocation,
  panelSnapFor,
  shellQuery,
  venueLocation,
} from '@web/modules/map-shell/shell-routes'
import { provideShellState } from '@web/modules/map-shell/shell-state'
import { useBreakpoint, useFinePointer, usePrefersReducedMotion } from '@web/modules/map-shell/use-breakpoint'
import { usePanelMorph } from '@web/modules/map-shell/use-panel-morph'
import { provideSavedDeals } from '@web/modules/map-shell/use-saved-deals'
import { useShellLayout } from '@web/modules/map-shell/use-shell-layout'
import { provideToastQueue } from '@web/modules/map-shell/use-toast'
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue'
import { type RouteLocationNormalizedLoaded, RouterView, useRoute, useRouter } from 'vue-router'

// The map is mounted once and never leaves. Every feature is a child route rendered in the
// panel slot over it, so moving between features never reloads the map.
const route = useRoute()
const router = useRouter()
provideToastQueue()
provideSavedDeals(authClient.useSession())
const shell = provideShellState({ router, route })
const lobbie = provideLobbieChat({ position: shell.position })

const breakpoint = useBreakpoint()
const reducedMotion = usePrefersReducedMotion()
const finePointer = useFinePointer()

const headerRef = ref<InstanceType<typeof ShellHeader> | null>(null)
const header = computed<HTMLElement | null>(() => (headerRef.value?.$el as HTMLElement | undefined) ?? null)
const dealMap = ref<InstanceType<typeof DealMap> | null>(null)
const sheetOpen = ref(false)
const mapMoved = ref(false)
const direction = ref<NavDirection>('none')
const focusHeadingOnMount = ref(false)
const locateFocus = shallowRef<Coordinates | null>(null)
// Desktop only: the visitor tucked the panel away to see the whole map.
const panelHidden = ref(false)
provide(PANEL_FOCUS_KEY, focusHeadingOnMount)

const isBrowse = computed(() => route.name === 'browse')
const isLobbie = computed(() => route.name === 'lobbie')
const wide = computed(() => isBrowse.value && shell.view.value === 'list')
// The panel is drawn at `panelWide`, which trails `wide` while the desktop card shrinks back;
// the map frames itself for `wide` at once, so a deal opened from the list lands centred.
const panelWide = ref(wide.value)
const collapsed = computed(() => panelHidden.value && breakpoint.value === 'desktop')
const layout = useShellLayout({ breakpoint, wide, panelWide, header, collapsed })
const panelRef = ref<InstanceType<typeof ShellPanel> | null>(null)
const controlsRef = ref<HTMLElement | null>(null)
const panelTabRef = ref<HTMLElement | null>(null)
usePanelMorph({
  wide,
  panelWide,
  enabled: () => layout.mode.value === 'side' && !reducedMotion.value,
  widthFor: layout.widthFor,
  panel: () => (panelRef.value?.$el as HTMLElement | undefined) ?? null,
  rails: () => [controlsRef.value, panelTabRef.value],
})

// The outlet the panel is about: a deal's outlet or the venue being viewed.
const selected = computed<SelectedDeal | null>(() =>
  route.name === 'deal'
    ? shell.findDeal(String(route.params.dealId ?? ''), typeof route.query.at === 'string' ? route.query.at : null)
    : null,
)
const selectedVenueId = computed(() => {
  if (route.name === 'deal') return selected.value?.venue.id ?? null
  return route.name === 'venue' ? String(route.params.venueId ?? '') : null
})
const selectedPin = computed(() => (selectedVenueId.value ? shell.findVenuePin(selectedVenueId.value) : null))
const lobbiePins = computed(() => (isLobbie.value ? lobbie.resultPins.value : []))
const mapFramed = computed(() => lobbiePins.value.length > 0)

// A filter can hide the deal being viewed; its pin still shows so the map matches the panel.
const mapPins = computed(() => {
  if (mapFramed.value) return lobbiePins.value
  const pin = selectedPin.value
  return pin && !shell.pins.value.some((candidate) => candidate.id === pin.id)
    ? [...shell.pins.value, pin]
    : shell.pins.value
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
const mapFocusZoom = computed(() => (locateFocus.value ? LOCATE_ZOOM : FOCUS_ZOOM))

const showHot = computed(
  () =>
    isBrowse.value &&
    !panelWide.value &&
    shell.hotDeals.value.length > 0 &&
    // As on the Prototype board, the card only floats over the map on desktop.
    layout.mode.value === 'side',
)
const showControls = computed(() => layout.mode.value === 'side' || layout.snap.value < layout.heights.value.length - 1)
const panelLabel = computed(() => (typeof route.meta.panelLabel === 'string' ? route.meta.panelLabel : 'Results'))

// While the tablet or phone filter dialog is open, everything behind it is inert.
const backgroundInert = computed(() => (sheetOpen.value && breakpoint.value !== 'desktop' ? true : undefined))
const panelInert = computed(() => (collapsed.value ? true : backgroundInert.value))
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

// From a pin: an outlet with one deal opens that deal; with several, the outlet's panel.
const openVenue = (venueId: string) => {
  const pin = shell.findVenuePin(venueId)
  if (!pin) return
  const [only] = pin.deals
  void router.push(
    pin.deals.length === 1 && only ? dealLocation(route.query, only.id, venueId) : venueLocation(route.query, venueId),
  )
}

const openHot = (deal: SelectedDeal) => router.push(dealLocation(route.query, deal.deal.id, deal.venue.id))

// The Lobbie chip opens the chat, or closes it back to the results when it is already open.
// Opening the chat clears the quick chips and the filter sheet, so Lobbie starts from all
// deals; the search text stays. Closing it returns to the results as they are.
const toggleLobbie = () => {
  if (isLobbie.value) return router.push(browseLocation(route.query))
  const cleared = { ...createDefaultFilters(), q: shell.filters.value.q }
  return router.push({ name: 'lobbie', query: withFilters(shellQuery(route.query), cleared) })
}

const nearMe = async () => {
  const startedAt = route.path
  const located = await shell.locate()
  // A slow answer must not pull the map away from a panel opened in the meantime.
  if (route.path !== startedAt) return
  mapMoved.value = false
  locateFocus.value = located
}

// The locate on arrival only moves the map when no deal or venue was linked to directly.
const locateOnArrival = async () => {
  const startedAt = route.path
  const located = await shell.locate()
  if (route.path !== startedAt || selectedVenueId.value) return
  locateFocus.value = located
}

const searchArea = () => {
  shell.setArea(dealMap.value?.getArea() ?? null)
  mapMoved.value = false
}

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
// Switching to the list needs the panel, so it slides back in.
watch(wide, (isWide) => {
  if (isWide) panelHidden.value = false
})
// Each panel opens at a height that suits it; the visitor can drag from there.
watch(
  () => [route.name, shell.view.value] as const,
  ([name, view]) => {
    layout.snap.value = panelSnapFor(name, view)
  },
  { immediate: true },
)

onMounted(() => {
  document.documentElement.classList.add('is-canvas')
  void locateOnArrival()
})
onBeforeUnmount(() => document.documentElement.classList.remove('is-canvas'))
</script>

<template>
  <div
    class="map-shell"
    :class="[`map-shell--${layout.mode.value}`, { 'map-shell--collapsed': collapsed }]"
    :style="shellStyle"
    data-testid="map-shell"
  >
    <!-- Header first so keyboard users reach the menu and search before the map. -->
    <ShellHeader
      :inert="backgroundInert"
      ref="headerRef"
      :filters="shell.filters.value"
      :sheet-open="sheetOpen"
      :lobbie-open="isLobbie"
      @apply="applyFilters"
      @open-sheet="sheetOpen = !sheetOpen"
      @ask-lobbie="toggleLobbie"
    />
    <main class="map-shell__map" aria-label="Deal map" :inert="backgroundInert">
      <DealMap
        ref="dealMap"
        :pins="mapPins"
        :framed="mapFramed"
        :focus="mapFocus"
        :focus-zoom="mapFocusZoom"
        :focus-offset="layout.focusOffset.value"
        :view-padding="layout.viewPadding.value"
        :user-position="shell.position.value"
        :user-accuracy-metres="shell.accuracyMetres.value"
        :selected-venue-id="selectedVenueId"
        :hovered-venue-id="shell.hoveredVenueId.value"
        :hover-enabled="finePointer"
        :reduced-motion="reducedMotion"
        @select="openVenue"
        @hover="shell.setHovered"
        @moved="mapMoved = true"
      />
    </main>


    <Transition name="shell-rise">
      <button
        v-if="mapMoved && isBrowse"
        type="button"
        class="lb-btn map-shell__search-area"
        data-testid="search-area"
        @click="searchArea"
      >
        <ShellIcon name="refresh" :size="16" />Search this area
      </button>
    </Transition>

    <Transition name="shell-fade">
      <div v-show="showControls" ref="controlsRef" class="map-shell__controls" :inert="backgroundInert">
        <MapControls
          :view="shell.view.value"
          :show-toggle="isBrowse"
          :locating="shell.geoStatus.value === 'locating'"
          :show-zoom="breakpoint !== 'phone'"
          @toggle-view="shell.setView(wide ? 'map' : 'list')"
          @near-me="nearMe"
          @zoom-in="dealMap?.zoomIn()"
          @zoom-out="dealMap?.zoomOut()"
        />
      </div>
    </Transition>

    <Transition name="shell-fade">
      <HotCard v-if="showHot" :inert="backgroundInert" class="map-shell__hot" :deals="shell.hotDeals.value" :reduced-motion="reducedMotion" @open="openHot" />
    </Transition>

    <button
      v-if="layout.mode.value === 'side'"
      ref="panelTabRef"
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
      <ShellIcon :name="collapsed ? 'chevronLeft' : 'chevronRight'" :size="16" />
    </button>

    <ShellPanel
      id="shell-panel"
      ref="panelRef"
      :inert="panelInert"
      v-model:snap="layout.snap.value"
      :mode="layout.mode.value"
      :heights="layout.heights.value"
      :wide="panelWide"
      :collapsed="collapsed"
      :label="panelLabel"
    >
      <RouterView v-slot="{ Component, route: child }">
        <Transition :name="`panel-${direction}`" mode="out-in">
          <component :is="Component" :key="keyFor(child)" />
        </Transition>
      </RouterView>
    </ShellPanel>

    <FilterSheet
      :open="sheetOpen"
      :breakpoint="breakpoint"
      :filters="shell.filters.value"
      :categories="shell.categories.value"
      :cuisines="shell.cuisines.value"
      :count-for="shell.countFor"
      :location-known="shell.position.value !== null"
      @apply="applyFilters"
      @close="closeSheet"
    />

    <ShellToast />
  </div>
</template>

<style scoped>
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

/* Leaflet's panes use z-indexes up to 1000; isolating the map keeps them under the overlays. */
.map-shell__map {
  position: absolute;
  inset: 0;
  z-index: 0;
  isolation: isolate;
}

.map-shell__controls {
  position: absolute;
  right: calc(var(--panel-w) + 2 * var(--shell-gutter));
  bottom: var(--space-6);
  z-index: 10;
}

/* With the panel tucked away, the controls follow it to the right edge. */
.map-shell__controls > .map-controls {
  transition: transform var(--dur-sheet) var(--ease-drawer);
}

.map-shell--collapsed {
  --map-centre-x: 50%;
}

.map-shell--collapsed .map-shell__controls > .map-controls {
  transform: translateX(calc(var(--panel-w) + var(--shell-gutter)));
}

/* A tab on the panel's left edge hides it; it stays on the screen edge to bring it back. Placed
   with top, not a transform, because the list/map morph slides it with transform. */
.map-shell__panel-tab {
  position: absolute;
  top: calc(50% - 28px);
  right: calc(var(--panel-w) + var(--shell-gutter));
  z-index: 21;
  display: grid;
  place-items: center;
  width: 28px;
  height: 56px;
  padding: 0;
  color: var(--ink-muted);
  background: var(--paper-white);
  border: 1px solid var(--hairline);
  border-right: 0;
  border-radius: 12px 0 0 12px;
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
  color: var(--ink);
  background: var(--paper-hover);
}

.map-shell__panel-tab:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
}

.map-shell--collapsed .map-shell__panel-tab {
  transform: translateX(calc(var(--panel-w) + var(--shell-gutter)));
}

.map-shell__hot {
  position: absolute;
  bottom: var(--shell-gutter);
  left: var(--shell-gutter);
  z-index: 10;
}

.map-shell__search-area {
  position: absolute;
  bottom: var(--space-6);
  left: var(--map-centre-x);
  z-index: 15;
  box-shadow: var(--shadow-pill);
  transform: translateX(-50%);
}

.map-shell__search-area:active {
  transform: translateX(-50%) scale(0.97);
}

/* Below 992px the panel is a bottom sheet: the header spans the screen, and the controls and
   hot card ride just above the visible part of the sheet. */
.map-shell--sheet {
  --shell-gutter: var(--space-3);
  --header-w: calc(100% - 2 * var(--shell-gutter));
  --map-centre-x: 50%;
  --toast-top: calc(var(--shell-header-bottom) + var(--space-3));
  --toast-bottom: auto;
}

.map-shell--sheet .map-shell__controls,
.map-shell--sheet .map-shell__hot {
  right: var(--space-4);
  bottom: var(--space-4);
  transform: translateY(calc(-1 * var(--sheet-visible)));
  transition: transform var(--dur-sheet) var(--ease-drawer);
}

.map-shell--sheet .map-shell__hot {
  left: var(--shell-gutter);
}

.map-shell--sheet .map-shell__search-area {
  top: calc(var(--shell-header-bottom) + var(--space-3));
  bottom: auto;
}

@media (min-width: 768px) and (max-width: 991.98px) {
  .map-shell--sheet {
    --sheet-gutter: var(--space-3);
  }
}

@media (max-width: 599.98px) {
  .map-shell--sheet {
    --shell-gutter: 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .map-shell--sheet .map-shell__controls,
  .map-shell--sheet .map-shell__hot,
  .map-shell__controls > .map-controls,
  .map-shell__panel-tab {
    transition: none;
  }

  .map-shell__search-area:active {
    transform: translateX(-50%);
  }
}
</style>
