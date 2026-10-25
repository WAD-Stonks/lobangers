<script setup lang="ts">
import { DEAL_CUISINE_LABELS, isDealCuisine } from '@broke-oclock/contracts/deal-cuisines'
import { authClient } from '@web/lib/auth-client'
import { walkMinutesFor } from '@web/modules/browse-map/apply-filters'
import CategoryBubble from '@web/modules/browse-map/CategoryBubble.vue'
import { categoryStyle } from '@web/modules/browse-map/category-style'
import DealGallery from '@web/modules/browse-map/DealGallery.vue'
import DealOutlets from '@web/modules/browse-map/DealOutlets.vue'
import DealRowList from '@web/modules/browse-map/DealRowList.vue'
import {
  dealFreshness,
  formatCategory,
  formatValidity,
  priceText,
  termsList,
} from '@web/modules/browse-map/deal-format'
import { OFFER_TYPE_LABELS } from '@web/modules/browse-map/filters'
import type { DealRow } from '@web/modules/browse-map/types'
import DealCommunity from '@web/modules/community/DealCommunity.vue'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import PanelFrame from '@web/modules/map-shell/PanelFrame.vue'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { browseLocation, dealLocation, venueLocation } from '@web/modules/map-shell/shell-routes'
import { useShell } from '@web/modules/map-shell/shell-state'
import { useSavedDeals } from '@web/modules/map-shell/use-saved-deals'
import { useToast } from '@web/modules/map-shell/use-toast'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

// One deal, opened from a pin, a row or the hot card. Details scroll; Save and Get directions
// stay in the sticky bar. Votes, comments and reports belong to the community module.
const shell = useShell()
const saved = useSavedDeals()
const toast = useToast()
const session = authClient.useSession()
const route = useRoute()
const router = useRouter()

const SAVE_VIBRATE_MS = 10
const DIRECTIONS_URL = 'https://www.google.com/maps/dir/?api=1&destination='

const dealId = computed(() => String(route.params.dealId ?? ''))
const commentsOpen = ref(false)
watch(dealId, () => { commentsOpen.value = false })
const venueId = computed(() => (typeof route.query.at === 'string' ? route.query.at : null))
const selected = computed(() => shell.findDeal(dealId.value, venueId.value))
const backTo = computed(() => browseLocation(route.query))
const saving = ref(false)
const popKey = ref(0)

const isSaved = computed(() => (selected.value ? saved.isSaved(selected.value.deal.id) : false))
const price = computed(() => (selected.value ? priceText(selected.value.deal) : null))
const terms = computed(() => (selected.value ? termsList(selected.value.deal.terms) : []))
const cuisineLabel = computed(() => {
  const cuisine = selected.value?.deal.cuisine ?? ''
  return isDealCuisine(cuisine) ? DEAL_CUISINE_LABELS[cuisine] : null
})
const photosShown = ref(false)
const freshness = computed(() => (selected.value ? dealFreshness(selected.value.deal) : null))
const walkLabel = computed(() =>
  selected.value?.distanceMetres == null ? null : `${walkMinutesFor(selected.value.distanceMetres)} min walk`,
)
const heroTags = computed(() =>
  selected.value
    ? [formatCategory(selected.value.deal.category), cuisineLabel.value, walkLabel.value].filter(
        (tag): tag is string => Boolean(tag),
      )
    : [],
)
const directionsUrl = computed(() =>
  selected.value ? `${DIRECTIONS_URL}${selected.value.venue.lat},${selected.value.venue.lng}` : '#',
)
const otherRows = computed<readonly DealRow[]>(() => {
  const current = selected.value
  if (!current) return []
  return current.venue.deals
    .filter((deal) => deal.id !== current.deal.id)
    // The section is about this one outlet, so no row offers the deal's other outlets.
    .map((deal) => ({
      key: `${deal.id}:${current.venue.id}`,
      deal,
      venue: current.venue,
      distanceMetres: current.distanceMetres,
      outletCount: 1,
    }))
})
const toRow = (row: DealRow) => dealLocation(route.query, row.deal.id, row.venue.id)
const toOutlet = (outletId: string) => dealLocation(route.query, dealId.value, outletId)

const buzz = () => {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(SAVE_VIBRATE_MS)
}

