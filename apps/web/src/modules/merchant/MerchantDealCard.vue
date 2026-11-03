<script setup lang="ts">
import FoodSprite from '@web/modules/browse-map/FoodSprite.vue'
import { foodKindFor } from '@web/modules/browse-map/food-kind'
import { computed } from 'vue'

// One deal on the merchant dashboard, as a card: its photo (or the map's food illustration when
// it has none) with a status badge, the title, the description, the offer and dates on one line,
// where it runs, and its terms and conditions. Buttons go in the actions slot; anything extra (such as how many flash codes
// were claimed) goes in the default slot.
export type CardTone = 'live' | 'scheduled' | 'draft' | 'ended' | 'removed'

const props = defineProps<{
  title: string
  description: string
  offer: string // e.g. "$4.50", "1-for-1", "30% off"
  dates: string // e.g. "1 Dec to no end date"
  location: string
  terms: string // shown under a TERMS AND CONDITIONS heading; left out when there are none
  category: string // picks the food illustration when there is no photo
  photoUrl: string | null
  badge: string
  tone: CardTone
}>()

const food = computed(() =>
  foodKindFor({ category: props.category || 'FOOD', title: props.title }),
)
const muted = computed(() => props.tone === 'ended' || props.tone === 'removed')
</script>

<template>
  <article class="merchant-card" :class="{ 'merchant-card--muted': muted }">
    <div class="merchant-card__photo">
      <img v-if="photoUrl" :src="photoUrl" :alt="title" class="merchant-card__image" loading="lazy" />
      <div v-else class="merchant-card__placeholder">
        <FoodSprite :kind="food" large class="merchant-card__food" />
      </div>
      <span class="merchant-card__badge" :class="`merchant-card__badge--${tone}`">{{ badge }}</span>
    </div>
    <div class="merchant-card__body">
      <h4 class="merchant-card__title">{{ title }}</h4>
      <p v-if="description" class="merchant-card__description">{{ description }}</p>
      <p class="merchant-card__offer">
        <strong>{{ offer }}</strong><template v-if="offer && dates"> · </template>{{ dates }}
      </p>
      <p class="merchant-card__location">{{ location }}</p>
      <div v-if="terms.trim()" class="merchant-card__terms">
        <strong class="merchant-card__terms-title">TERMS AND CONDITIONS</strong>
        <p class="merchant-card__terms-text">{{ terms.trim() }}</p>
      </div>
      <slot />
      <div v-if="$slots.actions" class="merchant-card__actions">
        <slot name="actions" />
      </div>
    </div>
  </article>
</template>

<style scoped>
.merchant-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-card);
  background: var(--paper-white);
  color: var(--ink);
  box-shadow: 0 2px 8px rgb(27 27 31 / 0.06), 0 1px 2px rgb(27 27 31 / 0.03);
}

.merchant-card--muted {
  background: var(--paper-sunk);
}

/* Every card's picture is the same shape, so a row of cards lines up. */
.merchant-card__photo {
  position: relative;
  flex: none;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: var(--paper-sunk);
}

/* Ended and removed deals are faded. */
.merchant-card--muted .merchant-card__photo {
  opacity: 0.75;
}

.merchant-card__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.merchant-card__placeholder {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  background: linear-gradient(145deg, var(--sunny-wash), var(--paper-hover));
}

.merchant-card__food {
  width: 55%;
  max-width: 140px;
  aspect-ratio: 1;
}

.merchant-card__badge {
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  background: var(--paper-white);
  color: var(--ink);
  font-size: 0.75rem;
  font-weight: 700;
}

.merchant-card__badge--live {
  background: var(--coral);
  color: var(--on-ink);
}

.merchant-card__badge--scheduled {
  background: var(--ink-strong);
  color: var(--on-ink);
}

/* Dark text on yellow in both themes, like the app's yellow buttons (--ink turns light in dark
   mode). */
.merchant-card__badge--draft {
  background: var(--sunny);
  color: var(--on-accent);
}

.merchant-card__badge--removed {
  background: var(--tag-end-bg);
  color: var(--tag-end-ink);
}

.merchant-card__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 14px 16px 16px;
}

.merchant-card__body p {
  margin: 0;
  overflow-wrap: anywhere;
}

/* The title is the biggest text on the card. */
.merchant-card__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.25;
  overflow-wrap: anywhere;
  text-wrap: balance;
}

.merchant-card__description {
  color: var(--ink-muted);
  font-size: 0.875rem;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.merchant-card__offer,
.merchant-card__location {
  color: var(--ink-muted);
  font-size: 0.8rem;
}

.merchant-card__offer strong {
  color: var(--ink);
}

/* Terms keep the line breaks the merchant typed, one condition per line. */
.merchant-card__terms {
  color: var(--ink-muted);
  font-size: 0.8rem;
}

.merchant-card__terms-title {
  display: block;
  color: var(--ink);
  font-size: 0.7rem;
  letter-spacing: 0.04em;
}

.merchant-card__terms-text {
  white-space: pre-line;
}

/* Buttons sit at the bottom, so they line up across a row of cards. */
.merchant-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: auto;
  padding-top: 8px;
}
</style>
