<script setup lang="ts">
import { walkMinutesFor } from '@web/modules/browse-map/apply-filters'
import { categoryStyle } from '@web/modules/browse-map/category-style'
import { dealFreshness, formatEnding, priceText } from '@web/modules/browse-map/deal-format'
import type { DealRow } from '@web/modules/browse-map/types'
import type { RouteLocationRaw } from 'vue-router'
import { RouterLink } from 'vue-router'

// List mode ("Show list"): the panel widens into a grid of ticket-style cards.
defineProps<{ rows: readonly DealRow[]; to: (row: DealRow) => RouteLocationRaw }>()
const emit = defineEmits<{ hover: [venueId: string | null] }>()
</script>

<template>
  <ul class="deal-cards" data-testid="deal-cards">
    <li v-for="row in rows" :key="row.key">
      <RouterLink
        :to="to(row)"
        class="deal-cards__card"
        @mouseenter="emit('hover', row.venue.id)"
        @mouseleave="emit('hover', null)"
      >
        <span class="deal-cards__top" :style="{ '--card-tint': categoryStyle(row.deal.category).tint }">
          <span class="lb-tag lb-tag--paper">{{ dealFreshness(row.deal).label }}</span>
          <span v-if="priceText(row.deal)" class="deal-cards__price">{{ priceText(row.deal) }}</span>
        </span>
        <span class="deal-cards__body">
          <strong class="deal-cards__title">{{ row.deal.title }}</strong>
          <span class="lb-meta lb-text-wrap">{{ row.venue.name }}</span>
        </span>
        <span class="deal-cards__perf" aria-hidden="true" />
        <span class="deal-cards__foot lb-meta">
          <span>{{ row.distanceMetres === null ? '' : `${walkMinutesFor(row.distanceMetres)} min walk` }}</span>
          <span>{{ formatEnding(row.deal.validUntil) }}</span>
        </span>
      </RouterLink>
    </li>
  </ul>
</template>

<style scoped>
.deal-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 14rem), 1fr));
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.deal-cards__card {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  color: var(--ink);
  text-decoration: none;
  background: var(--paper-white);
  border: 1px solid var(--hairline);
  border-radius: 22px;
  transition: border-color 150ms ease;
}

.deal-cards__card:hover {
  color: var(--ink);
  border-color: var(--hairline-strong);
}

.deal-cards__card:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
}

.deal-cards__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
  min-height: 96px;
  padding: 12px;
  background: var(--card-tint);
}

.deal-cards__price {
  max-width: 60%;
  padding: 2px 9px;
  font: 600 0.9375rem/1.3 var(--font-display);
  color: var(--paper-white);
  text-align: right;
  overflow-wrap: anywhere;
  background: var(--ink-strong);
  border-radius: 999px;
}

.deal-cards__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 3px;
  padding: 12px 14px 10px;
}

.deal-cards__title {
  font-size: 0.9375rem;
  overflow-wrap: anywhere;
}

.deal-cards__perf {
  margin: 0 12px;
  border-top: 2px dashed var(--hairline);
}

.deal-cards__foot {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  padding: 10px 14px 14px;
}
</style>
