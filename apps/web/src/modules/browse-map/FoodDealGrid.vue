<script setup lang="ts">
import FoodDealCard from '@web/modules/browse-map/FoodDealCard.vue'
import type { DealRow } from '@web/modules/browse-map/types'
import type { RouteLocationRaw } from 'vue-router'

defineProps<{ rows: readonly DealRow[]; to: (row: DealRow) => RouteLocationRaw }>()
const emit = defineEmits<{ hover: [venueId: string | null] }>()
</script>

<template>
  <div class="food-deal-grid" data-testid="food-deal-grid">
    <FoodDealCard v-for="row in rows" :key="row.key" :row="row" :to="to(row)" @hover="emit('hover', $event)" />
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
