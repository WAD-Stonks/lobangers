<script setup lang="ts">
import FoodDealCard from '@web/modules/browse-map/FoodDealCard.vue'
import type { DealRow } from '@web/modules/browse-map/types'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

const props = defineProps<{ rows: readonly DealRow[]; to: (row: DealRow) => RouteLocationRaw; twoColumn?: boolean }>()
const emit = defineEmits<{ hover: [venueId: string | null] }>()

// Masonry: the grid runs on thin fixed rows and each card spans as many as its height needs, so
// every photo keeps its own shape while the DOM (and tab order) stays in the sorted order.
const ROW_UNIT_PX = 4
const grid = ref<HTMLElement | null>(null)
const spans = ref<Readonly<Record<string, number>>>({})
let observer: ResizeObserver | null = null

const rowGap = (el: HTMLElement) => Number.parseFloat(getComputedStyle(el).getPropertyValue('--masonry-row-gap')) || 0

const measure = (entries: readonly ResizeObserverEntry[]) => {
  const el = grid.value
  if (!el) return
  const gap = rowGap(el)
  const next = { ...spans.value }
  for (const entry of entries) {
    const key = (entry.target as HTMLElement).dataset.masonryKey
    const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height
    if (key && height > 0) next[key] = Math.ceil((height + gap) / ROW_UNIT_PX)
  }
  spans.value = next
}

const observeCards = () => {
  if (!observer || !grid.value) return
  observer.disconnect()
  for (const card of Array.from(grid.value.children)) observer.observe(card)
}

onMounted(() => {
  if (typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver(measure)
  observeCards()
})
watch(() => props.rows, observeCards, { flush: 'post' })
onBeforeUnmount(() => observer?.disconnect())

const cardStyle = (row: DealRow, index: number) => ({
  '--i': Math.min(index, 8),
  gridRowEnd: spans.value[row.key] ? `span ${spans.value[row.key]}` : undefined,
})
</script>

<template>
  <div
    ref="grid"
    class="food-deal-grid"
    :class="{ 'food-deal-grid--two': twoColumn }"
    :style="{ gridAutoRows: `${ROW_UNIT_PX}px` }"
    data-testid="food-deal-grid"
  >
    <FoodDealCard
      v-for="(row, index) in rows"
      :key="row.key"
      :style="cardStyle(row, index)"
      :data-masonry-key="row.key"
      :row="row"
      :to="to(row)"
      natural-ratio
      @hover="emit('hover', $event)"
    />
  </div>
</template>

<style scoped>
/* Vertical spacing lives inside each card's row span, so the grid's own row gap stays 0. */
.food-deal-grid {
  --masonry-row-gap: 24px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 210px), 1fr));
  align-items: start;
  column-gap: 20px;
}

/* Narrow panels (the venue page) fit three thin cards; two reads better there. */
.food-deal-grid--two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.food-deal-grid > * {
  /* Same staggered rise as the result rows; `backwards` leaves the hover lift alone. */
  animation: food-card-in 240ms var(--ease-out) backwards;
  animation-delay: calc(var(--i, 0) * 30ms);
}

@keyframes food-card-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}

@media (prefers-reduced-motion: reduce) {
  @keyframes food-card-in {
    from {
      opacity: 0;
    }
  }
}

@media (max-width: 599.98px) {
  .food-deal-grid {
    --masonry-row-gap: 16px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 12px;
  }
}

@media (max-width: 359.98px) {
  .food-deal-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
