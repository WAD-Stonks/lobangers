<script setup lang="ts">
import CategoryBubble from '@web/modules/browse-map/CategoryBubble.vue'
import { formatEnding, priceText } from '@web/modules/browse-map/deal-format'
import type { SelectedDeal } from '@web/modules/browse-map/types'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { useHotRotation } from '@web/modules/map-shell/use-hot-rotation'
import { computed, toRef } from 'vue'

// Rotating card at the bottom left. There is no view count yet, so it shows the soonest-ending
// verified deals and says "Ending soon" rather than claiming popularity (open question 2).
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
    class="hot-card lb-card"
    aria-roledescription="carousel"
    aria-label="Ending soon"
    data-testid="hot-card"
    @mouseenter="rotation.setHover(true)"
    @mouseleave="rotation.setHover(false)"
    @focusin="rotation.setFocus(true)"
    @focusout="onFocusOut"
  >
    <div class="hot-card__head">
      <svg class="hot-card__flame" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.5c1.2 3.2 4.8 5 4.8 9.6a4.8 4.8 0 0 1-9.6 0c0-1.9.8-3.3 1.9-4.3.2 1.9 1.1 2.9 2.2 3.1C10.6 7.8 10.2 5 12 2.5z" />
      </svg>
      <h2 class="hot-card__title">Ending soon</h2>
      <span class="lb-meta hot-card__pos" data-testid="hot-position">{{ position }}</span>
      <button
        v-if="!reducedMotion && count > 1"
        type="button"
        class="hot-card__pause"
        :aria-label="pauseLabel"
        :title="pauseLabel"
        data-testid="hot-pause"
        @click="rotation.toggle"
      >
        <span class="hot-card__pause-ring" aria-hidden="true">
          <ShellIcon :name="rotation.paused.value ? 'play' : 'pause'" :size="14" :stroke-width="2.4" />
        </span>
      </button>
    </div>

    <Transition name="hot-swap" mode="out-in">
      <button
        :key="current.deal.id"
        type="button"
        class="hot-card__body"
        :aria-live="rotation.running.value ? 'off' : 'polite'"
        data-testid="hot-open"
        @click="open"
      >
        <CategoryBubble :category="current.deal.category" size="md" />
        <span class="hot-card__text">
          <strong class="hot-card__deal">{{ current.deal.title }}</strong>
          <span class="lb-meta hot-card__venue">{{ current.venue.name }}</span>
          <span class="hot-card__ends">{{ formatEnding(current.deal.validUntil) }}</span>
        </span>
        <span v-if="price" class="lb-price hot-card__price">{{ price }}</span>
      </button>
    </Transition>

    <div v-if="count > 1" class="hot-card__dots">
      <button
        v-for="(item, index) in deals"
        :key="item.deal.id"
        type="button"
        class="hot-card__dot"
        :aria-label="`Show ${item.deal.title}`"
        :aria-current="index === rotation.index.value ? 'true' : undefined"
        @click="rotation.pick(index)"
      >
        <span :class="{ 'is-on': index === rotation.index.value }" />
      </button>
    </div>

    <span
      v-if="!reducedMotion && count > 1"
      :key="`bar-${rotation.index.value}-${rotation.running.value}`"
      class="hot-card__bar"
      :class="{ 'is-paused': !rotation.running.value }"
      aria-hidden="true"
    />
  </section>
</template>

<style scoped>
.hot-card {
  position: relative;
  width: 20rem;
  max-width: calc(100vw - 2 * var(--shell-gutter));
  overflow: hidden;
  border-radius: 22px;
}

.hot-card__head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px 4px 0 14px;
}

.hot-card__flame {
  width: 18px;
  height: 18px;
  fill: var(--coral);
}

.hot-card__title {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 700;
}

.hot-card__pos {
  margin-left: auto;
  font-size: 0.75rem;
}

.hot-card__pause,
.hot-card__dot {
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

.hot-card__pause-ring {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--hairline);
  border-radius: 50%;
}

.hot-card__pause:hover .hot-card__pause-ring {
  background: var(--paper-hover);
}

.hot-card__body {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--space-3);
  align-items: center;
  width: 100%;
  padding: 6px 14px 4px;
  color: var(--ink);
  text-align: left;
  background: transparent;
  border: 0;
  cursor: pointer;
  transition: background-color 150ms ease;
}

@media (hover: hover) and (pointer: fine) {
  .hot-card__body:hover {
    background: var(--sunny-wash);
  }
}

.hot-card__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.hot-card__deal,
.hot-card__venue {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.hot-card__deal {
  font-size: 0.9375rem;
}

.hot-card__ends {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--coral-deep);
  white-space: nowrap;
}

/* Offer wording ("Free flower with any drink") wraps inside a capped column so the
   title, venue and end date always keep their space. */
.hot-card__price {
  max-width: 6.5rem;
  font-size: 1.0625rem;
  text-align: right;
  white-space: normal;
  overflow-wrap: anywhere;
}

.hot-card__dots {
  display: flex;
  justify-content: center;
}

.hot-card__dot span {
  width: 7px;
  height: 7px;
  background: var(--track);
  border-radius: var(--radius-pill);
  transition:
    width 250ms var(--ease-in-out),
    background-color 200ms ease;
}

.hot-card__dot span.is-on {
  width: 18px;
  background: var(--ink-strong);
}

/* Fills over the 4.5 seconds each card is shown; dims while paused. */
.hot-card__bar {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background: var(--coral);
  transform-origin: left;
  animation: hot-progress 4.5s linear forwards;
}

.hot-card__bar.is-paused {
  opacity: 0.35;
  animation-play-state: paused;
}

.hot-card__pause:focus-visible,
.hot-card__dot:focus-visible,
.hot-card__body:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: -3px;
}

@keyframes hot-progress {
  from {
    transform: scaleX(0);
  }

  to {
    transform: scaleX(1);
  }
}
</style>
