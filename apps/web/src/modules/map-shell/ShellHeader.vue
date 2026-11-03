<script setup lang="ts">
import type { DealCuisine } from '@broke-oclock/contracts/deal-cuisines'
import logoUrl from '@web/assets/lobangers-logo.svg'
import ProfileMenu from '@web/components/ProfileMenu.vue'
import { authClient } from '@web/lib/auth-client'
import type { BrowseFilters } from '@web/modules/browse-map/filters'
import { countSheetFilters, updateFilters } from '@web/modules/browse-map/filters'
import BrandMenu from '@web/modules/map-shell/BrandMenu.vue'
import DiscoveryQuickFilters from '@web/modules/map-shell/DiscoveryQuickFilters.vue'
import SearchField from '@web/modules/map-shell/SearchField.vue'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { shellQuery } from '@web/modules/map-shell/shell-routes'
import { useShellNavigation } from '@web/modules/map-shell/use-shell-navigation'
import SquadHeaderButton from '@web/modules/squad/SquadHeaderButton.vue'
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

const navigationTo = useShellNavigation()
const route = useRoute()
// The All Deals page's way onto the map, with the results list alongside it.
const mapTo = computed(() => ({ name: 'browse', query: { ...shellQuery(route.query), view: 'map', split: '1', results: 'list' } }))

// Floating header: menu button, search and the Squad room button on the first row, quick
// chips underneath. On desktop it sits over the left drawer, beside the navigation rail (All
// Deals has its own full-width header); below 992px it spans the screen.
const session = authClient.useSession()
// Merchants already have access, and staff can't request it, so only visitors and regular
// accounts are offered it.
const offerMerchantAccess = computed(() => !session.value.data || session.value.data.user.role === 'USER')
// Merchants get their dashboard in the same spot, so it is one click away and not only in menus.
const isMerchant = computed(() => session.value.data?.user.role === 'MERCHANT')
const props = withDefaults(
  defineProps<{
    filters: BrowseFilters
    sheetOpen: boolean
    lobbieOpen?: boolean
    discovery?: boolean
    dealsHeader?: boolean
    mapLayout?: boolean
    sidebarVisible?: boolean
    /** A bottom nav is showing: the menu's rows live on the Account page, and Squad takes its slot. */
    bottomNav?: boolean
    mapTools?: boolean
    showLocation?: boolean
    categories: readonly string[]
    cuisines: readonly DealCuisine[]
    countFor: (filters: BrowseFilters) => number
    locationKnown: boolean
  }>(),
  { lobbieOpen: false },
)
const emit = defineEmits<{
  apply: [filters: BrowseFilters, mode: 'push' | 'replace']
  openSheet: []
  menuChange: [open: boolean]
  askLobbie: []
}>()

const mobileFilters = ref<HTMLButtonElement | null>(null)
const filterCount = computed(() => countSheetFilters(props.filters))
const chips = ref<{ focusAllFilters: () => void } | null>(null)

// The first search adds a history entry; refining it replaces that entry.
const onSearch = (q: string) =>
  emit('apply', updateFilters(props.filters, 'q', q), props.filters.q ? 'replace' : 'push')

defineExpose({ focusAllFilters: () => {
  if (mobileFilters.value?.getClientRects().length) mobileFilters.value.focus()
  else chips.value?.focusAllFilters()
} })
</script>

