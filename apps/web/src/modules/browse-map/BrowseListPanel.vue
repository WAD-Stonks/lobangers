<script setup lang="ts">
import type { SortKey } from '@web/modules/browse-map/apply-filters'
import DealBanners from '@web/modules/browse-map/DealBanners.vue'
import DealCardGrid from '@web/modules/browse-map/DealCardGrid.vue'
import DealRowList from '@web/modules/browse-map/DealRowList.vue'
import { activeFilterTokens } from '@web/modules/browse-map/filter-tokens'
import { createDefaultFilters } from '@web/modules/browse-map/filters'
import { resultsTitle } from '@web/modules/browse-map/results-title'
import type { DealRow } from '@web/modules/browse-map/types'
import PanelFrame from '@web/modules/map-shell/PanelFrame.vue'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { dealLocation } from '@web/modules/map-shell/shell-routes'
import { useShell } from '@web/modules/map-shell/shell-state'
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

// The browse panel: result count, sort, removable filter tokens and the results as rows (map
// view) or cards (list view), with loading, error and empty states.
const shell = useShell()
const route = useRoute()

const SORT_OPTIONS: readonly { value: SortKey; label: string }[] = [
  { value: 'near', label: 'Nearest' },
  { value: 'ending', label: 'Ending soon' },
  { value: 'newest', label: 'Newest' },
]
const SKELETON_ROWS = 3

const count = computed(() => shell.dealCount.value)
const firstLoad = computed(() => shell.status.value === 'loading' && shell.deals.value.length === 0)
const title = computed(() =>
  resultsTitle({
    count: firstLoad.value ? 0 : count.value,
    loading: firstLoad.value,
    inArea: shell.area.value !== null,
    walkFiltered: shell.filters.value.walkMinutes !== null && shell.position.value !== null,
  }),
)
const tokens = computed(() => activeFilterTokens(shell.filters.value))
const hasNarrowing = computed(() => tokens.value.length > 0 || shell.area.value !== null)
const showSkeleton = computed(() => shell.status.value === 'loading' && shell.deals.value.length === 0)
const isEmpty = computed(() => shell.status.value === 'ready' && shell.rows.value.length === 0)
const scrollKey = computed(() =>
  JSON.stringify([shell.sort.value, shell.view.value, shell.filters.value, shell.area.value]),
)

const toDeal = (row: DealRow) => dealLocation(route.query, row.deal.id, row.venue.id)
const onSort = (event: Event) => shell.setSort((event.target as HTMLSelectElement).value as SortKey)
const clearAll = () => {
  shell.setArea(null)
  void shell.applyFilters({ ...createDefaultFilters() })
}
</script>

