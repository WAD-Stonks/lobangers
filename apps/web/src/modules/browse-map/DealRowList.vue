<script setup lang="ts">
import { walkMinutesFor } from '@web/modules/browse-map/apply-filters'
import CategoryBubble from '@web/modules/browse-map/CategoryBubble.vue'
import { dealFreshness, formatMoreOutlets, priceText } from '@web/modules/browse-map/deal-format'
import { OFFER_TYPE_LABELS } from '@web/modules/browse-map/filters'
import type { DealRow } from '@web/modules/browse-map/types'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { RouterLink } from 'vue-router'

// Price-first deal rows. Each row links to its deal; hovering or focusing a row lights up its
// pin on the map (and the shell lights the row when its pin is hovered).
const props = withDefaults(
  defineProps<{
    rows: readonly DealRow[]
    to: (row: DealRow) => RouteLocationRaw
    hotVenueId?: string | null
    currentKey?: string | null
    testId?: string
  }>(),
  { hotVenueId: null, currentKey: null, testId: 'deal-rows' },
)
const emit = defineEmits<{ hover: [venueId: string | null] }>()
const pointedKey = ref<string | null>(null)
const point = (row: DealRow | null) => {
  pointedKey.value = row?.key ?? null
  emit('hover', row?.venue.id ?? null)
}
const isHot = (row: DealRow) => {
  const pointed = props.rows.find((candidate) => candidate.key === pointedKey.value)
  if (pointed && pointed.venue.id === props.hotVenueId) return row.key === pointed.key
  return row.venue.id === props.hotVenueId
}
</script>

<template>
  <ol class="deal-rows" :data-testid="testId">
    <li v-for="(row, index) in rows" :key="row.key" :style="{ '--i': Math.min(index, 8) }">
      <RouterLink
        :to="to(row)"
        class="deal-rows__row"
        :class="{ 'is-hot': isHot(row), 'is-current': row.key === currentKey }"
        :aria-current="row.key === currentKey ? 'true' : undefined"
        @mouseenter="point(row)"
        @mouseleave="point(null)"
        @focus="point(row)"
        @blur="point(null)"
      >
        <CategoryBubble
          :category="row.deal.category"
          :title="row.deal.title"
          :venue="row.venue.name"
          size="md"
        />
        <span class="deal-rows__text">
          <strong class="deal-rows__title" :title="row.deal.title">{{ row.deal.title }}</strong>
          <span class="deal-rows__where">
            <span class="deal-rows__venue">{{ row.venue.name }}</span>
            <span v-if="row.distanceMetres !== null" class="deal-rows__walk">
              <ShellIcon name="walk" :size="14" />{{ walkMinutesFor(row.distanceMetres) }} min
            </span>
            <span v-if="formatMoreOutlets(row.outletCount)" class="deal-rows__outlets" data-testid="more-outlets">
              {{ formatMoreOutlets(row.outletCount) }}
            </span>
          </span>
          <span class="deal-rows__tags">
            <span class="lb-tag" :class="`lb-tag--${dealFreshness(row.deal).tone}`">{{ dealFreshness(row.deal).label }}</span>
            <span class="lb-tag lb-tag--new">{{ OFFER_TYPE_LABELS[row.deal.offerType] }}</span>
          </span>
        </span>
        <span v-if="priceText(row.deal)" class="lb-price deal-rows__price">{{ priceText(row.deal) }}</span>
      </RouterLink>
    </li>
  </ol>
</template>

<style scoped>
.deal-rows {
  display: flex;
  flex-direction: column;
  margin: 0 -8px;
  padding: 0;
  list-style: none;
}

.deal-rows__row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--space-3);
  align-items: center;
  padding: 12px 8px;
  color: var(--ink);
  text-decoration: none;
  border-radius: 16px;
  transition:
    transform var(--dur-press) var(--ease-out),
    background-color 150ms ease;
}

.deal-rows__row:active {
  transform: scale(0.98);
}

.deal-rows__row.is-hot,
.deal-rows__row.is-current {
  background: var(--sunny-wash);
}

@media (hover: hover) and (pointer: fine) {
  .deal-rows__row:hover {
    color: var(--ink);
    background: var(--paper-hover);
  }

  .deal-rows__row.is-hot:hover {
    background: var(--sunny-wash);
  }
}

.deal-rows__row:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: -2px;
}

.deal-rows__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

/* Two lines at most; the full title is in the tooltip and on the deal panel. */
.deal-rows__title {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  font-size: 0.9375rem;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.deal-rows__where {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  align-items: center;
  font-size: var(--text-xs);
  color: var(--ink-muted);
}

.deal-rows__venue {
  min-width: 0;
  overflow-wrap: anywhere;
}

.deal-rows__walk {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.deal-rows__outlets {
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
}

.deal-rows__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* Never truncated: a long label wraps, capped at two fifths of the row. */
.deal-rows__price {
  max-width: 9rem;
  font-size: 1.375rem;
  text-align: right;
  white-space: normal;
  overflow-wrap: anywhere;
}

@media (prefers-reduced-motion: reduce) {
  .deal-rows__row:active {
    transform: none;
  }
}
</style>