<template>
  <header class="shell-header" :class="{ 'shell-header--deals': dealsHeader, 'shell-header--discovery': discovery, 'shell-header--map': mapLayout, 'shell-header--no-sidebar': mapLayout && sidebarVisible === false }" data-testid="shell-header">
    <template v-if="dealsHeader">
      <div class="shell-header__start">
        <BrandMenu v-if="!bottomNav" compact @menu-change="(open) => emit('menuChange', open)" />
        <RouterLink class="shell-header__brand" to="/" aria-label="Lobangers home"><img :src="logoUrl" alt="Lobangers" width="816" height="170" /></RouterLink>
      </div>
      <div class="shell-header__main-search">
        <RouterLink v-if="!bottomNav" class="shell-header__map" :to="mapTo" aria-label="Map" data-testid="deals-map-button"><ShellIcon name="map" :size="20" /><span>Map</span></RouterLink>
        <SearchField :value="filters.q" :submit-button="!bottomNav" @search="onSearch" />
      </div>
      <div class="shell-header__actions">
        <SquadHeaderButton :compact="bottomNav" />
        <RouterLink v-if="offerMerchantAccess" class="shell-header__contribute" :to="navigationTo('/me/merchant-access')" data-testid="become-merchant">Become a merchant</RouterLink>
        <RouterLink v-else-if="isMerchant" class="shell-header__contribute" to="/merchant" data-testid="header-merchant-dashboard">Merchant dashboard</RouterLink>
        <ProfileMenu v-if="session.data" class="shell-header__profile" />
        <RouterLink v-else class="shell-header__account" to="/login" aria-label="Log in"><ShellIcon name="user" :size="22" /></RouterLink>
      </div>
    </template>
    <div v-else-if="mapLayout && sidebarVisible === false" class="shell-header__combined-search lb-card">
      <BrandMenu rail :map-tools="mapTools" @menu-change="(open) => emit('menuChange', open)" />
      <SearchField :value="filters.q" @search="onSearch" />
      <SquadHeaderButton class="shell-header__room" />
    </div>
    <template v-else>
      <SquadHeaderButton v-if="bottomNav" compact class="shell-header__squad" />
      <BrandMenu v-else-if="!mapLayout" :map-tools="mapTools" @menu-change="(open) => emit('menuChange', open)" />
      <!-- Search and Room share one grid cell so each header layout keeps its columns. -->
      <div class="shell-header__search-row">
        <SearchField :value="filters.q" @search="onSearch" />
        <SquadHeaderButton v-if="!bottomNav" class="shell-header__room" />
      </div>
    </template>
    <button ref="mobileFilters" class="shell-header__mobile-filters" type="button" aria-label="Filters" aria-haspopup="dialog" :aria-expanded="sheetOpen" aria-controls="filter-sheet" data-testid="mobile-all-filters" @click="emit('openSheet')">
      <ShellIcon name="filters" :size="23" />
      <span v-if="filterCount" class="shell-header__filter-count" data-testid="mobile-filter-badge">{{ filterCount }}<span class="visually-hidden"> active filters</span></span>
    </button>
    <DiscoveryQuickFilters
      ref="chips"
      class="shell-header__chips"
      :filters="filters"
      :sheet-open="sheetOpen"
      :lobbie-open="lobbieOpen"
      :hide-lobbie="dealsHeader"
      :categories="categories"
      :cuisines="cuisines"
      :count-for="countFor"
      :show-location="showLocation"
      :location-known="locationKnown"
      @apply="(next) => emit('apply', next, 'push')"
      @open-sheet="emit('openSheet')"
      @ask-lobbie="emit('askLobbie')"
    />

  </header>
</template>

<style scoped>
.shell-header__mobile-filters {
  display: none;
}

.shell-header {
  position: absolute;
  /* Clear the status bar and notch (the page uses viewport-fit=cover). */
  top: calc(var(--shell-gutter) + env(safe-area-inset-top, 0px));
  left: var(--shell-gutter);
  z-index: 30;
  display: grid;
  --header-gap: 10px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--header-gap);
  align-items: center;
  width: var(--header-w);
  pointer-events: none;
}

.shell-header > * {
  pointer-events: auto;
}

.shell-header__chips {
  grid-column: 1 / -1;
}

.shell-header__search-row {
  display: flex;
  align-items: center;
  gap: var(--header-gap);
  min-width: 0;
}

.shell-header__search-row :deep(.search-field) {
  flex: 1;
  min-width: 0;
}

/* Inside the combined pill card, Room sits flush with the card's right edge. */
.shell-header__combined-search .shell-header__room {
  height: var(--hit);
  margin-right: 4px;
}

/* In a room the Squad button widens to show its code; the grid column follows it. */
.shell-header__squad {
  justify-self: start;
}

