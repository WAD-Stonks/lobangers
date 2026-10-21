<script setup lang="ts">
import type { VenueDealSummary } from '@broke-oclock/contracts/venues'
import { offerLabel, validityLabel } from '@web/modules/venues-feed/deal-format'
import { computed } from 'vue'

const props = defineProps<{ deal: VenueDealSummary }>()
const offer = computed(() => offerLabel(props.deal))
const validity = computed(() => validityLabel(props.deal))
</script>

<template>
  <article class="venue-deal-card" data-testid="venue-deal-card">
    <img v-if="deal.imageUrl" :src="deal.imageUrl" :alt="deal.title" class="venue-deal-card__image" loading="lazy" />
    <div v-else class="venue-deal-card__image venue-deal-card__image--empty" aria-hidden="true">No photo</div>
    <div class="venue-deal-card__body">
      <span class="lb-tag lb-tag--new venue-deal-card__category">{{ deal.category }}</span>
      <h3 class="venue-deal-card__title">{{ deal.title }}</h3>
      <slot name="meta" />
      <p v-if="offer" class="lb-price venue-deal-card__offer">{{ offer }}</p>
      <p class="lb-meta venue-deal-card__validity">{{ validity }}</p>
    </div>
  </article>
</template>

<style scoped>
.venue-deal-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--paper-white);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-control);
  transition: border-color 150ms ease;
}

@media (hover: hover) and (pointer: fine) {
  .venue-deal-card:hover {
    border-color: var(--hairline-strong);
  }
}

.venue-deal-card__image {
  aspect-ratio: 4 / 3;
  width: 100%;
  object-fit: cover;
}

.venue-deal-card__image--empty {
  display: grid;
  place-items: center;
  font-size: var(--text-xs);
  color: var(--ink-muted);
  background: var(--paper-sunk);
}

.venue-deal-card__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
}

.venue-deal-card__category {
  align-self: flex-start;
  text-transform: capitalize;
}

.venue-deal-card__title {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  font-size: var(--text-sm);
  font-weight: 700;
  line-height: 1.3;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.venue-deal-card__offer {
  margin: 0;
  white-space: normal;
  overflow-wrap: anywhere;
}

.venue-deal-card__validity {
  margin: auto 0 0;
}
</style>
