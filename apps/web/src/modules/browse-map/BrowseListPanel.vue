<script setup lang="ts">
import AppSelect from '@web/components/AppSelect.vue'
import AllDealsHero from '@web/modules/browse-map/AllDealsHero.vue'
import type { SortKey } from '@web/modules/browse-map/apply-filters'
import DealRowList from '@web/modules/browse-map/DealRowList.vue'
import FoodDealGrid from '@web/modules/browse-map/FoodDealGrid.vue'
import { activeFilterTokens } from '@web/modules/browse-map/filter-tokens'
import { createDefaultFilters } from '@web/modules/browse-map/filters'
import { resultsTitle } from '@web/modules/browse-map/results-title'
import type { DealRow } from '@web/modules/browse-map/types'
import PanelFrame from '@web/modules/map-shell/PanelFrame.vue'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { dealLocation } from '@web/modules/map-shell/shell-routes'
import { useShell } from '@web/modules/map-shell/shell-state'
import { useSavedDeals } from '@web/modules/map-shell/use-saved-deals'
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

// Results can be displayed as compact rows or photo cards in either map or full-width mode.
const shell = useShell()
const saved = useSavedDeals()
const route = useRoute()
const router = useRouter()

const SORT_OPTIONS: readonly { value: SortKey; label: string }[] = [
  { value: 'near', label: 'Nearest' },
  { value: 'ending', label: 'Ending soon' },
  { value: 'newest', label: 'Newest' },
]
const SKELETON_ROWS = 3

const count = computed(() => shell.dealCount.value)
const fullPage = computed(() => shell.view.value === 'list')
const cardMode = computed(() => fullPage.value || shell.cardMode.value)
const setResultView = (results: 'list' | 'cards') => {
  shell.setHovered(null)
  return router.replace({ query: { ...route.query, results } })
}
const located = computed(() => shell.position.value !== null)
const firstLoad = computed(() => shell.status.value === 'loading' && shell.deals.value.length === 0)
const title = computed(() => {
  if (firstLoad.value) return 'Finding deals'
  const noun = `${shell.savedOnly.value ? 'saved ' : ''}${count.value === 1 ? 'deal' : 'deals'}`
  if (shell.savedOnly.value) return `${count.value} ${noun}`
  if (fullPage.value) return `${count.value} ${noun} to explore`
  return resultsTitle({
    count: count.value,
    loading: false,
    inArea: shell.area.value !== null,
    walkFiltered: shell.filters.value.walkMinutes !== null && located.value,
  })
})
const tokens = computed(() => activeFilterTokens(shell.filters.value))
const hasNarrowing = computed(() => tokens.value.length > 0)
const showSkeleton = computed(() => shell.status.value === 'loading' && shell.deals.value.length === 0)
const isEmpty = computed(() => shell.status.value === 'ready' && shell.rows.value.length === 0)
const scrollKey = computed(() =>
  JSON.stringify([shell.sort.value, shell.view.value, cardMode.value, shell.filters.value, shell.area.value]),
)

const toDeal = (row: DealRow) => dealLocation({ ...route.query, ...(shell.savedOnly.value ? { collection: 'saved' } : {}) }, row.deal.id, row.venue.id)
const onSort = (value: string) => shell.setSort(value as SortKey)
const clearAll = () => {
  void shell.applyFilters({ ...createDefaultFilters() })
}

// Saved hides deals that have ended until the visitor asks for them; it is the same "Valid now"
// filter the filter sheet sets, so the choice lives in the URL (?now=0) like every other filter.
const showExpired = computed(() => !shell.filters.value.validNow)
const onShowExpired = (event: Event) => {
  const checked = (event.target as HTMLInputElement).checked
  void shell.applyFilters({ ...shell.filters.value, validNow: !checked }, 'replace')
}
// Bookmarks exist but none is live: point at the checkbox instead of saying nothing is saved.
const savedAllEnded = computed(() => shell.savedOnly.value && !showExpired.value && saved.count.value > 0)