/* The smallest phones: a tighter gap so the search keeps a usable width beside Room. */
@media (max-width: 399.98px) {
  .shell-header {
    --header-gap: 8px;
  }
}

.shell-header--discovery {
  left: 50%;
  width: min(1600px, calc(100% - 2 * var(--shell-gutter)));
  grid-template-columns: auto minmax(220px, 640px) auto;
  justify-content: space-between;
  column-gap: 24px;
  transform: translateX(-50%);
}

.shell-header--discovery .shell-header__chips {
  justify-content: center;
}

.shell-header--map {
  top: calc(16px + env(safe-area-inset-top, 0px));
  left: calc(var(--map-rail-w) + 16px);
  width: calc(100% - var(--map-rail-w) - 32px);
  grid-template-columns: minmax(0, calc(var(--panel-w) - 32px)) minmax(0, 1fr);
  align-items: start;
  gap: 12px 20px;
  transform: none;
}

.shell-header--map .shell-header__chips {
  grid-column: 2;
}

.shell-header--map :deep(.discovery-filters__chips) {
  justify-content: flex-start;
}

.shell-header--no-sidebar {
  grid-template-columns: minmax(0, calc(var(--panel-w) - 32px)) minmax(0, 1fr);
}

.shell-header--no-sidebar .shell-header__chips {
  grid-column: 2;
}

.shell-header__combined-search {
  display: flex;
  align-items: center;
  min-width: 0;
  height: var(--control-h);
  padding-left: 4px;
  border-radius: var(--radius-pill);
}

.shell-header__combined-search:focus-within {
  border-color: var(--coral);
}

.shell-header__combined-search :deep(.brand-menu__button) {
  width: var(--hit);
  height: var(--hit);
  background: transparent;
  border: 0;
  box-shadow: none;
}

.shell-header__combined-search :deep(.search-field) {
  flex: 1;
  height: 100%;
  padding-left: 8px;
  background: transparent;
  border: 0;
  box-shadow: none;
}

@media (max-width: 991.98px) {
  .shell-header--discovery {
    grid-template-columns: auto minmax(0, 1fr);
    column-gap: 10px;
  }
}
@media (max-width: 767.98px) {
  .shell-header,
  .shell-header--discovery {
    grid-template-columns: auto minmax(0, 1fr) 44px;
    column-gap: 8px;
    row-gap: 6px;
    align-items: center;
  }

  .shell-header__mobile-filters {
    position: relative;
    display: grid;
    place-items: center;
    grid-column: 3;
    grid-row: 1;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 1px solid var(--hairline);
    border-radius: 50%;
    color: var(--ink);
    background: var(--paper-white);
    box-shadow: var(--shadow-card);
    cursor: pointer;
  }

  .shell-header__mobile-filters:focus-visible {
    outline: 3px solid var(--sunny-ring);
    outline-offset: 2px;
  }

  .shell-header__filter-count {
    position: absolute;
    top: -2px;
    right: -2px;
    display: grid;
    place-items: center;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    border-radius: var(--radius-pill);
    color: var(--on-ink);
    background: var(--coral-deep);
    font: 700 0.6875rem/1 var(--font-sans);
  }

  .shell-header__chips {
    grid-column: 1 / -1;
    grid-row: 2;
    min-width: 0;
  }

  /* Size the inside so the card border never shrinks the menu toggle below a touch target. */
  .shell-header :deep(.brand-menu__button) {
    box-sizing: content-box;
    width: var(--hit);
    height: var(--hit);
    justify-content: center;
    padding: 0;
  }

  /* The whole home link goes, not just its artwork, so no empty link takes keyboard focus. */
  .shell-header :deep(.brand-menu__home),
  .shell-header :deep(.brand-menu__mark),
  .shell-header :deep(.brand-menu__word) {
    display: none;
  }
}
/* All Deals uses a full-width two-row header with a centred search.
   KEEP IN SYNC with components/PageHeader.vue, the same header on pages outside the map
   (Add deal, merchant access). Change the order, spacing or buttons in both files. */
