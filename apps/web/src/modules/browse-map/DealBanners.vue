<script setup lang="ts">
import { categoryTiles, toggleCategory } from '@web/modules/browse-map/banners'
import FoodSprite from '@web/modules/browse-map/FoodSprite.vue'
import { useShell } from '@web/modules/map-shell/shell-state'
import { computed } from 'vue'

// Category shortcuts use the same filters as the filter sheet.
const shell = useShell()

const filters = computed(() => shell.filters.value)
const tiles = computed(() => categoryTiles(filters.value, shell.countFor))

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`
const onCategory = (code: Parameters<typeof toggleCategory>[1]) =>
  void shell.applyFilters(toggleCategory(filters.value, code))
</script>

<template>
  <section v-if="tiles.length > 1" class="banners" aria-label="Shortcuts">
    <div v-if="tiles.length > 1" class="banners__tiles">
      <button
        v-for="tile in tiles"
        :key="tile.code"
        type="button"
        class="tile"
        :style="{ '--tile-tint': tile.tint }"
        :aria-pressed="tile.active"
        data-testid="banner-category"
        @click="onCategory(tile.code)"
      >
        <span class="tile__name">{{ tile.label }}</span>
        <span class="tile__count">{{ plural(tile.count, 'deal') }}</span>
        <FoodSprite class="tile__food" :kind="tile.kind" />
      </button>
    </div>
  </section>
</template>

<style scoped>
.banners {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.tile:active {
  transform: scale(0.97);
}

.banners__tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
  gap: var(--space-2);
}

/* Category tile: name and count top left, a small 3D food in the corner. */
.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-height: 4.25rem;
  /* Right padding keeps the name and count clear of the food in the corner. */
  padding: 10px 2.75rem 10px 12px;
  font: inherit;
  color: var(--ink);
  text-align: left;
  background: var(--paper-sunk);
  border: 2px solid transparent;
  border-radius: 18px;
  cursor: pointer;
  transition:
    transform var(--dur-small) var(--ease-out),
    background-color var(--dur-small) ease;
}

.tile[aria-pressed='true'] {
  background: var(--tile-tint);
  border-color: var(--ink-strong);
}

.tile__name {
  font-size: var(--text-sm);
  font-weight: 800;
}

.tile__count {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--ink-muted);
}

.tile__food {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 2.75rem;
  height: 2.75rem;
}

@media (hover: hover) and (pointer: fine) {
  .tile:hover {
    transform: translateY(-2px);
  }
}

.tile:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .tile {
    transition: none;
  }
}
</style>