const toggleSave = async () => {
  const deal = selected.value?.deal
  if (!deal || saving.value) return
  if (!session.value.data) {
    await router.push({ name: 'login', query: { redirect: route.fullPath } })
    return
  }
  const wasSaved = isSaved.value
  saving.value = true
  popKey.value += 1
  if (!wasSaved) buzz()
  try {
    await saved.toggle(deal.id)
    toast.show(wasSaved ? 'Removed from saved' : 'Saved')
  } catch (error) {
    toast.show(
      errorCode(error) === 'UNAUTHORIZED' ? 'Log in again to save deals.' : 'Could not update your saved deals. Try again.',
      { tone: 'error' },
    )
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <PanelFrame
    v-if="selected"
    :title="commentsOpen ? 'Comments' : selected.deal.title"
    :hide-title="commentsOpen"
    :back="commentsOpen ? null : backTo"
    back-label="Back to results"
    :scroll-key="selected.deal.id"
  >
    <template v-if="commentsOpen" #heading>
      <button type="button" class="deal-panel__comments-back deal-community-text-button" @click="commentsOpen = false"><ShellIcon name="back" :size="16" />Back to deal</button>
    </template>
    <template v-if="!commentsOpen">
    <div class="deal-panel__media" :style="{ '--hero-tint': categoryStyle(selected.deal.category).tint }">
      <DealGallery
        :key="selected.deal.id"
        :images="selected.deal.images"
        :title="selected.deal.title"
        @showing="photosShown = $event"
      >
        <template #fallback>
          <div class="deal-panel__hero">
            <CategoryBubble
              class="deal-panel__hero-icon"
              :category="selected.deal.category"
              :title="selected.deal.title"
              :venue="selected.venue.name"
              size="lg"
              animated
            />
            <span v-for="tag in heroTags" :key="tag" class="lb-tag lb-tag--paper">{{ tag }}</span>
          </div>
        </template>
      </DealGallery>
    </div>

    <div class="deal-panel__headline">
      <RouterLink class="deal-panel__venue" :to="venueLocation(route.query, selected.venue.id)">
        {{ selected.venue.name }}
      </RouterLink>
      <span v-if="price" class="lb-price deal-panel__price" data-testid="deal-price">{{ price }}</span>
    </div>

    <div class="deal-panel__tags">
      <!-- With a photo in the hero, these move here so they never cover the poster's text. -->
      <template v-if="photosShown">
        <span v-for="tag in heroTags" :key="tag" class="lb-tag">{{ tag }}</span>
      </template>
      <span v-if="freshness" class="lb-tag" :class="`lb-tag--${freshness.tone}`">{{ freshness.label }}</span>
      <span class="lb-tag lb-tag--new">{{ OFFER_TYPE_LABELS[selected.deal.offerType] }}</span>
    </div>

    <p v-if="selected.deal.description" class="deal-panel__description lb-text-wrap">{{ selected.deal.description }}</p>

    <dl class="deal-panel__facts">
      <div>
        <dt class="lb-meta">Valid</dt>
        <dd>{{ formatValidity(selected.deal.validUntil, selected.deal.rawValidityText) }}</dd>
      </div>
      <div>
        <dt class="lb-meta">Deal type</dt>
        <dd>{{ OFFER_TYPE_LABELS[selected.deal.offerType] }}</dd>
      </div>
      <div v-if="terms.length" class="deal-panel__fact-wide">
        <dt class="lb-meta">Terms</dt>
        <dd>
          <ul class="deal-panel__terms" data-testid="deal-terms">
            <li v-for="point in terms" :key="point" class="lb-text-wrap">{{ point }}</li>
          </ul>
        </dd>
      </div>
    </dl>
    </template>

    <DealCommunity :deal-id="selected.deal.id" :all-comments="commentsOpen" @view-change="commentsOpen = $event" @updated="shell.reload" />

    <template v-if="!commentsOpen">
    <DealOutlets
      :deal="selected.deal"
      :current-venue-id="selected.venue.id"
      :position="shell.position.value"
      :to="toOutlet"
      @hover="shell.setHovered"
    />

    <section v-if="otherRows.length" aria-labelledby="deal-more-title">
      <h2 id="deal-more-title" class="deal-panel__label">More at {{ selected.venue.name }}</h2>
      <DealRowList :rows="otherRows" :to="toRow" test-id="same-outlet-rows" @hover="shell.setHovered" />
    </section>
    </template>

    <template v-if="!commentsOpen" #actions>
      <button
        type="button"
        class="lb-btn"
        :class="{ 'lb-btn--ink': isSaved }"
        :aria-pressed="isSaved"
        :disabled="saving"
        data-testid="save-deal"
        @click="toggleSave"
      >
        <span :key="popKey" class="deal-panel__save-icon" :class="{ 'is-popping': popKey > 0 }">
          <svg width="18" height="18" viewBox="0 0 24 24" :fill="isSaved ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">
            <path d="M6 4h12v17l-6-4-6 4z" />
          </svg>
        </span>
        {{ isSaved ? 'Saved' : 'Save' }}
      </button>
      <a class="lb-btn lb-btn--primary" :href="directionsUrl" target="_blank" rel="noopener noreferrer">
        <ShellIcon name="directions" :size="18" />Get directions
      </a>
    </template>
  </PanelFrame>

  <PanelFrame v-else-if="shell.status.value === 'loading'" title="Loading deal" :back="backTo" back-label="Back to results">
    <div class="lb-skeleton deal-panel__hero" aria-hidden="true" />
    <p class="lb-meta" role="status">Loading this deal…</p>
  </PanelFrame>

  <PanelFrame v-else title="Deal not found" :back="backTo" back-label="Back to results">
    <div class="lb-state" :role="shell.status.value === 'error' ? 'alert' : undefined">
      <p class="lb-state__body">
        {{ shell.status.value === 'error' ? 'Deals could not be loaded right now.' : 'This deal has ended or is no longer listed.' }}
      </p>
      <button v-if="shell.status.value === 'error'" type="button" class="lb-btn lb-btn--ink" @click="shell.reload">Try again</button>
      <RouterLink v-else class="lb-btn lb-btn--ink" :to="backTo">See other deals</RouterLink>
    </div>
  </PanelFrame>
</template>

<style scoped>
.deal-panel__comments-back { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 8px 0; border: 0; border-radius: 4px; background: transparent; color: var(--ink-muted); font: 600 0.875rem/1.5 var(--font-sans); cursor: pointer; }
.deal-panel__comments-back:focus-visible { outline: 3px solid var(--coral-deep); outline-offset: 3px; }
.deal-panel__hero {
  position: relative;
  display: flex;
  flex: none;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-2);
  aspect-ratio: 16 / 6;
  padding: 12px;
  background: var(--hero-tint, var(--paper-sunk));
  border-radius: 22px;
}

.deal-panel__media {
  display: flex;
  flex-direction: column;
  flex: none;
}

/* No deal photos: the category icon, styled like its map pin, fills the hero. */
.deal-panel__hero-icon {
  position: absolute;
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%);
}

