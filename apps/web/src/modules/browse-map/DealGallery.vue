<script setup lang="ts">
import type { DealImage } from '@broke-oclock/contracts/deals'
import DealPhoto from '@web/modules/browse-map/DealPhoto.vue'
import { clampPhotoRatio } from '@web/modules/browse-map/deal-columns'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { computed, ref, watchEffect } from 'vue'

// Swipeable deal photos. The frame takes the shape of the photo on screen (portrait poster,
// square, landscape), within limits so one odd image cannot fill or flatten the panel. Photos
// that fail to load drop out; if none are left the fallback slot shows instead.
const props = defineProps<{ images: readonly DealImage[]; title: string }>()
// Tells the parent whether photos are on screen, so labels can move off the hero.
const emit = defineEmits<{ showing: [boolean] }>()

const failed = ref<ReadonlySet<string>>(new Set())
const ratios = ref<Readonly<Record<string, number>>>({})
const active = ref(0)
const track = ref<HTMLElement | null>(null)

const shown = computed(() => props.images.filter((image) => !failed.value.has(image.url)))
const current = computed(() => shown.value[Math.min(active.value, shown.value.length - 1)])
const frameRatio = computed(() =>
  clampPhotoRatio(current.value ? ratios.value[current.value.url] : undefined),
)
watchEffect(() => emit('showing', shown.value.length > 0))
const atStart = computed(() => active.value <= 0)
const atEnd = computed(() => active.value >= shown.value.length - 1)

const markFailed = (url: string) => {
  failed.value = new Set([...failed.value, url])
}

const recordRatio = (url: string, ratio: number) => {
  ratios.value = { ...ratios.value, [url]: ratio }
}

const onScroll = () => {
  const el = track.value
  if (el && el.clientWidth > 0) active.value = Math.round(el.scrollLeft / el.clientWidth)
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const goTo = (index: number) => {
  const el = track.value
  const target = Math.max(0, Math.min(shown.value.length - 1, index))
  active.value = target
  el?.scrollTo?.({ left: target * el.clientWidth, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}

const altFor = (image: DealImage, index: number) => image.alt ?? `${props.title}, photo ${index + 1}`
</script>

<template>
  <div v-if="shown.length" class="deal-gallery" :style="{ '--frame-ratio': frameRatio }" data-testid="deal-gallery">
    <ul ref="track" class="deal-gallery__track" aria-label="Deal photos" @scroll.passive="onScroll">
      <li v-for="(image, index) in shown" :key="image.url" class="deal-gallery__slide">
        <DealPhoto
          :src="image.url"
          :alt="altFor(image, index)"
          :eager="index === 0"
          @ratio="recordRatio(image.url, $event)"
          @error="markFailed(image.url)"
        />
      </li>
    </ul>
    <template v-if="shown.length > 1">
      <button
        type="button"
        class="deal-gallery__arrow deal-gallery__arrow--prev"
        aria-label="Previous photo"
        :disabled="atStart"
        data-testid="gallery-prev"
        @click="goTo(active - 1)"
      >
        <ShellIcon name="chevronLeft" :size="18" />
      </button>
      <button
        type="button"
        class="deal-gallery__arrow deal-gallery__arrow--next"
        aria-label="Next photo"
        :disabled="atEnd"
        data-testid="gallery-next"
        @click="goTo(active + 1)"
      >
        <ShellIcon name="chevronRight" :size="18" />
      </button>
      <span class="deal-gallery__count lb-tag lb-tag--paper" aria-live="polite">
        {{ Math.min(active + 1, shown.length) }}/{{ shown.length }}
      </span>
    </template>
  </div>
  <slot v-else name="fallback" />
</template>

<style scoped>
.deal-gallery {
  position: relative;
  flex: none;
  overflow: hidden;
  background: var(--hero-tint, var(--paper-sunk));
  aspect-ratio: var(--frame-ratio);
  border-radius: 22px;
  transition: aspect-ratio 220ms var(--ease-out);
}

.deal-gallery__track {
  display: flex;
  height: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
}

.deal-gallery__track::-webkit-scrollbar {
  display: none;
}

.deal-gallery__slide {
  flex: 0 0 100%;
  height: 100%;
  scroll-snap-align: center;
}

.deal-gallery__count {
  position: absolute;
  top: 12px;
  right: 12px;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

/* Arrows are for mouse users; touch screens swipe. */
.deal-gallery__arrow {
  position: absolute;
  top: 50%;
  display: none;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  color: var(--ink);
  background: var(--paper);
  border: 0;
  border-radius: 50%;
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.18);
  cursor: pointer;
  transform: translateY(-50%);
  transition:
    opacity 160ms var(--ease-out),
    transform 160ms var(--ease-out);
}

.deal-gallery__arrow--prev {
  left: 10px;
}

.deal-gallery__arrow--next {
  right: 10px;
}

.deal-gallery__arrow:active:not(:disabled) {
  transform: translateY(-50%) scale(0.94);
}

.deal-gallery__arrow:disabled {
  opacity: 0;
  pointer-events: none;
}

.deal-gallery__arrow:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}

@media (hover: hover) and (pointer: fine) {
  .deal-gallery__arrow {
    display: grid;
  }
}

@media (prefers-reduced-motion: reduce) {
  .deal-gallery,
  .deal-gallery__arrow {
    transition: none;
  }
}
</style>