const emptyCopy = computed(() => {
  if (hasNarrowing.value) return { title: 'No deals match all of these', body: 'Remove a filter or clear them all to see more.' }
  if (shell.area.value) return { title: 'No deals in this area', body: 'Move the map or zoom out to find more deals.' }
  if (savedAllEnded.value) return { title: 'None of your saved deals are live', body: 'Tick Show expired deals to see the ones that have ended.' }
  if (shell.savedOnly.value) return { title: 'No saved deals yet', body: 'Save deals using the bookmark button to see them here.' }
  return { title: 'No deals yet', body: 'Check back soon, or add one you know about.' }
})
</script>

<template>
  <PanelFrame class="browse-list" :title="title" :scroll-key="scrollKey" :class="{ 'browse-list--full-page': fullPage }">
    <template v-if="fullPage && !shell.savedOnly.value" #beforeHeading><AllDealsHero /></template>
    <template v-if="shell.view.value === 'list'" #heading>
      <div class="browse-list__heading-actions">
        <span v-if="fullPage" class="browse-list__sort-caption" aria-hidden="true">Sort by</span>
        <label class="browse-list__sort">
          <ShellIcon name="sort" :size="18" />
          <span class="visually-hidden">Sort deals</span>
          <AppSelect class="browse-list__select" :model-value="shell.sort.value" :options="SORT_OPTIONS" :chevron="false" data-testid="sort" @update:model-value="onSort" />
          <ShellIcon class="browse-list__chevron" name="chevronDown" :size="16" :stroke-width="2.4" />
        </label>
        <button v-if="fullPage && shell.savedOnly.value" type="button" class="lb-btn browse-list__map-button" data-testid="show-map" @click="shell.setView('map')">
          <ShellIcon name="map" :size="16" />Show map
        </button>
      </div>
    </template>

    <div v-if="!fullPage" class="browse-list__toolbar">
      <!-- biome-ignore lint/a11y/useSemanticElements: a fieldset would add form semantics and default styling to a plain button group -->
      <div class="browse-list__view-toggle" :class="{ 'is-card': cardMode }" role="group" aria-label="Results view">
        <button type="button" aria-label="List view" title="List view" :aria-pressed="!cardMode" data-testid="results-list" @click="setResultView('list')">
          <ShellIcon name="list" :size="18" />
        </button>
        <button type="button" aria-label="Card view" title="Card view" :aria-pressed="cardMode" data-testid="results-cards" @click="setResultView('cards')">
          <ShellIcon name="grid" :size="18" />
        </button>
      </div>
      <label v-if="!fullPage" class="browse-list__sort">
        <ShellIcon name="sort" :size="18" />
        <span class="visually-hidden">Sort deals</span>
        <AppSelect class="browse-list__select" :model-value="shell.sort.value" :options="SORT_OPTIONS" :chevron="false" data-testid="sort" @update:model-value="onSort" />
        <ShellIcon class="browse-list__chevron" name="chevronDown" :size="16" :stroke-width="2.4" />
      </label>
    </div>

    <label v-if="shell.savedOnly.value" class="browse-list__expired">
      <input type="checkbox" :checked="showExpired" data-testid="saved-show-expired" @change="onShowExpired" />
      Show expired deals
    </label>

    <p v-if="shell.locationMessage.value" class="browse-list__note" role="status" data-testid="location-status">
      {{ cardMode ? 'Enable location to find and sort deals near you.' : shell.locationMessage.value }}
      <button v-if="cardMode && !located" class="lb-btn" type="button" :disabled="shell.geoStatus.value === 'locating'" @click="shell.locate()">Use my location</button>
    </p>

    <div v-if="showSkeleton" aria-busy="true" data-testid="deals-loading">
      <span class="visually-hidden" role="status">Loading deals…</span>
      <div v-if="cardMode" class="browse-list__skeleton-cards" aria-hidden="true">
        <div v-for="index in 4" :key="index" class="browse-list__skeleton-card">
          <span class="lb-skeleton browse-list__skeleton-photo" />
          <span class="lb-skeleton browse-list__sk-title" />
          <span class="lb-skeleton browse-list__sk-meta" />
          <span class="lb-skeleton browse-list__sk-meta browse-list__sk-meta--short" />
        </div>
      </div>
      <div v-else>
        <div v-for="index in SKELETON_ROWS" :key="index" class="browse-list__skeleton">
          <span class="lb-skeleton browse-list__skeleton-dot" />
          <span class="browse-list__skeleton-lines">
            <span class="lb-skeleton browse-list__sk-title" />
            <span class="lb-skeleton browse-list__sk-meta" />
          </span>
          <span class="lb-skeleton browse-list__sk-price" />
        </div>
      </div>
    </div>

    <div v-else-if="shell.status.value === 'error'" class="lb-state" role="alert" data-testid="deals-status">
      <p class="lb-state__title">Deals didn't load</p>
      <p class="lb-state__body">Check your connection and try again.</p>
      <button type="button" class="lb-btn lb-btn--ink" @click="shell.reload">Try again</button>
    </div>

    <div v-else-if="isEmpty" class="lb-state" data-testid="deals-status">
      <p class="lb-state__title">{{ emptyCopy.title }}</p>
      <p class="lb-state__body">{{ emptyCopy.body }}</p>
      <button v-if="hasNarrowing" type="button" class="lb-btn lb-btn--ink" data-testid="clear-filters" @click="clearAll">
        Clear filters
      </button>
    </div>

    <template v-else>
      <FoodDealGrid v-if="cardMode" :rows="shell.rows.value" :to="toDeal" @hover="shell.setHovered" />
      <DealRowList
        v-else
        :rows="shell.rows.value"
        :to="toDeal"
        :hot-venue-id="shell.hoveredVenueId.value"
        @hover="shell.setHovered"
      />
    </template>

    <div class="browse-list__cta">
      <span>Know a deal that isn't here?</span>
      <RouterLink class="lb-btn lb-btn--primary" :to="{ name: 'submit-deal' }">Add a deal</RouterLink>
    </div>
  </PanelFrame>
