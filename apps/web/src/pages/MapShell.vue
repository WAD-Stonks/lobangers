<script setup lang="ts">
import '@web/modules/map-shell/shell-ui.css'
import '@web/modules/map-shell/motion.css'
import { authClient } from '@web/lib/auth-client'
import DealMap from '@web/modules/browse-map/DealMap.vue'
import type { BrowseFilters } from '@web/modules/browse-map/filters'
import type { Coordinates, SelectedDeal } from '@web/modules/browse-map/types'
import FilterSheet from '@web/modules/map-shell/FilterSheet.vue'
import HotCard from '@web/modules/map-shell/HotCard.vue'
import MapControls from '@web/modules/map-shell/MapControls.vue'
import { type NavDirection, navDirection } from '@web/modules/map-shell/nav-direction'
import { PANEL_FOCUS_KEY } from '@web/modules/map-shell/panel-focus'
import ShellHeader from '@web/modules/map-shell/ShellHeader.vue'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import ShellPanel from '@web/modules/map-shell/ShellPanel.vue'
import ShellToast from '@web/modules/map-shell/ShellToast.vue'
import { dealLocation, panelSnapFor, venueLocation } from '@web/modules/map-shell/shell-routes'
import { provideShellState } from '@web/modules/map-shell/shell-state'
import { useBreakpoint, useFinePointer, usePrefersReducedMotion } from '@web/modules/map-shell/use-breakpoint'
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
provide(PANEL_FOCUS_KEY, focusHeadingOnMount)

const isBrowse = computed(() => route.name === 'browse')
const wide = computed(() => isBrowse.value && shell.view.value === 'list')
const layout = useShellLayout({ breakpoint, wide, header })

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

// A filter can hide the deal being viewed; its pin still shows so the map matches the panel.
const mapPins = computed(() => {
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
const mapFocus = computed<Coordinates | null>(() => selectedFocus.value ?? locateFocus.value)

const showHot = computed(
  () =>
    isBrowse.value &&
    !wide.value &&
    shell.hotDeals.value.length > 0 &&
    // As on the Prototype board, the card only floats over the map on desktop.
    layout.mode.value === 'side',
)
const showControls = computed(() => layout.mode.value === 'side' || layout.snap.value < layout.heights.value.length - 1)
const panelLabel = computed(() => (typeof route.meta.panelLabel === 'string' ? route.meta.panelLabel : 'Results'))

// While the tablet or phone filter dialog is open, everything behind it is inert.
const backgroundInert = computed(() => (sheetOpen.value && breakpoint.value !== 'desktop' ? true : undefined))

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

const nearMe = async () => {
  const startedAt = route.path
  const located = await shell.locate()
  // A slow answer must not pull the map away from a panel opened in the meantime.
  if (route.path !== startedAt) return
  mapMoved.value = false
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
    // A filter change from a deal or venue lands on browse with the sheet still in use. Any
    // other navigation closes it, and the new panel's heading takes focus.
    if (route.name !== 'browse') sheetOpen.value = false
  },
)
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
  void nearMe()
})
onBeforeUnmount(() => document.documentElement.classList.remove('is-canvas'))
</script>

<template>
  <div class="map-shell" :class="`map-shell--${layout.mode.value}`" :style="shellStyle" data-testid="map-shell">
    <!-- Header first so keyboard users reach the menu and search before the map. -->
    <ShellHeader
      :inert="backgroundInert"
      ref="headerRef"
      :filters="shell.filters.value"
      :sheet-open="sheetOpen"
      @apply="applyFilters"
      @open-sheet="sheetOpen = !sheetOpen"
    />
    <main class="map-shell__map" aria-label="Deal map" :inert="backgroundInert">
      <DealMap
        ref="dealMap"
        :pins="mapPins"
        :focus="mapFocus"
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

    <div v-show="showControls" class="map-shell__controls" :inert="backgroundInert">
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

    <HotCard v-if="showHot" :inert="backgroundInert" class="map-shell__hot" :deals="shell.hotDeals.value" :reduced-motion="reducedMotion" @open="openHot" />

    <ShellPanel
      :inert="backgroundInert"
      v-model:snap="layout.snap.value"
      :mode="layout.mode.value"
      :heights="layout.heights.value"
      :wide="wide"
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
  --header-w: min(31rem, calc(100% - 2 * var(--shell-gutter)));
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
  transition: transform var(--dur-panel) var(--ease-out);
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
  .map-shell--sheet .map-shell__hot {
    transition: none;
  }

  .map-shell__search-area:active {
    transform: translateX(-50%);
  }
}
</style>
