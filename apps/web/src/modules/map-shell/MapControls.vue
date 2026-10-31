<script setup lang="ts">
import type { ShellView } from '@web/modules/map-shell/filter-query'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'

// Vertical stack on the right of the map: list/map toggle, Near me, then zoom. Phones skip
// zoom because pinch covers it.
withDefaults(defineProps<{ view: ShellView; locating?: boolean; showZoom?: boolean; showToggle?: boolean }>(), {
  locating: false,
  showZoom: true,
  showToggle: true,
})
const emit = defineEmits<{ toggleView: []; nearMe: []; zoomIn: []; zoomOut: [] }>()
</script>

<template>
  <div class="map-controls" data-testid="map-controls">
    <button
      v-if="showToggle"
      type="button"
      class="lb-ctrl lb-ctrl--ink map-controls__toggle"
      data-testid="panel-toggle"
      :aria-label="view === 'list' ? 'Show map' : 'Show list'"
      :title="view === 'list' ? 'Show map' : 'Show list'"
      @click="emit('toggleView')"
    >
      <span class="map-controls__swap" :class="{ 'is-map': view === 'list' }" aria-hidden="true">
        <ShellIcon name="list" class="map-controls__icon-list" />
        <ShellIcon name="map" class="map-controls__icon-map" />
      </span>
    </button>
    <button
      type="button"
      class="lb-ctrl map-controls__locate"
      data-testid="near-me"
      :aria-label="locating ? 'Finding your location' : 'Near me'"
      title="Near me"
      :disabled="locating"
      :aria-busy="locating"
      @click="emit('nearMe')"
    >
      <ShellIcon name="locate" />
    </button>
    <template v-if="showZoom">
      <button type="button" class="lb-ctrl" aria-label="Zoom in" title="Zoom in" data-testid="zoom-in" @click="emit('zoomIn')">
        <ShellIcon name="plus" :size="18" />
      </button>
      <button type="button" class="lb-ctrl" aria-label="Zoom out" title="Zoom out" @click="emit('zoomOut')">
        <ShellIcon name="minus" :size="18" />
      </button>
    </template>
  </div>
</template>

<style scoped>
.map-controls {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.map-controls__toggle {
  margin-bottom: var(--space-1);
}

.map-controls__locate {
  color: var(--sky);
}

/* The list and map icons crossfade with a slight scale and blur. */
.map-controls__swap {
  position: relative;
  display: inline-block;
  width: 20px;
  height: 20px;
}

.map-controls__swap :deep(svg) {
  position: absolute;
  inset: 0;
  transition:
    opacity 200ms ease,
    transform 200ms var(--ease-out),
    filter 200ms ease;
}

.map-controls__icon-map,
.map-controls__swap.is-map .map-controls__icon-list {
  opacity: 0;
  filter: blur(2px);
  transform: scale(0.5);
}

.map-controls__swap.is-map .map-controls__icon-map {
  opacity: 1;
  filter: none;
  transform: none;
}

@media (prefers-reduced-motion: reduce) {
  .map-controls__icon-map,
  .map-controls__swap.is-map .map-controls__icon-list {
    filter: none;
    transform: none;
  }
}
</style>
