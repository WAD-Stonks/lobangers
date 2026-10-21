<script setup lang="ts">
import DealCard from '@web/modules/browse-map/DealCard.vue'
import { COLUMN_GAP_PX, columnsFor, dealColumns } from '@web/modules/browse-map/deal-columns'
import type { DealRow } from '@web/modules/browse-map/types'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

// List mode ("Show list"): the panel widens into a masonry of ticket-style cards, each as tall
// as its photo. The column count follows the panel's width.
const props = defineProps<{ rows: readonly DealRow[]; to: (row: DealRow) => RouteLocationRaw }>()
const emit = defineEmits<{ hover: [venueId: string | null] }>()

const grid = ref<HTMLElement | null>(null)
const count = ref(1)
let observer: ResizeObserver | undefined

const columns = computed(() => dealColumns(props.rows, count.value))

onMounted(() => {
  const el = grid.value
  if (!el) return
  count.value = columnsFor(el.clientWidth)
  if (typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver(([entry]) => {
    if (entry) count.value = columnsFor(entry.contentRect.width)
  })
  observer.observe(el)
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div ref="grid" class="deal-cards" :style="{ '--column-gap': `${COLUMN_GAP_PX}px` }" data-testid="deal-cards">
    <ul v-for="(column, index) in columns" :key="index" class="deal-cards__column">
      <li v-for="row in column" :key="row.key">
        <DealCard :row="row" :to="props.to(row)" @hover="emit('hover', $event)" />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.deal-cards {
  display: flex;
  align-items: flex-start;
  gap: var(--column-gap);
}

.deal-cards__column {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: var(--column-gap);
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
