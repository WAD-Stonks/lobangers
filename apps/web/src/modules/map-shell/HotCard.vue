<script setup lang="ts">
import { categoryStyle } from '@web/modules/browse-map/category-style'
import { formatEnding, priceText } from '@web/modules/browse-map/deal-format'
import FoodSprite from '@web/modules/browse-map/FoodSprite.vue'
import { foodKindFor } from '@web/modules/browse-map/food-kind'
import type { SelectedDeal } from '@web/modules/browse-map/types'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { useHotRotation } from '@web/modules/map-shell/use-hot-rotation'
import { computed, toRef } from 'vue'

// Rotating hero at the bottom left. There is no view count yet, so it shows the soonest-ending
// verified deals and says "Ending soon" rather than claiming popularity (open question 2).
// Each slide is tinted by its category, with the deal's 3D food standing out of the top edge.
const props = withDefaults(defineProps<{ deals: readonly SelectedDeal[]; reducedMotion?: boolean }>(), {
  reducedMotion: false,
})
const emit = defineEmits<{ open: [deal: SelectedDeal] }>()

const count = computed(() => props.deals.length)
const rotation = useHotRotation(count, { reducedMotion: toRef(props, 'reducedMotion') })
const current = computed(() => props.deals[rotation.index.value] ?? props.deals[0] ?? null)
const price = computed(() => (current.value ? priceText(current.value.deal) : null))
const position = computed(() => `${rotation.index.value + 1} of ${count.value}`)
const pauseLabel = computed(() => (rotation.paused.value ? 'Play ending-soon deals' : 'Pause ending-soon deals'))
const tint = computed(() => (current.value ? categoryStyle(current.value.deal.category).tint : 'transparent'))
const food = computed(() =>
  current.value
    ? foodKindFor({
        category: current.value.deal.category,
        title: current.value.deal.title,
        venueNames: [current.value.venue.name],
      })
    : null,
)

const onFocusOut = (event: FocusEvent) => {
  const card = event.currentTarget as HTMLElement
  if (!card.contains(event.relatedTarget as Node | null)) rotation.setFocus(false)
}

const open = () => {
  if (current.value) emit('open', current.value)
}
</script>

<template>
  <section
    v-if="current"
    class="hot-hero"
    :style="{ '--hero-tint': tint }"
    aria-roledescription="carousel"
    aria-label="Ending soon"
    data-testid="hot-card"
    @mouseenter="rotation.setHover(true)"
    @mouseleave="rotation.setHover(false)"
    @focusin="rotation.setFocus(true)"
    @focusout="onFocusOut"
  >
    <div class="hot-hero__backdrop" aria-hidden="true">
      <span class="hot-hero__glow" />
      <span
        v-if="!reducedMotion && count > 1"
        :key="`bar-${rotation.index.value}-${rotation.running.value}`"
        class="hot-hero__bar"
        :class="{ 'is-paused': !rotation.running.value }"
      />
    </div>

    <h2 class="hot-hero__eyebrow">
      <svg class="hot-hero__flame" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.5c1.2 3.2 4.8 5 4.8 9.6a4.8 4.8 0 0 1-9.6 0c0-1.9.8-3.3 1.9-4.3.2 1.9 1.1 2.9 2.2 3.1C10.6 7.8 10.2 5 12 2.5z" />
      </svg>
      Ending soon
    </h2>

    <!-- Keyed so each slide remounts it and replays the rise-in. A sibling of the body, not a
         child: the body's swap transition sets transform and filter, which would re-anchor it. -->
    <span v-if="food" :key="`food-${current.deal.id}`" class="hot-hero__food" aria-hidden="true" @click="open">
      <FoodSprite class="hot-hero__sprite" :kind="food" :animated="!reducedMotion" large />
    </span>

    <Transition name="hot-swap" mode="out-in">
      <button
        :key="current.deal.id"
        type="button"
        class="hot-hero__body"
        :aria-live="rotation.running.value ? 'off' : 'polite'"
        data-testid="hot-open"
        @click="open"
      >
        <strong class="hot-hero__deal">{{ current.deal.title }}</strong>
        <span class="hot-hero__venue">{{ current.venue.name }}</span>
        <span class="hot-hero__chips">
          <span class="hot-hero__chip hot-hero__chip--ends">{{ formatEnding(current.deal.validUntil, new Date(), current.deal.limitedTime) }}</span>
          <span v-if="price" class="hot-hero__chip lb-price">{{ price }}</span>
        </span>
      </button>
    </Transition>

    <div class="hot-hero__foot">
      <div v-if="count > 1" class="hot-hero__dots">
        <button
          v-for="(item, index) in deals"
          :key="item.deal.id"
          type="button"
          class="hot-hero__dot"
          :aria-label="`Show ${item.deal.title}`"
          :aria-current="index === rotation.index.value ? 'true' : undefined"
          @click="rotation.pick(index)"
        >
          <span :class="{ 'is-on': index === rotation.index.value }" />
        </button>
      </div>
      <span class="hot-hero__pos" data-testid="hot-position">{{ position }}</span>
      <button
        v-if="!reducedMotion && count > 1"
        type="button"
        class="hot-hero__pause"
        :aria-label="pauseLabel"
        :title="pauseLabel"
        data-testid="hot-pause"
        @click="rotation.toggle"
      >
        <span class="hot-hero__pause-ring" aria-hidden="true">
          <ShellIcon :name="rotation.paused.value ? 'play' : 'pause'" :size="14" :stroke-width="2.4" />
        </span>
      </button>
    </div>
  </section>
</template>

