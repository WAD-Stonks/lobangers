<script setup lang="ts">
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
import FilterSheet from '@web/modules/map-shell/FilterSheet.vue'
import HotCard from '@web/modules/map-shell/HotCard.vue'
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
import { browseLocation, dealLocation, panelSnapFor, shellQuery, venueLocation } from '@web/modules/map-shell/shell-routes'
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
const saved = provideSavedDeals(authClient.useSession())
const shell = provideShellState({ router, route, saved })
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
const dealsExperience = computed(
  () => ['browse', 'saved', 'deal', 'venue'].includes(String(route.name)) && route.query.discovery === '1',
)
const dealsPage = computed(() => dealsExperience.value && shell.view.value === 'list')
const mapWorkspace = computed(() => !dealsPage.value && shell.view.value === 'map')
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
// The panel is drawn at `panelWide`, which trails `wide` while the desktop card shrinks back;
// the map frames itself for `wide` at once, so a deal opened from the list lands centred.
const panelWide = ref(wide.value)
const collapsed = computed(() => !authPrompt.value && panelHidden.value && breakpoint.value === 'desktop')
const resultsPreviewHeight = ref<number | null>(null)
const layout = useShellLayout({ breakpoint, wide, panelWide, header, collapsed, leftPanel: desktopMap, railVisible: mapPreferences.sidebarVisible, bottomNavigation, resultsPreviewHeight })
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

