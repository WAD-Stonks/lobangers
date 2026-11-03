<script setup lang="ts">
import DealImage from '@web/components/DealImage.vue'
import { walkMinutesFor } from '@web/modules/browse-map/apply-filters'
import CategoryBubble from '@web/modules/browse-map/CategoryBubble.vue'
import { dealFreshness, dealNoticeTags, formatEnding, formatMoreOutlets, OUTLET_NOT_CONFIRMED } from '@web/modules/browse-map/deal-format'
import SaveDealButton from '@web/modules/browse-map/SaveDealButton.vue'
import type { DealRow } from '@web/modules/browse-map/types'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { RouterLink } from 'vue-router'

// Image-led deal rows. Each row links to its deal; hovering or focusing a row lights up its
// pin on the map (and the shell lights the row when its pin is hovered).
const props = withDefaults(
  defineProps<{
    rows: readonly DealRow[]
    to: (row: DealRow) => RouteLocationRaw
    hotVenueId?: string | null
    currentKey?: string | null
    testId?: string
    compact?: boolean
  }>(),
  { hotVenueId: null, currentKey: null, testId: 'deal-rows' },
)
const emit = defineEmits<{ hover: [venueId: string | null] }>()
const pointedKey = ref<string | null>(null)
const point = (row: DealRow | null) => {
  pointedKey.value = row?.key ?? null
  emit('hover', row?.venue.id ?? null)
}
const isHot = (row: DealRow) => {
  const pointed = props.rows.find((candidate) => candidate.key === pointedKey.value)
  if (pointed && pointed.venue.id === props.hotVenueId) return row.key === pointed.key
  return row.venue.id === props.hotVenueId
}
</script>

<template>
  <ol class="deal-rows" :class="{ 'deal-rows--compact': compact }" :data-testid="testId">
    <li v-for="(row, index) in rows" :key="row.key" :style="{ '--i': Math.min(index, 8) }" :class="{ 'is-hot': isHot(row) }" @mouseenter="point(row)" @mouseleave="point(null)">
      <RouterLink
        :to="to(row)"
        class="deal-rows__row"
        :class="{ 'is-hot': isHot(row), 'is-current': row.key === currentKey }"
        :aria-current="row.key === currentKey ? 'true' : undefined"
        @focus="point(row)"
        @blur="point(null)"
      >
        <span class="lb-tag deal-rows__status" :class="[`lb-tag--${dealFreshness(row.deal).tone}`, { 'is-expired': dealFreshness(row.deal).label === 'Expired', 'is-conflicting': dealFreshness(row.deal).label === 'Mixed reports' }]">{{ dealFreshness(row.deal).label }}</span>
        <span class="deal-rows__media" :class="{ 'deal-rows__media--placeholder': !row.deal.imageUrl && !row.deal.images[0] }">
          <DealImage v-if="row.deal.imageUrl || row.deal.images[0]" :key="row.deal.id" class="deal-rows__image" :url="row.deal.imageUrl || row.deal.images[0]?.url" :alt="row.deal.imageAltText?.trim() || row.deal.images[0]?.alt || ''" />
          <CategoryBubble v-else :category="row.deal.category" :title="row.deal.title" :venue="row.venue.name" size="md" />
        </span>
        <span class="deal-rows__text">
          <strong class="deal-rows__title" :title="row.deal.title">{{ row.deal.title }}</strong>
          <span class="deal-rows__venue" :title="row.venue.name">{{ row.venue.name }}</span>
          <span v-if="row.outletCount > 1" class="deal-rows__outlets" data-testid="more-outlets">
            {{ formatMoreOutlets(row.outletCount) }}
          </span>
          <span v-if="row.deal.outletUnconfirmed" class="deal-rows__unsure">{{ OUTLET_NOT_CONFIRMED }}</span>
          <span v-for="notice in dealNoticeTags(row.deal)" :key="notice.label" class="lb-tag deal-rows__notice" :class="`lb-tag--${notice.tone}`">{{ notice.label }}</span>
          <span class="deal-rows__ending" :class="{ 'is-expired': formatEnding(row.deal.validUntil) === 'Ended' }"><ShellIcon name="calendar" :size="16" /><span>{{ formatEnding(row.deal.validUntil) }}</span></span>
          <span v-if="row.distanceMetres !== null" class="deal-rows__walk">
            <ShellIcon name="walk" :size="16" /><span>{{ walkMinutesFor(row.distanceMetres) }} min walk</span>
          </span>
        </span>
        <ShellIcon class="deal-rows__chevron" name="chevronRight" :size="18" />
      </RouterLink>
      <SaveDealButton :deal-id="row.deal.id" :title="row.deal.title" />
    </li>
  </ol>
</template>

<style scoped>
/* Each row sizes to its own content: equal rows (1fr) stretched every card to the tallest one,
   so zooming the map out to take in one long deal made the whole list grow. */