<template>
  <PanelFrame :title="title" :scroll-key="scrollKey">
    <template #heading>
      <label class="browse-list__sort">
        <span class="browse-list__sort-label">Sort</span>
        <select class="browse-list__select" :value="shell.sort.value" data-testid="sort" @change="onSort">
          <option v-for="option in SORT_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
        <ShellIcon class="browse-list__chevron" name="chevronDown" :size="16" :stroke-width="2.4" />
      </label>
    </template>

    <p v-if="shell.locationMessage.value" class="browse-list__note" role="status" data-testid="location-status">
      {{ shell.locationMessage.value }}
    </p>

    <DealBanners v-if="!showSkeleton && shell.status.value !== 'error'" />

    <fieldset v-if="hasNarrowing" class="browse-list__tokens">
      <legend class="visually-hidden">Active filters</legend>
      <button v-if="shell.area.value" type="button" class="browse-list__token" @click="shell.setArea(null)">
        In this area<ShellIcon name="close" :size="14" :stroke-width="2.4" />
        <span class="visually-hidden">(remove)</span>
      </button>
      <button
        v-for="token in tokens"
        :key="token.key"
        type="button"
        class="browse-list__token"
        :aria-label="`Remove filter ${token.label}`"
        @click="shell.applyFilters(token.next)"
      >
        <span class="lb-text-wrap">{{ token.label }}</span><ShellIcon name="close" :size="14" :stroke-width="2.4" />
      </button>
      <button type="button" class="browse-list__token browse-list__token--clear" @click="clearAll">Clear all</button>
    </fieldset>

    <div v-if="showSkeleton" aria-busy="true" data-testid="deals-loading">
      <span class="visually-hidden" role="status">Loading deals</span>
      <div v-for="index in SKELETON_ROWS" :key="index" class="browse-list__skeleton">
        <span class="lb-skeleton browse-list__skeleton-dot" />
        <span class="browse-list__skeleton-lines">
          <span class="lb-skeleton browse-list__sk-title" />
          <span class="lb-skeleton browse-list__sk-meta" />
        </span>
        <span class="lb-skeleton browse-list__sk-price" />
      </div>
    </div>

    <div v-else-if="shell.status.value === 'error'" class="lb-state" role="alert" data-testid="deals-status">
      <p class="lb-state__title">Deals didn't load</p>
      <p class="lb-state__body">Check your connection and try again.</p>
      <button type="button" class="lb-btn lb-btn--ink" @click="shell.reload">Try again</button>
    </div>

    <div v-else-if="isEmpty" class="lb-state" data-testid="deals-status">
      <p class="lb-state__title">{{ hasNarrowing ? 'No deals match all of these' : 'No deals yet' }}</p>
      <p class="lb-state__body">
        {{ hasNarrowing ? 'Remove a filter or clear them all to see more.' : 'Check back soon, or add one you know about.' }}
      </p>
      <button v-if="hasNarrowing" type="button" class="lb-btn lb-btn--ink" data-testid="clear-filters" @click="clearAll">
        Clear filters
      </button>
    </div>

    <template v-else>
      <DealCardGrid v-if="shell.view.value === 'list'" :rows="shell.rows.value" :to="toDeal" @hover="shell.setHovered" />
      <DealRowList
        v-else
        :rows="shell.rows.value"
        :to="toDeal"
        :hot-venue-id="shell.hoveredVenueId.value"
        test-id="nearby-list"
        @hover="shell.setHovered"
      />
    </template>

    <div class="browse-list__cta">
      <span>Know a deal that isn't here?</span>
      <RouterLink class="lb-btn lb-btn--primary" :to="{ name: 'add-deal' }">Add a deal</RouterLink>
    </div>
  </PanelFrame>
</template>

<style scoped>
/* One quiet pill: "Sort" label, the native select (chrome stripped) and our own chevron. */
.browse-list__sort {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  min-height: 36px;
  padding-left: 14px;
  background: var(--paper-sunk);
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: background-color var(--dur-small) var(--ease-out);
}

.browse-list__sort:hover {
  background: var(--paper-hover);
}

.browse-list__sort:focus-within {
  box-shadow: 0 0 0 3px var(--coral-ring);
}

.browse-list__sort-label {
  font: 500 var(--text-sm) / 1 var(--font-sans);
  color: var(--ink-muted);
}

.browse-list__select {
  min-height: 36px;
  padding: 0 34px 0 6px;
  font: 700 var(--text-sm) / 1 var(--font-sans);
  color: var(--ink);
  background: transparent;
  border: 0;
  outline: none;
  appearance: none;
  cursor: pointer;
}

.browse-list__chevron {
  position: absolute;
  right: 12px;
  color: var(--ink-muted);
  pointer-events: none;
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

.browse-list__tokens {
  display: flex;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.browse-list__token {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  min-height: var(--hit);
  padding: 0 10px 0 14px;
  font: 600 0.78rem/1.2 var(--font-sans);
  color: var(--ink);
  background: var(--paper);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-pill);
  cursor: pointer;
}

.browse-list__token:hover {
  background: var(--tag-end-bg);
}

.browse-list__token--clear {
  color: var(--coral-deep);
  background: transparent;
  border-color: transparent;
}

.browse-list__token:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
}

.browse-list__skeleton {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) 56px;
  gap: var(--space-3);
  align-items: center;
  padding: 12px 0;
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
</style>
