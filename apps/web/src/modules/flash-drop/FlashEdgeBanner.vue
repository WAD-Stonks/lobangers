<script setup lang="ts">
import { countdown, distanceText, formatCents } from '@web/modules/flash-drop/flash-format'
import type { EdgeBanner } from '@web/modules/flash-drop/use-flash-map'
import { computed } from 'vue'

// A Flash Drop whose circle is off screen: the black banner docks to the map's edge with an
// arrow pointing the way and how far it is. Tapping flies the map there and opens the deal.
const props = defineProps<{ banner: EdgeBanner; now: number; lifeMs: number }>()
const emit = defineEmits<{ open: []; hover: [paused: boolean] }>()

const HALF_WIDTH_PX = 150
const style = computed(() => {
  const width = typeof window === 'undefined' ? 1280 : window.innerWidth
  const x = Math.min(Math.max(props.banner.point.x, HALF_WIDTH_PX + 8), width - HALF_WIDTH_PX - 8)
  return { left: `${x}px`, top: `${props.banner.point.y}px`, '--flash-life': `${props.lifeMs}ms` }
})
const arrow = computed(() => ({ transform: `rotate(${props.banner.point.angle}deg)` }))
const drop = computed(() => props.banner.drop)
const label = computed(
  () =>
    `Flash drop off screen: ${formatCents(drop.value.flashPriceCents)} ${drop.value.dealTitle} at ${drop.value.venueName}, ends in ${countdown(drop.value.endsAt, props.now)}. Show it on the map.`,
)
</script>

<template>
  <button
    type="button"
    class="flash-edge"
    data-testid="flash-edge-banner"
    :style="style"
    :aria-label="label"
    @click="emit('open')"
    @mouseenter="emit('hover', true)"
    @mouseleave="emit('hover', false)"
    @focus="emit('hover', true)"
    @blur="emit('hover', false)"
  >
    <span class="flash-edge__arrow" :style="arrow" aria-hidden="true">
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
    </span>
    <span class="flash-edge__text">
      <span class="flash-edge__kicker">
        Flash drop<template v-if="banner.distanceMetres !== null"> · {{ distanceText(banner.distanceMetres) }} away</template>
        <span v-if="drop.demo" class="flash-fake">Fake deal</span>
      </span>
      <span class="flash-edge__title">{{ formatCents(drop.flashPriceCents) }} {{ drop.dealTitle }}</span>
    </span>
    <span class="flash-edge__timer">{{ countdown(drop.endsAt, now) }}</span>
    <span class="flash-edge__life" aria-hidden="true"><i /></span>
  </button>
</template>

<style scoped>
.flash-edge {
  position: absolute;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 10px;
  width: max-content;
  max-width: min(300px, calc(100vw - 32px));
  min-height: var(--hit);
  padding: 9px 12px 12px 9px;
  text-align: left;
  color: var(--paper-white);
  background: var(--ink-strong);
  border: 0;
  border-radius: 16px;
  box-shadow: 0 14px 30px rgba(27, 27, 31, 0.32);
  transform: translate(-50%, -50%);
  animation: flash-edge-in 320ms var(--ease-out) both;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.flash-edge:active {
  transform: translate(-50%, -50%) scale(0.97);
}

.flash-edge:focus-visible {
  outline: 3px solid var(--sunny);
  outline-offset: 3px;
}

.flash-edge__arrow {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  color: var(--ink);
  background: var(--sunny);
  border-radius: 50%;
}

.flash-edge__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.flash-edge__kicker {
  display: flex;
  white-space: nowrap;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #f3a58e;
}

.flash-edge__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 600;
}

.flash-edge__timer {
  flex: none;
  padding: 5px 8px;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  background: var(--coral);
  border-radius: 9px;
}

.flash-edge__life {
  position: absolute;
  right: 14px;
  bottom: 5px;
  left: 14px;
  height: 3px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.14);
  border-radius: 2px;
}

.flash-edge__life i {
  display: block;
  height: 100%;
  background: var(--coral);
  transform-origin: left;
  animation: flash-banner-life var(--flash-life) linear forwards;
}

.flash-edge:hover .flash-edge__life i,
.flash-edge:focus-visible .flash-edge__life i {
  animation-play-state: paused;
}

@keyframes flash-edge-in {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.85);
  }
}

@media (prefers-reduced-motion: reduce) {
  .flash-edge {
    animation-name: flash-edge-fade;
    animation-duration: 150ms;
  }

  .flash-edge:active {
    transform: translate(-50%, -50%);
  }
}

@keyframes flash-edge-fade {
  from {
    opacity: 0;
  }
}
</style>