<style scoped>
/* The food overflows the top edge, so the section itself never clips; the backdrop carries the
   colour, glow and progress bar inside the rounded shape. */
.hot-hero {
  --food-size: 10.5rem;
  --food-lift: 3.75rem;
  --text-room: 8rem;

  position: relative;
  isolation: isolate;
  width: 22rem;
  max-width: calc(100vw - 2 * var(--shell-gutter));
  margin-top: var(--food-lift);
  padding: var(--space-4) var(--space-4) var(--space-1);
  color: var(--ink);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  transition: transform var(--dur-press) var(--ease-out);
}

.hot-hero:has(.hot-hero__body:active) {
  transform: scale(0.985);
}

.hot-hero:has(.hot-hero__body:focus-visible) {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 3px;
}

.hot-hero__backdrop {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  background-color: var(--hero-tint);
  border-radius: inherit;
  /* The tint glides from one category's colour to the next as the slides change. */
  transition: background-color 420ms ease;
}

/* Soft light behind the food so it reads as lit from above rather than pasted on. */
.hot-hero__glow {
  position: absolute;
  top: -3.5rem;
  right: -2.5rem;
  width: 12rem;
  height: 12rem;
  background: radial-gradient(closest-side, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0));
  border-radius: 50%;
}

.hot-hero__eyebrow {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  margin: 0 0 var(--space-2);
  padding: 3px 10px 3px 6px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  background: rgba(255, 255, 255, 0.72);
  border-radius: var(--radius-pill);
}

.hot-hero__flame {
  width: 14px;
  height: 14px;
  fill: var(--coral);
}

.hot-hero__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
  width: 100%;
  min-height: 5.75rem;
  padding: 0 var(--text-room) 0 0;
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.hot-hero__body:focus-visible {
  outline: none;
}

/* Rises past the top edge of the section. */
.hot-hero__food {
  position: absolute;
  z-index: 1;
  cursor: pointer;
  top: calc(-1 * var(--food-lift));
  right: 0;
  width: var(--food-size);
  height: var(--food-size);
  filter: drop-shadow(0 10px 12px rgba(27, 27, 31, 0.22));
  transition: transform 220ms var(--ease-out);
  animation: hot-food-in 460ms var(--ease-out) 40ms both;
}

.hot-hero__sprite {
  width: 100%;
  height: 100%;
}

@media (hover: hover) and (pointer: fine) {
  .hot-hero:hover .hot-hero__food {
    transform: translateY(-4px) rotate(-3deg);
  }
}

.hot-hero__deal {
  display: -webkit-box;
  overflow: hidden;
  font-family: var(--font-display);
  font-size: 1.3125rem;
  font-weight: 600;
  line-height: 1.15;
  text-wrap: balance;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.hot-hero__venue {
  max-width: 100%;
  overflow: hidden;
  font-size: 0.8125rem;
  color: rgba(27, 27, 31, 0.66);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.hot-hero__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: var(--space-2);
}

.hot-hero__chip {
  padding: 3px 9px;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1.3;
  white-space: nowrap;
  background: var(--paper-white);
  border-radius: var(--radius-pill);
}

.hot-hero__chip--ends {
  color: var(--coral-deep);
}

.hot-hero__foot {
  display: flex;
  align-items: center;
  margin-top: var(--space-1);
}

.hot-hero__dots {
  display: flex;
  margin-left: -12px;
}

.hot-hero__pos {
  margin-left: auto;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: rgba(27, 27, 31, 0.6);
}

.hot-hero__pause,
.hot-hero__dot {
  display: inline-grid;
  place-items: center;
  width: var(--hit);
  height: var(--hit);
  padding: 0;
  color: var(--ink);
  background: transparent;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
}

.hot-hero__pause {
  margin-right: -8px;
}

.hot-hero__pause-ring {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  background: rgba(255, 255, 255, 0.55);
  border-radius: 50%;
  transition:
    background-color 150ms ease,
    transform var(--dur-press) var(--ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .hot-hero__pause:hover .hot-hero__pause-ring {
    background: var(--paper-white);
  }
}

.hot-hero__pause:active .hot-hero__pause-ring {
  transform: scale(0.94);
}

.hot-hero__dot span {
  width: 7px;
  height: 7px;
  background: rgba(27, 27, 31, 0.2);
  border-radius: var(--radius-pill);
  transition:
    width 250ms var(--ease-in-out),
    background-color 200ms ease;
}

.hot-hero__dot span.is-on {
  width: 18px;
  background: var(--ink-strong);
}

.hot-hero__pause:focus-visible,
.hot-hero__dot:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: -6px;
}

/* Fills over the 4.5 seconds each slide is shown; dims while paused. */
.hot-hero__bar {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background: rgba(27, 27, 31, 0.55);
  transform-origin: left;
  animation: hot-progress 4.5s linear forwards;
}

.hot-hero__bar.is-paused {
  opacity: 0.35;
  animation-play-state: paused;
}

/* The new food rises into place a beat after the text starts to fade in. Individual
   `translate`/`scale` keep the entrance separate from the hover `transform`. */
@keyframes hot-food-in {
  from {
    opacity: 0;
    translate: 0 14px;
    scale: 0.9;
  }
}

@keyframes hot-progress {
  from {
    transform: scaleX(0);
  }

  to {
    transform: scaleX(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hot-hero,
  .hot-hero__food {
    transition: none;
  }

  .hot-hero:has(.hot-hero__body:active) {
    transform: none;
  }

  .hot-hero__food {
    animation: hot-food-fade 200ms ease both;
  }
}

@keyframes hot-food-fade {
  from {
    opacity: 0;
  }
}
</style>
