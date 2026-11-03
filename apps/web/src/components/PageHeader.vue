<script setup lang="ts">
import logoUrl from '@web/assets/lobangers-logo.svg'
import ProfileMenu from '@web/components/ProfileMenu.vue'
import { authClient } from '@web/lib/auth-client'
import BrandMenu from '@web/modules/map-shell/BrandMenu.vue'
import SearchField from '@web/modules/map-shell/SearchField.vue'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { useBreakpoint } from '@web/modules/map-shell/use-breakpoint'
import { provideSavedDeals } from '@web/modules/map-shell/use-saved-deals'
import SquadHeaderButton from '@web/modules/squad/SquadHeaderButton.vue'
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

// The All Deals header for pages outside the map: menu, logo, search, Room and account.
// KEEP IN SYNC with the `deals` variant of ShellHeader.vue (All Deals page): same order of
// items, same search bar, same phone layout. A change to one header is a change to both.
// Searching opens All Deals with the results.
const session = authClient.useSession()
// Merchants already have access, and staff can't request it, so only visitors and regular
// accounts are offered it.
const offerMerchantAccess = computed(() => !session.value.data || session.value.data.user.role === 'USER')
// Merchants get their dashboard in the same spot, so it is one click away and not only in menus.
const isMerchant = computed(() => session.value.data?.user.role === 'MERCHANT')
// The menu shows the saved-deals count, which lives in the map shell everywhere else.
provideSavedDeals(session)
const router = useRouter()
// Below desktop the bottom nav carries All deals, Map and the menu's rows, so the header is
// just Room and search, as on All Deals.
const breakpoint = useBreakpoint()
const bottomNav = computed(() => breakpoint.value !== 'desktop')
const allDeals = { name: 'browse', query: { view: 'list', discovery: '1' } } as const
// The map with the results list alongside it.
const mapTo = { name: 'browse', query: { view: 'map', split: '1', results: 'list', discovery: '1' } } as const
const onSearch = (q: string) =>
  router.push({ ...allDeals, query: { ...allDeals.query, ...(q ? { q } : {}) } })
</script>

<template>
  <header class="page-header" data-testid="page-header">
    <div class="page-header__start">
      <BrandMenu v-if="!bottomNav" compact />
      <RouterLink class="page-header__brand" to="/" aria-label="Lobangers home"><img :src="logoUrl" alt="Lobangers" width="160" height="33" /></RouterLink>
    </div>
    <div class="page-header__search">
      <template v-if="!bottomNav">
        <RouterLink class="page-header__deals" :to="allDeals" aria-label="All deals"><ShellIcon name="ticket" :size="20" /><span>All deals</span></RouterLink>
        <RouterLink class="page-header__deals" :to="mapTo" aria-label="Map" data-testid="page-map-button"><ShellIcon name="map" :size="20" /><span>Map</span></RouterLink>
      </template>
      <SearchField value="" :submit-button="!bottomNav" @search="onSearch" />
    </div>
    <div class="page-header__actions">
      <SquadHeaderButton :compact="bottomNav" />
      <RouterLink v-if="offerMerchantAccess" class="page-header__contribute" to="/me/merchant-access" data-testid="become-merchant">Become a merchant</RouterLink>
      <RouterLink v-else-if="isMerchant" class="page-header__contribute" to="/merchant" data-testid="header-merchant-dashboard">Merchant dashboard</RouterLink>
      <ProfileMenu v-if="session.data" class="page-header__profile" />
      <RouterLink v-else class="page-header__account" to="/login" aria-label="Log in"><ShellIcon name="user" :size="22" /></RouterLink>
    </div>
  </header>
</template>

<style scoped>
/* Matches the All Deals page header (ShellHeader's deals variant), minus the filter chips. */
.page-header {
  position: sticky;
  top: 0;
  z-index: 1100;
  display: grid;
  /* Side columns never shrink below their contents, so Room and the account can't spill over the search. */
  grid-template-columns: minmax(min-content, 1fr) minmax(240px, 560px) minmax(max-content, 1fr);
  gap: 24px;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  padding: 20px clamp(20px, 3vw, 56px);
  background: var(--paper-white);
  border-bottom: 1px solid var(--hairline);
}
.page-header__start { justify-self: start; display: flex; align-items: center; gap: 12px; }
.page-header__brand { display: flex; align-items: center; }
/* A fixed width: a percentage max-width collapses to nothing in a content-sized column. */
.page-header__brand img { display: block; flex: none; width: 160px; height: auto; }
.page-header__search { display: flex; align-items: center; gap: 10px; min-width: 0; }
.page-header__search :deep(.search-field) { flex: 1; min-width: 0; }
@media (min-width: 992px) { .page-header__search :deep(.search-field) { height: 48px; box-shadow: 0 2px 8px rgb(0 0 0 / 0.08); } }
.page-header__deals { display: inline-flex; flex: none; align-items: center; gap: 6px; box-sizing: border-box; height: 48px; padding: 0 18px 0 16px; font: 700 0.9375rem/1 var(--font-sans); color: var(--on-accent); text-decoration: none; white-space: nowrap; background: var(--sunny); border: 1px solid var(--sunny-deep); border-radius: var(--radius-pill); transition: transform var(--dur-press) var(--ease-out), background-color 150ms ease; }
.page-header__deals:hover { color: var(--on-accent); background: var(--sunny-deep); }
.page-header__deals:active { transform: scale(0.97); }
.page-header__deals:focus-visible { outline: 3px solid var(--sky); outline-offset: 2px; }
/* Narrow desktops: icon only, so the search keeps its width. */
@media (min-width: 992px) and (max-width: 1279.98px) {
  .page-header__deals { width: 48px; padding: 0; justify-content: center; }
  .page-header__deals span { display: none; }
}
.page-header__actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; min-width: 0; }
.page-header__contribute { color: var(--ink); font-size: var(--text-sm); font-weight: 650; text-decoration: none; white-space: nowrap; padding: 10px; border-radius: var(--radius-pill); }
.page-header__contribute:hover { background: var(--paper-hover); }
.page-header__account { display: grid; place-items: center; width: 44px; height: 44px; flex: none; border-radius: 50%; color: var(--ink); background: var(--paper-sunk); }
@media (max-width: 991.98px) {
  .page-header { grid-template-columns: auto minmax(0, 1fr); padding: calc(16px + env(safe-area-inset-top, 0px)) calc(16px + env(safe-area-inset-right, 0px)) 16px calc(16px + env(safe-area-inset-left, 0px)); gap: 8px; }
  .page-header__start,
  .page-header__contribute,
  .page-header__account,
  .page-header__profile { display: none; }
  .page-header__actions { grid-column: 1; grid-row: 1; }
  .page-header__search { grid-column: 2; grid-row: 1; }
}
/* Map pages (All Deals) run at a 90% rem base on desktop with a mouse (html.is-canvas in
   main.css); this page doesn't, so the header's rem-based text is scaled to match. */
@media (min-width: 992px) and (pointer: fine) {
  .page-header :deep(.search-field__input) { font-size: 0.9rem; }
  .page-header :deep(.squad-nav),
  .page-header__deals,
  .page-header__contribute { font-size: calc(0.9 * var(--text-sm)); }
  .page-header :deep(.profile-menu__avatar) { font-size: calc(0.9 * 0.875rem); }
}
@media (prefers-reduced-motion: reduce) {
  .page-header__deals { transition: none; }
}
</style>
