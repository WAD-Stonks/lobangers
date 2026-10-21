<script setup lang="ts">
import { walkMinutesFor } from '@web/modules/browse-map/apply-filters'
import { categoryStyle } from '@web/modules/browse-map/category-style'
import DealPhoto from '@web/modules/browse-map/DealPhoto.vue'
import { clampPhotoRatio } from '@web/modules/browse-map/deal-columns'
import { dealFreshness, formatEnding, formatMoreOutlets, priceText } from '@web/modules/browse-map/deal-format'
import type { DealRow } from '@web/modules/browse-map/types'
import { computed, ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { RouterLink } from 'vue-router'

// One ticket-style card in list mode. With a photo, the top takes the photo's own shape (a tall
// poster makes a tall card); without one, or if it fails, it stays the short tinted ticket top.
const props = defineProps<{ row: DealRow; to: RouteLocationRaw }>()
const emit = defineEmits<{ hover: [venueId: string | null] }>()

const failed = ref(false)
const ratio = ref<number | undefined>(undefined)

const photo = computed(() => (failed.value ? undefined : props.row.deal.images[0]))
const price = computed(() => priceText(props.row.deal))
const moreOutlets = computed(() => formatMoreOutlets(props.row.outletCount))
</script>

<template>
  <RouterLink
    :to="props.to"
    class="deal-cards__card"
    @mouseenter="emit('hover', props.row.venue.id)"
    @mouseleave="emit('hover', null)"
  >
    <span
      class="deal-cards__top"
      :class="{ 'deal-cards__top--photo': photo }"
      :style="{ '--card-tint': categoryStyle(props.row.deal.category).tint, '--photo-ratio': clampPhotoRatio(ratio) }"
    >
      <DealPhoto
        v-if="photo"
        class="deal-cards__photo"
        :src="photo.url"
        :alt="photo.alt ?? props.row.deal.title"
        @ratio="ratio = $event"
        @error="failed = true"
      />
      <span class="lb-tag lb-tag--paper">{{ dealFreshness(props.row.deal).label }}</span>
      <span v-if="price" class="deal-cards__price">{{ price }}</span>
    </span>
    <span class="deal-cards__body">
      <strong class="deal-cards__title">{{ props.row.deal.title }}</strong>
      <span class="lb-meta lb-text-wrap">{{ props.row.venue.name }}</span>
      <span v-if="moreOutlets" class="deal-cards__outlets" data-testid="more-outlets">{{ moreOutlets }}</span>
    </span>
    <span class="deal-cards__perf" aria-hidden="true" />
    <span class="deal-cards__foot lb-meta">
      <span>{{ props.row.distanceMetres === null ? '' : `${walkMinutesFor(props.row.distanceMetres)} min walk` }}</span>
      <span>{{ formatEnding(props.row.deal.validUntil) }}</span>
    </span>
  </RouterLink>
</template>

<style scoped>
.deal-cards__card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--ink);
  text-decoration: none;
  background: var(--paper-white);
  border: 1px solid var(--hairline);
  border-radius: 22px;
  transition: border-color 150ms ease;
}

.deal-cards__card:hover {
  color: var(--ink);
  border-color: var(--hairline-strong);
}

.deal-cards__card:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
}

.deal-cards__top {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
  min-height: 96px;
  padding: 12px;
  background: var(--card-tint);
}

/* The photo sets the height; the labels float in its top corners. */
.deal-cards__top--photo {
  aspect-ratio: var(--photo-ratio);
  min-height: 0;
}

.deal-cards__photo {
  position: absolute;
  inset: 0;
}

.deal-cards__top > .lb-tag,
.deal-cards__price {
  position: relative;
}

.deal-cards__price {
  max-width: 60%;
  padding: 2px 9px;
  font: 600 0.9375rem/1.3 var(--font-display);
  color: var(--paper-white);
  text-align: right;
  overflow-wrap: anywhere;
  background: var(--ink-strong);
  border-radius: 999px;
}

.deal-cards__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 3px;
  padding: 12px 14px 10px;
}

.deal-cards__title {
  font-size: 0.9375rem;
  overflow-wrap: anywhere;
}

.deal-cards__outlets {
  align-self: flex-start;
  margin-top: 4px;
  padding: 2px 8px;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--ink);
  background: var(--paper-sunk);
  border-radius: var(--radius-pill);
}

.deal-cards__perf {
  margin: 0 12px;
  border-top: 2px dashed var(--hairline);
}

.deal-cards__foot {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  padding: 10px 14px 14px;
}
</style>
