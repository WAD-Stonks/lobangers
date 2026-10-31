<script setup lang="ts">
import {
  type BrowseFilters,
  countSheetFilters,
  QUICK_PRICE_MINOR,
  updateFilters,
} from '@web/modules/browse-map/filters'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{ filters: BrowseFilters; sheetOpen?: boolean; lobbieOpen?: boolean }>(),
  { sheetOpen: false, lobbieOpen: false },
)
const emit = defineEmits<{ apply: [filters: BrowseFilters]; openSheet: []; askLobbie: [] }>()

const allButton = ref<HTMLButtonElement | null>(null)

const underFive = computed(() => props.filters.priceMaxMinor === QUICK_PRICE_MINOR)
const endingToday = computed(() => props.filters.ending === 'today')
const sheetCount = computed(() => countSheetFilters(props.filters))

const toggleUnderFive = () =>
  emit('apply', updateFilters(props.filters, 'priceMaxMinor', underFive.value ? null : QUICK_PRICE_MINOR))
const toggleEndingToday = () =>
  emit('apply', updateFilters(props.filters, 'ending', endingToday.value ? 'any' : 'today'))

defineExpose({ focusAllFilters: () => allButton.value?.focus() })
</script>

<template>
  <fieldset class="quick-chips" data-testid="quick-chips">
    <legend class="visually-hidden">Quick filters</legend>
    <button type="button" class="lb-chip" :aria-pressed="underFive" @click="toggleUnderFive">
      <span class="lb-chip__check"><ShellIcon name="check" :size="14" :stroke-width="3" /></span>Under $5
    </button>
    <button
      type="button"
      class="lb-chip quick-chips__optional"
      :aria-pressed="endingToday"
      @click="toggleEndingToday"
    >
      <span class="lb-chip__check"><ShellIcon name="check" :size="14" :stroke-width="3" /></span>Ending today
    </button>
    <button
      ref="allButton"
      type="button"
      class="lb-chip"
      :class="{ 'is-on': sheetCount > 0 }"
      aria-haspopup="dialog"
      :aria-expanded="sheetOpen"
      aria-controls="filter-sheet"
      data-testid="all-filters"
      @click="emit('openSheet')"
    >
      <ShellIcon name="filters" :size="16" />All filters
      <span v-if="sheetCount > 0" class="lb-badge" data-testid="filter-badge">
        {{ sheetCount }}<span class="visually-hidden"> active</span>
      </span>
    </button>
    <button
      type="button"
      class="lb-chip quick-chips__lobbie"
      :class="{ 'is-on': lobbieOpen }"
      :aria-expanded="lobbieOpen"
      aria-controls="shell-panel"
      data-testid="ask-lobbie"
      @click="emit('askLobbie')"
    >
      <ShellIcon
        class="quick-chips__lobbie-icon"
        :name="lobbieOpen ? 'close' : 'diamond'"
        :size="16"
        :stroke-width="lobbieOpen ? 2.4 : 2"
      />Ask Lobbie for Lobangs
    </button>
  </fieldset>
</template>

<style scoped>
.quick-chips {
  display: flex;
  margin: 0;
  padding: 0;
  border: 0;
  flex-wrap: wrap;
  gap: var(--space-2);
  min-width: 0;
}

.quick-chips :deep(.lb-chip) {
  box-shadow: var(--shadow-pill);
}

.quick-chips__lobbie:not(.is-on) .quick-chips__lobbie-icon {
  color: var(--coral);
  fill: var(--coral);
}

@media (max-width: 767.98px) {
  .quick-chips__optional {
    display: none;
  }
}
</style>
