<script setup lang="ts">
import { walkMinutesFor } from '@web/modules/browse-map/apply-filters'
import DealPhoto from '@web/modules/browse-map/DealPhoto.vue'
import { dealFreshness, formatEnding, formatMoreOutlets, OUTLET_NOT_CONFIRMED } from '@web/modules/browse-map/deal-format'
import SaveDealButton from '@web/modules/browse-map/SaveDealButton.vue'
import type { DealRow } from '@web/modules/browse-map/types'
import { computed, ref, watch } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { RouterLink } from 'vue-router'

const props = defineProps<{ row: DealRow; to: RouteLocationRaw; naturalRatio?: boolean }>()
const emit = defineEmits<{ hover: [venueId: string | null] }>()

const MIN_PHOTO_RATIO = 1 / 2
const MAX_PHOTO_RATIO = 3

const photoRatio = ref<number | null>(null)
watch(() => props.row.deal.images[0]?.url, () => { photoRatio.value = null })

const onPhotoRatio = (ratio: number) => {
  if (props.naturalRatio) photoRatio.value = Math.min(MAX_PHOTO_RATIO, Math.max(MIN_PHOTO_RATIO, ratio))
}

const photoStyle = computed(() => (photoRatio.value ? { '--photo-ratio': String(photoRatio.value) } : undefined))
</script>

<template>
  <article
    class="food-deal-card"
    :class="{ 'food-deal-card--natural': props.naturalRatio }"
    :aria-label="`${props.row.deal.title} at ${props.row.venue.name}`"
    @mouseenter="emit('hover', props.row.venue.id)"
    @mouseleave="emit('hover', null)"
  >
    <RouterLink class="food-deal-card__link" :to="props.to">
      <span class="visually-hidden">View {{ props.row.deal.title }} at {{ props.row.venue.name }}</span>
    </RouterLink>
    <SaveDealButton :deal-id="row.deal.id" :title="row.deal.title" />
    <div class="food-deal-card__photo" :style="photoStyle">
      <DealPhoto
        v-if="props.row.deal.images[0]"
        :src="props.row.deal.images[0].url"
        :alt="props.row.deal.images[0].alt ?? ''"
        class="food-deal-card__image"
        @ratio="onPhotoRatio"
      />
      <div v-else class="food-deal-card__placeholder" aria-hidden="true">🍽️</div>
      <span class="food-deal-card__status" :class="`food-deal-card__status--${dealFreshness(props.row.deal).tone}`" data-testid="deal-status">{{ dealFreshness(props.row.deal).label }}</span>
    </div>
    <div class="food-deal-card__body">
      <p class="food-deal-card__description">{{ props.row.deal.title }}</p>
      <p class="food-deal-card__restaurant">{{ props.row.venue.name }}</p>
      <span v-if="props.row.deal.outletUnconfirmed" class="food-deal-card__unsure" data-testid="outlet-unconfirmed">{{ OUTLET_NOT_CONFIRMED }}</span>
      <span v-if="props.row.outletCount > 1" class="food-deal-card__outlets">
        {{ formatMoreOutlets(props.row.outletCount) }}
      </span>
      <div class="food-deal-card__footer">
        <span v-if="props.row.distanceMetres !== null" class="food-deal-card__distance">{{ walkMinutesFor(props.row.distanceMetres) }} min walk</span>
        <span class="food-deal-card__validity" :class="{ 'is-expired': formatEnding(props.row.deal.validUntil) === 'Ended' }">{{ formatEnding(props.row.deal.validUntil) }}</span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.food-deal-card {
  position: relative;
  box-sizing: border-box;
  height: 100%;
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  background: var(--paper-white);
  border: 0;
  box-shadow: 0 2px 8px rgb(27 27 31 / 0.06), 0 1px 2px rgb(27 27 31 / 0.03);
  border-radius: 28px;
  transition: transform 180ms ease, box-shadow 180ms ease;
}

.food-deal-card--natural {
  height: auto;
}

.food-deal-card:focus-within {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
}

.food-deal-card__link {
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: inherit;
}

.food-deal-card__link:focus-visible {
  outline: none;
}

.food-deal-card__photo {
  flex: none;
  position: relative;
  min-height: 0;
  overflow: hidden;
  background: var(--paper-sunk);
}

.food-deal-card__photo::before {
  content: '';
  display: block;
  aspect-ratio: var(--photo-ratio, 4 / 5);
}

.food-deal-card__image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.food-deal-card__image :deep(.deal-photo__img) {
  object-fit: contain;
}

.food-deal-card__placeholder {
  position: absolute;
  inset: 0;
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  font-size: 2.25rem;
  background: linear-gradient(145deg, var(--paper-sunk), var(--paper-hover));
}

.food-deal-card__status {
  position: absolute;
  top: clamp(12px, 5cqi, 24px);
  left: clamp(12px, 5cqi, 24px);
  max-width: calc(100% - 80px);
  padding: 5px 12px;
  overflow: hidden;
  font-size: clamp(0.75rem, 5.2cqi, 1.5rem);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-radius: var(--radius-pill);
  box-shadow: 0 1px 4px rgb(27 27 31 / 0.14);
}

.food-deal-card__status--ok { color: var(--tag-ok-ink); background: var(--tag-ok-bg); }
.food-deal-card__status--end { color: var(--tag-end-ink); background: var(--tag-end-bg); }
.food-deal-card__status--new { color: var(--tag-new-ink); background: var(--tag-new-bg); }

.food-deal-card__body {
  flex: 1;
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: clamp(14px, 6cqi, 28px);
}

.food-deal-card__description,
.food-deal-card__restaurant,
.food-deal-card__validity {
  margin: 0;
}

.food-deal-card__description {
  display: -webkit-box;
  overflow: hidden;
  font-size: clamp(1rem, 6cqi, 1.75rem);
  font-weight: 750;
  line-height: 1.35;
  color: var(--coral-deep);
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.food-deal-card__restaurant {
  font-size: clamp(0.875rem, 5.2cqi, 1.5rem);
  font-weight: 500;
  color: var(--ink);
  overflow-wrap: anywhere;
}

.food-deal-card__unsure {
  font-size: clamp(0.75rem, 4.6cqi, 1.25rem);
  color: var(--ink-muted);
}

.food-deal-card__outlets {
  padding: 4px 12px;
  font-size: clamp(0.75rem, 5cqi, 1.5rem);
  font-weight: 650;
  background: var(--paper-sunk);
  border-radius: var(--radius-pill);
}

.food-deal-card__footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: baseline;
  align-self: stretch;
  gap: 8px 12px;
  margin-top: auto;
  padding-top: clamp(12px, 5cqi, 24px);
  border-top: 2px dashed var(--hairline);
  font-size: clamp(0.75rem, 5cqi, 1.5rem);
  color: var(--ink-muted);
}

.food-deal-card__validity {
  margin-left: auto;
}

.food-deal-card__validity.is-expired {
  color: var(--coral-deep);
}

@media (hover: hover) and (pointer: fine) {
  .food-deal-card:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-card);
  }

}

@media (prefers-reduced-motion: reduce) {
  .food-deal-card,
  .food-deal-card__image {
    transition: none;
  }

  .food-deal-card:hover,
  .food-deal-card:hover .food-deal-card__image {
    transform: none;
  }
}
</style>
