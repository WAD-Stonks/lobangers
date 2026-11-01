<script setup lang="ts">
import type { DealCuisine } from '@broke-oclock/contracts/deal-cuisines'
import logoUrl from '@web/assets/lobangers-logo.png'
import ProfileMenu from '@web/components/ProfileMenu.vue'
import { authClient } from '@web/lib/auth-client'
import type { BrowseFilters } from '@web/modules/browse-map/filters'
import { countSheetFilters, updateFilters } from '@web/modules/browse-map/filters'
import BrandMenu from '@web/modules/map-shell/BrandMenu.vue'
import DiscoveryQuickFilters from '@web/modules/map-shell/DiscoveryQuickFilters.vue'
import SearchField from '@web/modules/map-shell/SearchField.vue'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { useShellNavigation } from '@web/modules/map-shell/use-shell-navigation'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'

const navigationTo = useShellNavigation()

// Floating header: menu button and search on the first row, quick chips underneath. On
// desktop it sits in the panel column; below 992px it spans the screen.
const session = authClient.useSession()
const props = withDefaults(
  defineProps<{
    filters: BrowseFilters
    sheetOpen: boolean
    lobbieOpen?: boolean
    discovery?: boolean
    dealsHeader?: boolean
    mapLayout?: boolean
    sidebarVisible?: boolean
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
      <RouterLink class="shell-header__brand" to="/" aria-label="Lobangers home"><img :src="logoUrl" alt="Lobangers" /></RouterLink>
      <SearchField class="shell-header__main-search" :value="filters.q" submit-button @search="onSearch" />
      <div class="shell-header__actions">
        <RouterLink class="shell-header__contribute" :to="navigationTo('/me/merchant-access')">Become a merchant</RouterLink>
        <ProfileMenu v-if="session.data" class="shell-header__profile" />
        <RouterLink v-else class="shell-header__account" to="/login" aria-label="Log in"><ShellIcon name="user" :size="22" /></RouterLink>
        <BrandMenu compact @menu-change="(open) => emit('menuChange', open)" />
      </div>
    </template>
    <div v-else-if="mapLayout && sidebarVisible === false" class="shell-header__combined-search lb-card">
      <BrandMenu rail :map-tools="mapTools" @menu-change="(open) => emit('menuChange', open)" />
      <SearchField :value="filters.q" @search="onSearch" />
    </div>
    <template v-else>
      <BrandMenu v-if="!mapLayout" :map-tools="mapTools" @menu-change="(open) => emit('menuChange', open)" />
      <SearchField :value="filters.q" @search="onSearch" />
    </template>
    <button ref="mobileFilters" class="shell-header__mobile-filters" type="button" aria-label="Filters" aria-haspopup="dialog" :aria-expanded="sheetOpen" aria-controls="filter-sheet" data-testid="mobile-all-filters" @click="emit('openSheet')">
      <ShellIcon name="filters" :size="23" />
      <span v-if="filterCount" class="shell-header__filter-count" data-testid="mobile-filter-badge">{{ filterCount }}<span class="visually-hidden"> active filters</span></span>
    </button>
    <nav v-if="discovery && !mapLayout && !dealsHeader" class="shell-header__nav" aria-label="Discover">
      <RouterLink :to="navigationTo('/deals')">All deals</RouterLink>
      <RouterLink :to="navigationTo('/browse')">Map</RouterLink>
      <RouterLink v-if="session.data" :to="navigationTo('/saved')">Saved deals</RouterLink>
      <ProfileMenu v-if="session.data" />
      <template v-else>
        <RouterLink to="/about#story">How it works</RouterLink>
        <RouterLink to="/login">Log in</RouterLink>
        <RouterLink class="shell-header__signup" to="/register">Sign up</RouterLink>
      </template>
    </nav>
    <DiscoveryQuickFilters
      ref="chips"
      class="shell-header__chips"
      :filters="filters"
      :sheet-open="sheetOpen"
      :lobbie-open="lobbieOpen"
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
  top: var(--shell-gutter);
  left: var(--shell-gutter);
  z-index: 30;
  display: grid;
  --header-gap: 10px;
  grid-template-columns: auto minmax(0, 1fr);
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

.shell-header--discovery {
  left: 50%;
  width: min(1600px, calc(100% - 2 * var(--shell-gutter)));
  grid-template-columns: auto minmax(220px, 640px) auto;
  justify-content: space-between;
  column-gap: 24px;
  transform: translateX(-50%);
}

.shell-header__nav {
  display: flex;
  gap: 20px;
  align-items: center;
}

.shell-header__nav a {
  display: inline-flex;
  align-items: center;
  min-height: var(--hit);
  font-weight: 700;
  color: var(--ink);
  text-decoration: none;
  white-space: nowrap;
}

.shell-header__nav a:hover {
  color: var(--coral-deep);
}

.shell-header__nav .shell-header__signup {
  padding: 0 18px;
  background: var(--sunny);
  border-radius: var(--radius-pill);
}

.shell-header--discovery .shell-header__chips {
  justify-content: center;
}

.shell-header--map {
  top: 16px;
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

  .shell-header__nav {
    display: none;
  }
}
@media (max-width: 767.98px) {
  .shell-header,
  .shell-header--discovery {
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    column-gap: 8px;
    row-gap: 12px;
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
    border: 0;
    border-radius: 50%;
    color: var(--ink);
    background: var(--paper-white);
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
    color: var(--paper-white);
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
/* All Deals uses a full-width two-row header with a centred search. */
.shell-header--deals {
  top: 0;
  left: 0;
  width: 100%;
  box-sizing: border-box;
  padding: 20px clamp(20px, 3vw, 56px) 16px;
  grid-template-columns: minmax(160px, 1fr) minmax(240px, 480px) minmax(260px, 1fr);
  gap: 20px 24px;
  transform: none;
  background: var(--paper-white);
  border-bottom: 1px solid var(--hairline);
  pointer-events: auto;
}
.shell-header__brand { justify-self: start; display: flex; align-items: center; }
.shell-header__brand img { width: 160px; max-width: 100%; height: auto; }
.shell-header__actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; min-width: 0; }
.shell-header__contribute { color: var(--ink); font-size: var(--text-sm); font-weight: 650; text-decoration: none; white-space: nowrap; padding: 10px; border-radius: var(--radius-pill); }
.shell-header__contribute:hover { background: var(--paper-hover); }
.shell-header__account { display: grid; place-items: center; width: 44px; height: 44px; flex: none; border-radius: 50%; color: var(--ink); background: var(--paper-sunk); }
.shell-header--deals :deep(.search-field) { height: 48px; box-shadow: 0 2px 8px rgb(0 0 0 / 0.08); }
.shell-header--deals .shell-header__chips { grid-column: 1 / -1; }
@media (max-width: 991.98px) {
  .shell-header--deals { grid-template-columns: 44px minmax(0, 1fr) 44px; padding: 16px; gap: 12px 8px; }
  .shell-header--deals .shell-header__brand,
  .shell-header--deals .shell-header__contribute,
  .shell-header--deals .shell-header__account,
  .shell-header--deals .shell-header__profile { display: none; }
  .shell-header--deals .shell-header__actions { grid-column: 1; grid-row: 1; }
  .shell-header--deals .shell-header__main-search { grid-column: 2; grid-row: 1; }
  .shell-header--deals .shell-header__mobile-filters { position: relative; display: grid; place-items: center; grid-column: 3; grid-row: 1; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 50%; color: var(--ink); background: var(--paper-white); }
  .shell-header--deals .shell-header__chips { grid-column: 1 / -1; grid-row: 2; }
}
</style>