</template>

<style scoped>
.browse-list :deep(.panel-frame__body) {
  padding-top: 8px;
  gap: 12px;
}

.browse-list--full-page :deep(.panel-frame__heading) {
  justify-content: space-between;
  padding-top: 16px;
  padding-bottom: 8px;
  gap: 16px 24px;
}

.browse-list--full-page .browse-list__heading-actions {
  margin-left: auto;
  gap: 12px;
}

.browse-list__sort-caption {
  color: var(--ink-muted);
  font-size: var(--text-sm);
}

.browse-list--full-page .browse-list__heading-actions .browse-list__sort {
  min-height: 38px;
  padding-left: 10px;
  box-sizing: border-box;
  width: auto;
  height: 38px;
}

.browse-list--full-page .browse-list__heading-actions .browse-list__select {
  min-height: 36px;
  padding: 0 26px 0 6px;
  width: auto;
}

.browse-list--full-page .browse-list__map-button {
  margin-left: auto;
}

.browse-list__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 12px;

}

.browse-list__view-toggle {
  position: relative;
  isolation: isolate;
  display: inline-flex;
  align-items: center;
  margin-right: auto;
  padding: 4px;
  border-radius: var(--radius-pill);
  background: var(--paper-sunk);
}

.browse-list__view-toggle::before {
  content: '';
  position: absolute;
  z-index: -1;
  top: 4px;
  left: 4px;
  width: var(--hit);
  height: var(--hit);
  border-radius: var(--radius-pill);
  background: var(--paper-white);
  box-shadow: 0 2px 5px rgb(27 27 31 / .1);
  transform: translateX(0);
  transition: transform 240ms cubic-bezier(.22, 1, .36, 1);
}

.browse-list__view-toggle.is-card::before {
  transform: translateX(var(--hit));
}

.browse-list__view-toggle button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--hit);
  height: var(--hit);
  box-sizing: border-box;
  padding: 6px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--ink-muted);
  font: 600 var(--text-sm)/1.2 var(--font-sans);
  cursor: pointer;
}

.browse-list__view-toggle button {
  transition: color 180ms ease, transform 180ms ease;
}

.browse-list__view-toggle button:hover {
  color: var(--ink);
}

.browse-list__view-toggle button:active {
  transform: scale(.92);
}

.browse-list__view-toggle button[aria-pressed='true'] {
  color: var(--ink);
}

