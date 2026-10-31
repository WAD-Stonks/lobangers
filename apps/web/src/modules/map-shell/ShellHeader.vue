<script setup lang="ts">
import type { BrowseFilters } from '@web/modules/browse-map/filters'
import { updateFilters } from '@web/modules/browse-map/filters'
import BrandMenu from '@web/modules/map-shell/BrandMenu.vue'
import QuickChips from '@web/modules/map-shell/QuickChips.vue'
import SearchField from '@web/modules/map-shell/SearchField.vue'
import { ref } from 'vue'

// Floating header: menu button and search on the first row, quick chips underneath. On
// desktop it sits in the panel column; below 992px it spans the screen.
const props = withDefaults(
  defineProps<{ filters: BrowseFilters; sheetOpen: boolean; lobbieOpen?: boolean }>(),
  { lobbieOpen: false },
)
const emit = defineEmits<{
  apply: [filters: BrowseFilters, mode: 'push' | 'replace']
  openSheet: []
  askLobbie: []
}>()

const chips = ref<InstanceType<typeof QuickChips> | null>(null)

// The first search adds a history entry; refining it replaces that entry.
const onSearch = (q: string) =>
  emit('apply', updateFilters(props.filters, 'q', q), props.filters.q ? 'replace' : 'push')

defineExpose({ focusAllFilters: () => chips.value?.focusAllFilters() })
</script>

<template>
  <header class="shell-header" data-testid="shell-header">
    <BrandMenu />
    <SearchField :value="filters.q" @search="onSearch" />
    <QuickChips
      ref="chips"
      class="shell-header__chips"
      :filters="filters"
      :sheet-open="sheetOpen"
      :lobbie-open="lobbieOpen"
      @apply="(next) => emit('apply', next, 'push')"
      @open-sheet="emit('openSheet')"
      @ask-lobbie="emit('askLobbie')"
    />
  </header>
</template>

<style scoped>
.shell-header {
  position: absolute;
  top: var(--shell-gutter);
  left: var(--shell-gutter);
  z-index: 30;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  width: var(--header-w);
  pointer-events: none;
}

.shell-header > * {
  pointer-events: auto;
}

.shell-header__chips {
  grid-column: 1 / -1;
}
</style>
