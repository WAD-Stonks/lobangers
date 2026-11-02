<script setup lang="ts">
import FoodDealCard from '@web/modules/browse-map/FoodDealCard.vue'
import type { DealRow } from '@web/modules/browse-map/types'
import type { RouteLocationRaw } from 'vue-router'

defineProps<{ rows: readonly DealRow[]; to: (row: DealRow) => RouteLocationRaw; twoColumn?: boolean }>()
const emit = defineEmits<{ hover: [venueId: string | null] }>()
</script>

<template>
  <div class="food-deal-grid" :class="{ 'food-deal-grid--two': twoColumn }" data-testid="food-deal-grid">
    <FoodDealCard v-for="(row, index) in rows" :key="row.key" :style="{ '--i': Math.min(index, 8) }" :row="row" :to="to(row)" @hover="emit('hover', $event)" />
  </div>
</template>

<style scoped>
.food-deal-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 210px), 1fr));
  grid-auto-rows: 1fr;
  align-items: stretch;
  gap: 24px 20px;
}

/* Narrow panels (the venue page) fit three thin cards; two reads better there. */
.food-deal-grid--two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

/* Cards far off screen skip layout and paint until they scroll near; `auto` keeps each card's
   real height once it has been shown. Skipped cards stay focusable and findable in the page. */
.food-deal-grid > * {
  content-visibility: auto;
  contain-intrinsic-size: auto 360px;
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
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px 12px;
  }
}

@media (max-width: 359.98px) {
  .food-deal-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