.deal-panel__headline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  margin-top: calc(var(--space-2) * -1);
}

.deal-panel__venue {
  min-width: 0;
  font-weight: 600;
  color: var(--ink);
  overflow-wrap: anywhere;
  text-underline-offset: 3px;
}

.deal-panel__price {
  flex: none;
  max-width: 50%;
  font-size: 2rem;
  text-align: right;
  white-space: normal;
  overflow-wrap: anywhere;
}

.deal-panel__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.deal-panel__description {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.55;
  white-space: pre-line;
}

.deal-panel__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
  font-size: 0.875rem;
}

.deal-panel__facts dd {
  margin: 2px 0 0;
  font-weight: 600;
}

.deal-panel__fact-wide {
  grid-column: 1 / -1;
}

/* Fine print reads better at regular weight; only the short facts are bold. */
.deal-panel__fact-wide dd {
  font-weight: 400;
  line-height: 1.5;
}

/* One condition per line, so the fine print scans instead of reading as a paragraph. */
.deal-panel__terms {
  display: grid;
  gap: 4px;
  margin: 0;
  padding-left: 1.1em;
}

.deal-panel__terms li::marker {
  color: var(--ink-muted);
}

.deal-panel__label {
  margin: 0 0 var(--space-1);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.deal-panel__save-icon {
  display: inline-flex;
}

.deal-panel__save-icon.is-popping {
  animation: shell-pop 220ms var(--ease-out);
}

@media (prefers-reduced-motion: reduce) {
  .deal-panel__save-icon.is-popping {
    animation: none;
  }
}
</style>