.shell-header--deals {
  top: 0;
  left: 0;
  width: 100%;
  box-sizing: border-box;
  padding: calc(20px + env(safe-area-inset-top, 0px)) clamp(20px, 3vw, 56px) 16px;
  /* Side columns never shrink below their contents, so Room and the account can't spill over the search. */
  grid-template-columns: minmax(min-content, 1fr) minmax(240px, 560px) minmax(max-content, 1fr);
  gap: 20px 24px;
  transform: none;
  background: var(--paper-white);
  border-bottom: 1px solid var(--hairline);
  pointer-events: auto;
}
.shell-header__start { justify-self: start; display: flex; align-items: center; gap: 12px; }
.shell-header__brand { display: flex; align-items: center; }
/* A fixed width: a percentage max-width collapses to nothing in a content-sized column. */
.shell-header__brand img { display: block; flex: none; width: 160px; height: auto; }
.shell-header__actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; min-width: 0; }
.shell-header__contribute { color: var(--ink); font-size: var(--text-sm); font-weight: 650; text-decoration: none; white-space: nowrap; padding: 10px; border-radius: var(--radius-pill); }
.shell-header__contribute:hover { background: var(--paper-hover); }
.shell-header__account { display: grid; place-items: center; width: 44px; height: 44px; flex: none; border-radius: 50%; color: var(--ink); background: var(--paper-sunk); }
.shell-header--deals :deep(.search-field) { flex: 1; min-width: 0; }
/* Desktop's All Deals search is a bit shorter, with a yellow submit button; with a bottom nav it
   matches the map's search exactly. */
@media (min-width: 992px) { .shell-header--deals :deep(.search-field) { height: 48px; box-shadow: 0 2px 8px rgb(0 0 0 / 0.08); } }
.shell-header__main-search { display: flex; align-items: center; gap: 10px; min-width: 0; }
.shell-header__map { display: inline-flex; flex: none; align-items: center; gap: 6px; box-sizing: border-box; height: 48px; padding: 0 18px 0 16px; font: 700 0.9375rem/1 var(--font-sans); color: var(--on-accent); text-decoration: none; white-space: nowrap; background: var(--sunny); border: 1px solid var(--sunny-deep); border-radius: var(--radius-pill); transition: transform var(--dur-press) var(--ease-out), background-color 150ms ease; }
.shell-header__map:hover { color: var(--on-accent); background: var(--sunny-deep); }
.shell-header__map:active { transform: scale(0.97); }
.shell-header__map:focus-visible { outline: 3px solid var(--sky); outline-offset: 2px; }
/* Narrow desktops: icon only, so the search keeps its width. */
@media (min-width: 992px) and (max-width: 1279.98px) {
  .shell-header__map { width: 48px; padding: 0; justify-content: center; }
  .shell-header__map span { display: none; }
}
.shell-header--deals .shell-header__chips { grid-column: 1 / -1; }
@media (max-width: 991.98px) {
  .shell-header--deals { grid-template-columns: auto minmax(0, 1fr) 44px; padding: calc(16px + env(safe-area-inset-top, 0px)) calc(16px + env(safe-area-inset-right, 0px)) 16px calc(16px + env(safe-area-inset-left, 0px)); gap: 12px 8px; }
  .shell-header--deals .shell-header__start,
  .shell-header--deals .shell-header__contribute,
  .shell-header--deals .shell-header__account,
  .shell-header--deals .shell-header__profile { display: none; }
  .shell-header--deals .shell-header__actions { grid-column: 1; grid-row: 1; }
  .shell-header--deals .shell-header__main-search { grid-column: 2; grid-row: 1; }
  .shell-header--deals .shell-header__mobile-filters { position: relative; display: grid; place-items: center; grid-column: 3; grid-row: 1; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 50%; color: var(--ink); background: var(--paper-white); }
  .shell-header--deals .shell-header__chips { grid-column: 1 / -1; grid-row: 2; }
}
/* Phones: the compact chip row sits as close to the search as it does on the map. */
@media (max-width: 767.98px) {
  .shell-header--deals { row-gap: 6px; }
}
</style>
