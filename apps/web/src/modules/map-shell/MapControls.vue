<script setup lang="ts">
import NearbyToggle from '@web/modules/hungry-nearby/NearbyToggle.vue'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'

withDefaults(defineProps<{ locating?: boolean; showZoom?: boolean }>(), {
  locating: false,
  showZoom: true,
})
const emit = defineEmits<{ nearMe: []; zoomIn: []; zoomOut: [] }>()
</script>

<template>
  <div class="map-controls" data-testid="map-controls">
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
    <NearbyToggle />
    <div v-if="showZoom" class="map-controls__zoom">
      <button type="button" class="lb-ctrl" aria-label="Zoom in" title="Zoom in" data-testid="zoom-in" @click="emit('zoomIn')">
        <ShellIcon name="plus" :size="18" />
      </button>
      <button type="button" class="lb-ctrl" aria-label="Zoom out" title="Zoom out" @click="emit('zoomOut')">
        <ShellIcon name="minus" :size="18" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.map-controls {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-right: env(safe-area-inset-right, 0px);
}

.map-controls__zoom {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

@media (pointer: coarse) and (max-height: 520px) {
  .map-controls {
    flex-direction: row;
    align-items: flex-end;
  }
}

.map-controls__locate {
  color: var(--sky);
}

</style>