.deal-rows {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.deal-rows > li {
  position: relative;
  min-width: 0;
  transition: transform 180ms ease;
  /* New rows rise in, the first nine staggered. `backwards` releases transform afterwards so
     the hover lift still works. Rows kept across a filter change don't replay. */
  animation: deal-row-in 220ms var(--ease-out) backwards;
  animation-delay: calc(var(--i, 0) * 30ms);
}

@keyframes deal-row-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

.deal-rows__row {
  position: relative;
  box-sizing: border-box;
  height: 100%;
  display: grid;
  grid-template-columns: clamp(96px, 32%, 180px) minmax(0, 1fr) 18px;
  gap: var(--space-3);
  align-items: start;
  padding: 12px;
  border: 0;
  box-shadow: 0 2px 8px rgb(27 27 31 / 0.06), 0 1px 2px rgb(27 27 31 / 0.03);
  background: var(--paper-white);
  color: var(--ink);
  text-decoration: none;
  border-radius: 16px;
  transition: box-shadow 180ms ease;
  /* Long result lists: rows far off screen skip layout and paint until they scroll near.
     `auto` remembers each row's real height once shown; skipped rows stay focusable and
     findable in the page. On the link, not the <li>, so its hover shadow isn't clipped. */
  content-visibility: auto;
  contain-intrinsic-size: auto 220px;
}

.deal-rows > li:has(.deal-rows__row:active) {
  transform: scale(0.98);
}

.deal-rows__row.is-current {
  background: var(--sunny-wash);
}

@media (hover: hover) and (pointer: fine) {
  .deal-rows > li:hover,
  .deal-rows > li.is-hot {
    transform: translateY(-3px);
  }
  .deal-rows > li:hover .deal-rows__row,
  .deal-rows > li.is-hot .deal-rows__row {
    box-shadow: var(--shadow-card);
  }
}

.deal-rows__row:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: -2px;
}

.deal-rows__media {
  display: grid;
  place-items: center;
  width: 100%;
  overflow: hidden;
  border-radius: var(--radius-control);
}

.deal-rows__media--placeholder {
  align-self: stretch;
  min-height: 140px;
  aspect-ratio: 4 / 5;
  background: var(--tint-other);
}

.deal-rows__image {
  width: 100%;
  height: auto;
  aspect-ratio: auto;
  font-size: var(--text-xs);
  text-align: center;
  background: transparent;
}

.deal-rows__image :deep(img) {
  height: auto;
}

.deal-rows--compact .deal-rows__row {
  grid-template-columns: 88px minmax(0, 1fr) 18px;
  padding: 10px;
  align-items: center;
}

.deal-rows--compact .deal-rows__media {
  height: 110px;
  min-height: 0;
  aspect-ratio: auto;
  align-self: center;
}

.deal-rows--compact .deal-rows__image,
.deal-rows--compact .deal-rows__image :deep(img) {
  height: 110px;
  object-fit: contain;
}

.deal-rows--compact .deal-rows__text {
  gap: 4px;
}

.deal-rows__image :deep([data-testid='deal-image-placeholder']) {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 1;
  background: var(--tint-other);
}

/* biome-ignore lint/style/noDescendingSpecificity: the earlier, more specific rule is a modifier override for a different state of the same element */
.deal-rows__text {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  text-align: left;
  line-height: 1.4;
}

/* Two lines at most; the full title is in the tooltip and on the deal panel. */
.deal-rows__title {
  padding-right: 28px;
  color: var(--coral-deep);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  font-size: 0.9375rem;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.deal-rows__venue {
  font-size: var(--text-sm);
  color: var(--ink);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.deal-rows__outlets {
  align-self: flex-start;
  padding: 4px 12px;
  font-size: var(--text-xs);
  background: var(--paper-sunk);
  border-radius: var(--radius-pill);
  font-weight: 600;
  color: var(--ink);
  overflow-wrap: anywhere;
}

.deal-rows__unsure {
  font-size: var(--text-xs);
  color: var(--ink-muted);
  white-space: nowrap;
}

.deal-rows__notice {
  align-self: flex-start;
}

.deal-rows__walk,
.deal-rows__ending {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.deal-rows__walk {
  font-size: var(--text-xs);
  color: var(--ink-muted);
}

.deal-rows__ending {
  margin-top: 0;
  font-size: var(--text-xs);
  color: var(--ink-muted);
}

.deal-rows__status {
  position: absolute;
  z-index: 1;
  top: 12px;
  left: 12px;
  max-width: calc(100% - 76px);
  white-space: normal;
}

.deal-rows__status.is-conflicting { color: var(--tag-end-ink); background: var(--tag-end-bg); }

.deal-rows__status.is-expired,
.deal-rows__ending.is-expired {
  color: var(--coral-deep);
}

.deal-rows__chevron {
  align-self: center;
  color: var(--ink-muted);
}

@media (prefers-reduced-motion: reduce) {
  .deal-rows > li,
  .deal-rows__row { transition: none; }
  .deal-rows > li { animation-name: deal-row-fade; }
  .deal-rows > li:hover,
  .deal-rows > li.is-hot,
  .deal-rows > li:has(.deal-rows__row:active) {
    transform: none;
  }
}

@keyframes deal-row-fade {
  from {
    opacity: 0;
  }
}
</style>
