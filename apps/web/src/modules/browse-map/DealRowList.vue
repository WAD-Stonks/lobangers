<script setup lang="ts">
import CategoryBubble from '@web/modules/browse-map/CategoryBubble.vue'
import { formatDistance } from '@web/modules/browse-map/distance'
import type { DealRow } from '@web/modules/browse-map/types'

// Rows of deals: category bubble, title, outlet and distance, with the price on the right.
// Used for the main list, an outlet's deals and "more at this outlet" under a deal.
withDefaults(
  defineProps<{
    rows: readonly DealRow[]
    currentKey?: string | null
    testId?: string
  }>(),
  { currentKey: null, testId: 'deal-rows' },
)
const emit = defineEmits<{ select: [dealId: string, venueId: string] }>()

const metaText = (row: DealRow) =>
  row.distanceMetres === null
    ? row.venue.name
    : `${row.venue.name} · ${formatDistance(row.distanceMetres)} away`

// The API falls back to the title when a deal has no price or offer wording, so a label that
// merely repeats the title is left out rather than shown twice.
const priceText = (row: DealRow): string | null => {
  const label = row.deal.label.trim()
  return label && label !== row.deal.title.trim() ? label : null
}
</script>

<template>
  <ol class="deal-rows" :data-testid="testId">
    <li
      v-for="row in rows"
      :key="row.key"
      class="deal-rows__item"
      :class="{ 'is-current': row.key === currentKey }"
      :aria-current="row.key === currentKey ? 'true' : undefined"
    >
      <button type="button" class="deal-rows__button" @click="emit('select', row.deal.id, row.venue.id)">
        <CategoryBubble :category="row.deal.category" size="md" />
        <span class="deal-rows__text">
          <span class="deal-rows__title">{{ row.deal.title }}</span>
          <span class="deal-rows__meta">{{ metaText(row) }}</span>
        </span>
        <span v-if="priceText(row)" class="deal-rows__price">{{ priceText(row) }}</span>
      </button>
    </li>
  </ol>
</template>

<style scoped>
.deal-rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.deal-rows__button {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  font: inherit;
  text-align: left;
  color: var(--ink);
  background: transparent;
  border: 0;
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: background-color 160ms ease;
}

.deal-rows__button:hover,
.deal-rows__button:focus-visible,
.is-current .deal-rows__button {
  background: var(--paper);
}

.deal-rows__text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

/* Two lines at most in the list; the detail view shows the full title. */
.deal-rows__title {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: 600;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.deal-rows__meta {
  font-size: var(--text-xs);
  line-height: 1.4;
  color: var(--ink-muted);
}

/* Keeps its full width (the title wraps instead) up to a third of the row, so a long label
   cannot crush the title column but a short price is never squeezed down to an ellipsis. */
.deal-rows__price {
  flex: 0 0 auto;
  max-width: 33%;
  overflow: hidden;
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: 700;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
