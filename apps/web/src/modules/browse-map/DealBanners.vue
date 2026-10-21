<script setup lang="ts">
import { categoryTiles, toggleCategory, toggleEndingSoon } from '@web/modules/browse-map/banners'
import FoodSprite from '@web/modules/browse-map/FoodSprite.vue'
import { useShell } from '@web/modules/map-shell/shell-state'
import { computed } from 'vue'

// Coloured shortcut banners above the deal list (phone sheet and desktop panel alike): two hero
// tiles with a 3D food spilling off the edge, then a row of category tiles. Every tile toggles a
// filter the sheet already offers, so it shows as a token and survives in the URL.
const shell = useShell()

const filters = computed(() => shell.filters.value)
const endingCount = computed(() => shell.countFor({ ...filters.value, ending: 'week' }))
const endingOn = computed(() => filters.value.ending === 'week')
const located = computed(() => shell.position.value !== null)
const nearOn = computed(() => located.value && shell.sort.value === 'near')
const tiles = computed(() => categoryTiles(filters.value, shell.countFor))

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`
const endingText = computed(() =>
  endingCount.value === 0 ? 'Nothing ends this week' : `${plural(endingCount.value, 'deal')} end this week`,
)
const nearText = computed(() => (located.value ? 'Closest deals first' : 'Turn on location'))

const onEnding = () => void shell.applyFilters(toggleEndingSoon(filters.value))
const onNear = async () => {
  if (!located.value) await shell.locate()
  shell.setSort('near')
}
const onCategory = (code: Parameters<typeof toggleCategory>[1]) =>
  void shell.applyFilters(toggleCategory(filters.value, code))
</script>

<template>
  <section class="banners" aria-label="Shortcuts">
    <div class="banners__heroes">
      <button
        type="button"
        class="banner banner--near"
        :aria-pressed="nearOn"
        data-testid="banner-near"
        @click="onNear"
      >
        <span class="banner__title">Near you</span>
        <span class="banner__sub">{{ nearText }}</span>
        <span class="banner__go">GO<span class="banner__go-arrow" aria-hidden="true" /></span>
        <FoodSprite class="banner__food" kind="laksa" animated />
      </button>
      <button
        type="button"
        class="banner banner--ending"
        :aria-pressed="endingOn"
        data-testid="banner-ending"
        @click="onEnding"
      >
        <span class="banner__title">Ending soon</span>
        <span class="banner__sub">{{ endingText }}</span>
        <span class="banner__go">{{ endingOn ? 'ON' : 'GO' }}<span class="banner__go-arrow" aria-hidden="true" /></span>
        <FoodSprite class="banner__food" kind="softserve" animated />
      </button>
    </div>

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

.banners__heroes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

/* Hero tile: title and line of copy top left, a black GO pill bottom left, and the 3D food
   spilling past the right edge. */
.banner {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-height: 7.5rem;
  padding: 14px;
  font: inherit;
  color: var(--ink);
  text-align: left;
  border: 2px solid transparent;
  border-radius: 22px;
  cursor: pointer;
  transition:
    transform var(--dur-small) var(--ease-out),
    border-color var(--dur-small) ease;
}

.banner--near {
  background: var(--tint-drinks);
}

.banner--ending {
  background: var(--tint-dessert);
}

.banner[aria-pressed='true'] {
  border-color: var(--ink-strong);
}

.banner:active,
.tile:active {
  transform: scale(0.97);
}

.banner__title {
  position: relative;
  z-index: 1;
  font-family: var(--font-display);
  font-size: 1.25rem;
  line-height: 1.05;
}

.banner__sub {
  position: relative;
  z-index: 1;
  max-width: 62%;
  margin-top: 4px;
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 1.3;
  color: var(--ink-muted);
}

.banner__go {
  position: relative;
  z-index: 1;
  display: inline-flex;
  gap: 5px;
  align-items: center;
  height: 26px;
  margin-top: auto;
  padding: 0 12px;
  font-family: var(--font-display);
  font-size: 0.8125rem;
  color: var(--paper-white);
  background: var(--ink-strong);
  border-radius: var(--radius-pill);
}

.banner__go-arrow {
  width: 0;
  height: 0;
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
  border-left: 7px solid currentcolor;
}

.banner__food {
  position: absolute;
  right: -10px;
  bottom: 4px;
  width: 5.5rem;
  height: 5.5rem;
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
  .banner:hover,
  .tile:hover {
    transform: translateY(-2px);
  }
}

.banner:focus-visible,
.tile:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .banner,
  .tile {
    transition: none;
  }
}
</style>