.browse-list__view-toggle button:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .browse-list__view-toggle::before,
  .browse-list__view-toggle button { transition: none; }
  .browse-list__view-toggle button:active { transform: none; }
}

/* Outlined sort pill beside the segmented view toggle. */
/* biome-ignore lint/style/noDescendingSpecificity: the earlier, more specific rule is a modifier override for a different state of the same element */
.browse-list__sort {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  min-height: 38px;
  padding-left: 10px;
  color: var(--ink);
  background: var(--paper-white);
  border: 1px solid var(--hairline-strong);
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: background-color var(--dur-small) var(--ease-out);
}

/* biome-ignore lint/style/noDescendingSpecificity: the earlier, more specific rule is a modifier override for a different state of the same element */
.browse-list__heading-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

/* biome-ignore lint/style/noDescendingSpecificity: the earlier, more specific rule is a modifier override for a different state of the same element */
.browse-list__map-button {
  box-sizing: border-box;
  width: 132px;
  height: var(--hit);
  min-height: var(--hit);
  padding: 0 12px;
  font-size: var(--text-sm);
  color: var(--on-accent);
  background: var(--sunny);
  border-color: var(--sunny);
}

.browse-list__map-button:hover {
  color: var(--on-accent);
  background: var(--sunny-deep);
  border-color: var(--sunny-deep);
}

.browse-list__sort:hover {
  background: var(--paper-white);
}

.browse-list__sort:focus-within {
  box-shadow: 0 0 0 3px var(--coral-ring);
}

/* biome-ignore lint/style/noDescendingSpecificity: the earlier, more specific rule is a modifier override for a different state of the same element */
.browse-list__select {
  min-height: 36px;
  padding: 0 26px 0 6px;
  font: 500 var(--text-sm) / 1 var(--font-sans);
  color: var(--ink);
  background: transparent;
  border: 0;
  outline: none;
  appearance: none;
  cursor: pointer;
}

.browse-list__chevron {
  position: absolute;
  right: 8px;
  color: var(--ink-muted);
  pointer-events: none;
}

.browse-list__expired {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--ink);
  cursor: pointer;
}

.browse-list__expired input {
  width: 18px;
  height: 18px;
  margin: 0;
  accent-color: var(--ink);
  cursor: pointer;
}

.browse-list__note {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-xs);
  line-height: 1.5;
  color: var(--tag-new-ink);
  background: var(--paper-sunk);
  border-radius: var(--radius-control);
}

.browse-list__skeleton {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) 56px;
  gap: var(--space-3);
  align-items: center;
  padding: 12px 0;
}

.browse-list__skeleton-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 210px), 1fr));
  gap: 24px 20px;
}

.browse-list__skeleton-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 9px;
  padding: 10px;
  background: var(--paper-white);
  border: 1px solid var(--hairline);
  border-radius: 22px;
}

.browse-list__skeleton-photo {
  width: 100%;
  aspect-ratio: 4 / 5;
  border-radius: 14px;
}

.browse-list__sk-meta--short {
  width: 58%;
}

@media (min-width: 360px) and (max-width: 599.98px) {
  .browse-list__skeleton-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px 12px;
  }
}

.browse-list__skeleton-dot {
  width: 48px;
  height: 48px;
  border-radius: 50%;
}

.browse-list__skeleton-lines {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.browse-list__sk-title {
  width: 72%;
  height: 14px;
}

.browse-list__sk-meta {
  width: 48%;
  height: 12px;
}

.browse-list__sk-price {
  height: 20px;
}

.browse-list__cta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-top: var(--space-2);
  padding: 14px 16px;
  font-size: 0.875rem;
  font-weight: 600;
  background: var(--sunny-wash);
  border-radius: 18px;
}

/* Phones: the count and Sort share one row, and the toolbar sits close to the results, so the
   first deals show without scrolling. The pill's icon already says it sorts. */
@media (max-width: 599.98px) {
  .browse-list--full-page :deep(.panel-frame__heading) {
    flex-wrap: nowrap;
    padding-top: 8px;
    padding-bottom: 0;
    gap: 12px;
  }

  .browse-list__sort-caption {
    display: none;
  }

  .browse-list__toolbar {
    padding-bottom: 0;
  }
}
</style>