const controlsRef = ref<HTMLElement | null>(null)
const panelTabRef = ref<HTMLElement | null>(null)
usePanelMorph({
  wide,
  panelWide,
  enabled: () => layout.mode.value === 'side' && !desktopMap.value && !reducedMotion.value,
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
// "Near me" outranks the open deal until the next navigation clears it, so the latest ask wins.
const mapFocus = computed<Coordinates | null>(() => locateFocus.value ?? selectedFocus.value)
const mapFocusZoom = computed(() => locateFocus.value ? LOCATE_ZOOM : FOCUS_ZOOM)

const showHot = computed(
  () =>
    isBrowse.value &&
    !desktopMap.value &&
    !panelWide.value &&
    shell.hotDeals.value.length > 0 &&
    // As on the Prototype board, the card only floats over the map on desktop.
    layout.mode.value === 'side',
)
const showControls = computed(
  () =>
    mapWorkspace.value &&
    (layout.mode.value === 'side' || layout.snap.value < layout.heights.value.length - 1),
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
  if (addDeal) await router.push({ name: 'add-deal', query: shellQuery(origin?.query ?? route.query) })
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
  const pin = mapPins.value.find((candidate) => candidate.id === venueId) ?? shell.findVenuePin(venueId)
  if (!pin) return
  const [only] = pin.deals
  void router.push(
    pin.deals.length === 1 && only ? dealLocation(resultsQuery.value, only.id, venueId) : venueLocation(resultsQuery.value, venueId),
  )
}

const openHot = (deal: SelectedDeal) => router.push(dealLocation(resultsQuery.value, deal.deal.id, deal.venue.id))

const nearMe = async () => {
  const startedAt = route.path
  const located = await shell.locate()
  // A slow answer must not pull the map away from a panel opened in the meantime.
  if (route.path !== startedAt) return
  locateFocus.value = located
}

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

onMounted(() => {
  document.documentElement.classList.add('is-canvas')
  // Resolve distances without replacing the initial Singapore overview.
  void shell.locate()
})
onBeforeUnmount(() => document.documentElement.classList.remove('is-canvas'))
</script>

<template>
  <div
    class="map-shell"
    :class="[`map-shell--${layout.mode.value}`, { 'map-shell--collapsed': collapsed, 'map-shell--discovery': dealsExperience, 'map-shell--deals-page': dealsPage, 'map-shell--map-only': mapOnly, 'map-shell--map-workspace': desktopMap, 'map-shell--bottom-nav': bottomNavigation }]"
    :style="shellStyle"
    data-testid="map-shell"
  >
    <MapNavigation v-if="(desktopMap && mapPreferences.sidebarVisible.value) || bottomNavigation" :bottom="bottomNavigation" :inert="navigationInert" :panel-open="bottomNavigation ? !mapOnly : !collapsed" @open-panel="panelHidden = false; layout.snap.value = Math.max(1, layout.snap.value)" @menu-change="navigationOpen = $event" />
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
    <main class="map-shell__map" aria-label="Deal map" :inert="backgroundInert">
      <DealMap
        ref="dealMap"
        :pins="mapPins"
        :focus="mapFocus"
        :focus-zoom="mapFocusZoom"
        :focus-offset="mapOnly && !desktopMap ? { x: 0, y: 0 } : layout.focusOffset.value"
        :view-padding="mapOnly && !desktopMap ? { top: 0, right: 0, bottom: 0, left: 0 } : layout.viewPadding.value"
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
      />
    </main>


    <Transition name="shell-fade">
      <div v-show="showControls" ref="controlsRef" class="map-shell__controls" :inert="backgroundInert">
        <MapControls
          :locating="shell.geoStatus.value === 'locating'"
          :show-zoom="breakpoint !== 'phone'"
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
      v-if="layout.mode.value === 'side' && !mapOnly && !dealsPage"
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
      <ShellIcon :name="desktopMap ? (collapsed ? 'chevronRight' : 'chevronLeft') : (collapsed ? 'chevronLeft' : 'chevronRight')" :size="16" />
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
      <AuthPrompt v-if="authPrompt" />
      <div v-show="!authPrompt" class="map-shell__panel-route">
      <BrowseListPanel v-if="listBackground" />
      <RouterView v-else v-slot="{ Component, route: child }">
        <component v-if="mapWorkspace" :is="Component" :key="keyFor(child)" />
        <Transition v-else :name="`panel-${direction}`" :css="!tutorialActive && !tutorialRestoring" :mode="tutorialActive || tutorialRestoring ? 'default' : 'out-in'">
          <component :is="Component" :key="keyFor(child)" />
        </Transition>
      </RouterView>
      </div>
    </ShellPanel>

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
.map-shell :deep(.auth-prompt__content) { padding: 28px 22px; }
.map-shell--map-workspace.map-shell--side :deep(.auth-prompt__content) { padding-top: calc(var(--shell-header-bottom) + 20px); }
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
  color: var(--ink);
  background: var(--sunny);
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
  background: var(--sunny);
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



/* The deals route is a dedicated browse page. Keep the map mounted for fast toggling, but
   let the cards use the full canvas until the visitor explicitly asks for a map. */
.map-shell--discovery .shell-panel--side {
  top: calc(var(--shell-header-bottom) + var(--space-4));
}

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

.map-shell--map-only .map-shell__controls {
  right: var(--shell-gutter);
}

.map-shell--map-only .map-shell__controls > .map-controls {
  transform: none;
}

.map-shell--bottom-nav .shell-panel--sheet {
  bottom: var(--bottom-nav-h);
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
  bottom: calc(var(--space-4) + var(--bottom-nav-h, 0px));
  transform: translateY(calc(-1 * var(--sheet-visible)));
  transition: transform var(--dur-sheet) var(--ease-drawer);
}

.map-shell--map-only.map-shell--sheet .map-shell__controls {
  bottom: calc(var(--space-4) + var(--bottom-nav-h, 0px));
  transform: none;
}

.map-shell--sheet .map-shell__hot {
  left: var(--shell-gutter);
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

@media (max-width: 599.98px) {
  .map-shell--sheet {
    --shell-gutter: 10px;
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

.map-shell--map-workspace.map-shell--side .map-shell__controls {
  right: 20px;
  bottom: 28px;
}

.map-shell--map-workspace .map-shell__controls > .map-controls {
  transform: none;
}

.map-shell--map-workspace .map-shell__panel-tab {
  right: auto;
  left: calc(var(--map-rail-w) + var(--panel-w));
  border-right: 1px solid var(--hairline);
  border-left: 0;
  border-radius: 0 12px 12px 0;
  transform: none;
}

.map-shell--map-workspace.map-shell--collapsed .map-shell__panel-tab {
  transform: translateX(calc(-1 * var(--panel-w)));
}


@media (prefers-reduced-motion: reduce) {
  .map-shell--map-workspace.map-shell--side .shell-panel--side,
  .map-shell--map-workspace.map-shell--side .shell-panel--side.is-collapsed,
  .map-shell--sheet .map-shell__controls,
  .map-shell--sheet .map-shell__hot,
  .map-shell__controls > .map-controls,
  .map-shell__panel-tab {
    transition: none;
  }

}
</style>
