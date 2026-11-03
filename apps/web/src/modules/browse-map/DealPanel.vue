<script setup lang="ts">
import { DEAL_CUISINE_LABELS, isDealCuisine } from '@broke-oclock/contracts/deal-cuisines'
import TicketLoading from '@web/components/TicketLoading.vue'
import { authClient } from '@web/lib/auth-client'
import { walkMinutesFor } from '@web/modules/browse-map/apply-filters'
import { categoryStyle } from '@web/modules/browse-map/category-style'
import DealGallery from '@web/modules/browse-map/DealGallery.vue'
import DealOutlets from '@web/modules/browse-map/DealOutlets.vue'
import DealRowList from '@web/modules/browse-map/DealRowList.vue'
import {
  dealFreshness,
  dealNoticeTags,
  formatCategory,
  formatValidity,
  OUTLET_NOT_CONFIRMED_NOTE,
  offerTypeTag,
  termsList,
} from '@web/modules/browse-map/deal-format'
import type { DealRow } from '@web/modules/browse-map/types'
import DealCommunity from '@web/modules/community/DealCommunity.vue'
import FlashClaimCard from '@web/modules/flash-drop/FlashClaimCard.vue'
import { useFlashDrops } from '@web/modules/flash-drop/use-flash-drops'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import PanelFrame from '@web/modules/map-shell/PanelFrame.vue'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import {
  browseLocation,
  dealLocation,
  lobbieLocation,
  venueLocation,
} from '@web/modules/map-shell/shell-routes'
import { useShell } from '@web/modules/map-shell/shell-state'
import { useBreakpoint } from '@web/modules/map-shell/use-breakpoint'
import { useSavedDeals } from '@web/modules/map-shell/use-saved-deals'
import { useToast } from '@web/modules/map-shell/use-toast'
import SquadDealCta from '@web/modules/squad/SquadDealCta.vue'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

// One deal, opened from a pin, a row or the hot card. Details scroll; Save and Get directions
// stay in the sticky bar. Votes, comments and reports belong to the community module.
const props = defineProps<{ dialog?: boolean }>()
const shell = useShell()
const saved = useSavedDeals()
const flash = useFlashDrops()
const toast = useToast()
const session = authClient.useSession()
const route = useRoute()
const router = useRouter()
const breakpoint = useBreakpoint()

const SAVE_VIBRATE_MS = 10
const DIRECTIONS_URL = 'https://www.google.com/maps/dir/?api=1&destination='

const dealId = computed(() => String(route.params.dealId ?? ''))
const commentsOpen = ref(false)
watch(dealId, () => { commentsOpen.value = false })
const venueId = computed(() => (typeof route.query.at === 'string' ? route.query.at : null))
const selected = computed(() => shell.findDeal(dealId.value, venueId.value))
// A Flash Drop running for this deal right now, if any.
const flashDrop = computed(() => flash?.liveForDeal(dealId.value) ?? null)
// A deal opened from Lobbie's chat goes back to the chat; one opened from a Makan Squad room
// goes back to the room (and hides links to other deals, which the room has locked); anything
// else goes back to the list.
const fromLobbie = computed(() => route.query.from === 'lobbie')
const squadRoom = computed(() =>
  route.query.from === 'squad' && typeof route.query.room === 'string' && /^[A-Z]{4}$/.test(route.query.room)
    ? route.query.room
    : null,
)
const backTo = computed(() => {
  if (squadRoom.value) return { name: 'squad-room', params: { code: squadRoom.value } }
  return fromLobbie.value ? lobbieLocation(route.query) : browseLocation(route.query)
})
const backLabel = computed(() => {
  if (squadRoom.value) return `Back to Room ${squadRoom.value}`
  return fromLobbie.value ? 'Back to Lobbie' : 'Back to results'
})
const popKey = ref(0)

const isSaved = computed(() => (selected.value ? saved.isSaved(selected.value.deal.id) : false))
const terms = computed(() => (selected.value ? termsList(selected.value.deal.terms) : []))
const cuisineLabel = computed(() => {
  const cuisine = selected.value?.deal.cuisine ?? ''
  return isDealCuisine(cuisine) ? DEAL_CUISINE_LABELS[cuisine] : null
})
const photosShown = ref(false)
// Transitional public readers may still provide only the legacy thumbnail fields.
const photos = computed(() => {
  const deal = selected.value?.deal
  if (!deal) return []
  return deal.images.length ? deal.images : deal.imageUrl
    ? [{ url: deal.imageUrl, alt: deal.imageAltText ?? null }]
    : []
})
const freshness = computed(() => (selected.value ? dealFreshness(selected.value.deal) : null))
const freshnessClass = computed(() =>
  freshness.value
    ? [
        `lb-tag--${freshness.value.tone}`,
        {
          'deal-panel__expired': freshness.value.label === 'Expired',
          'deal-panel__conflicting': freshness.value.label === 'Mixed reports',
        },
      ]
    : [],
)
const phone = computed(() => breakpoint.value === 'phone')
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

const undoUnsave = (id: string) => {
  saved.toggle(id).catch((error: unknown) => {
    console.error('Could not restore saved deal', error)
    toast.show('Could not restore that deal. Try again.', { tone: 'error' })
  })
}

const toggleSave = async () => {
  const deal = selected.value?.deal
  if (!deal) return
  if (!session.value.data) {
    await router.push({ name: 'auth-required', query: { ...route.query, tab: 'profile', redirect: route.fullPath } })
    return
  }
  const wasSaved = isSaved.value
  // Only saving celebrates; removing just drains the fill.
  if (!wasSaved) {
    popKey.value += 1
    buzz()
  }
  // Never locked: taps queue per deal in useSavedDeals, and the toast confirms at once
  // because the icon already shows the result.
  const request = saved.toggle(deal.id)
  toast.show(wasSaved ? 'Removed from saved' : 'Saved', wasSaved ? { action: { label: 'Undo', run: () => undoUnsave(deal.id) } } : {})
  try {
    await request
  } catch (error) {
    console.error('Could not update saved deal', error)
    toast.show(
      errorCode(error) === 'UNAUTHORIZED' ? 'Log in again to save deals.' : 'Could not update your saved deals. Try again.',
      { tone: 'error' },
    )
  }
}
</script>

<template>
  <PanelFrame
    v-if="selected"
    class="deal-panel"
    :class="{ 'deal-panel--dialog': props.dialog, 'deal-panel--phone': phone, 'deal-panel--comments': commentsOpen, 'deal-panel--no-image': !photosShown }"
    :title="commentsOpen ? 'Comments' : selected.deal.title"
    :hide-title="commentsOpen"
    :back="commentsOpen || props.dialog ? null : backTo"
    :back-label="backLabel"
    :scroll-key="`${selected.deal.id}:${selected.venue.id}`"
  >
    <template v-if="commentsOpen" #heading>
      <button type="button" class="deal-panel__comments-back deal-community-text-button" @click="commentsOpen = false"><ShellIcon name="back" :size="16" />Back to deal</button>
    </template>
    <template v-if="!commentsOpen" #beforeHeading>
    <div v-show="photosShown" class="deal-panel__media" :style="{ '--hero-tint': categoryStyle(selected.deal.category).tint }">
      <DealGallery
        :key="selected.deal.id"
        :images="photos"
        :title="selected.deal.title"
        @showing="photosShown = $event"
      />
    </div>

    <div v-if="!phone" class="deal-panel__status">
      <span v-if="freshness" class="lb-tag" :class="freshnessClass">{{ freshness.label }}</span>
    </div>
    </template>

    <template v-if="!commentsOpen">
    <div class="deal-panel__headline">
      <RouterLink class="deal-panel__venue" :to="venueLocation(route.query, selected.venue.id)">
        {{ selected.venue.name }}
      </RouterLink>
    </div>

    <FlashClaimCard v-if="flashDrop" :drop="flashDrop" />

    <div class="deal-panel__tags">
      <!-- Phones read top-down, so freshness joins the facts here instead of sitting alone above the title. -->
      <span v-if="phone && freshness" class="lb-tag" :class="freshnessClass">{{ freshness.label }}</span>
      <!-- With a photo in the hero, these move here so they never cover the poster's text. -->
      <template v-if="heroTags.length">
        <span v-for="tag in heroTags" :key="tag" class="lb-tag lb-tag--new">{{ tag }}</span>
      </template>
      <span v-if="offerTypeTag(selected.deal.offerType)" class="lb-tag lb-tag--new">{{ offerTypeTag(selected.deal.offerType) }}</span>
      <span v-for="notice in dealNoticeTags(selected.deal)" :key="notice.label" class="lb-tag" :class="`lb-tag--${notice.tone}`">{{ notice.label }}</span>
    </div>

    <p v-if="selected.deal.outletUnconfirmed" class="deal-panel__outlet-note lb-meta">{{ OUTLET_NOT_CONFIRMED_NOTE }}</p>

    <SquadDealCta :deal-id="selected.deal.id" />

    <div class="deal-panel__fine-print">
      <dl class="deal-panel__validity-field">
        <dt class="lb-meta">Valid</dt>
        <dd>{{ formatValidity(selected.deal.validUntil, selected.deal.rawValidityText, selected.deal.limitedTime) }}</dd>
      </dl>
    <section class="deal-panel__conditions" aria-labelledby="deal-conditions-title">
      <h2 id="deal-conditions-title">Terms and conditions</h2>
      <ul v-if="terms.length" class="deal-panel__terms" data-testid="deal-terms">
        <li v-for="point in terms" :key="point" class="lb-text-wrap">{{ point }}</li>
      </ul>
      <p v-else class="lb-meta">No additional terms and conditions provided.</p>
    </section>
    </div>
    </template>

    <DealCommunity :deal-id="selected.deal.id" :all-comments="commentsOpen" :explanation-popup="props.dialog" @view-change="commentsOpen = $event" @updated="shell.reload" />

    <template v-if="!commentsOpen && !squadRoom">
    <DealOutlets
      :heading="props.dialog ? 'Participating outlets' : undefined"
      :deal="selected.deal"
      :current-venue-id="selected.venue.id"
      :position="shell.position.value"
      :to="toOutlet"
      @hover="shell.setHovered"
    />

    <section v-if="otherRows.length" aria-labelledby="deal-more-title">
      <h2 id="deal-more-title" class="deal-panel__label">More at {{ selected.venue.name }}</h2>
      <DealRowList :rows="otherRows" :to="toRow" compact test-id="same-outlet-rows" @hover="shell.setHovered" />
    </section>
    </template>

    <template v-if="!commentsOpen" #actions>
      <button
        type="button"
        class="lb-btn"
        :class="{ 'lb-btn--ink': isSaved }"
        :aria-pressed="isSaved"
        data-testid="save-deal"
        @click="toggleSave"
      >
        <span :key="popKey" class="deal-panel__save-icon" :class="{ 'is-popping': popKey > 0, 'is-filled': isSaved }">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">
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

  <PanelFrame v-else-if="shell.status.value === 'loading'" title="Loading deal…" :back="backTo" :back-label="backLabel">
    <div class="lb-skeleton deal-panel__hero" aria-hidden="true" />
    <TicketLoading label="Loading this deal…" />
  </PanelFrame>

  <PanelFrame v-else :title="shell.status.value === 'error' ? 'Unable to load deals' : 'Deal not found'" :back="backTo" :back-label="backLabel">
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
.deal-panel :deep(.panel-frame__actions) {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
}

.deal-panel :deep(.panel-frame__actions > .lb-btn) {
  flex: 0 0 auto;
  width: auto;
}

/* Phones: the bar spans the sheet, so Get directions takes the space Save leaves. */
@media (max-width: 767.98px) {
  .deal-panel :deep(.panel-frame__actions) {
    flex-wrap: nowrap;
  }

  .deal-panel :deep(.panel-frame__actions > .lb-btn:last-child) {
    flex: 1 1 auto;
  }
}

/* Phones, in the map sheet and the All deals popup alike, read top-down: what it is, where, when
   it's valid, then the photo (capped so it gives way first, as in the Squad room), the fine
   print, and only then the extras. The Squad card is the darkest thing on the page, so it waits
   until after the terms instead of outshouting the deal. The doubled class outranks the popup's
   own order and poster rules. */
.deal-panel.deal-panel--phone :deep(.panel-frame__body > *) {
  order: 9;
}

.deal-panel.deal-panel--phone :deep(.panel-frame__body > .panel-frame__back),
.deal-panel.deal-panel--phone :deep(.panel-frame__body > .panel-frame__heading),
.deal-panel.deal-panel--phone :deep(.panel-frame__body > .deal-panel__headline),
.deal-panel.deal-panel--phone :deep(.panel-frame__body > .deal-panel__tags) {
  order: 0;
}

.deal-panel.deal-panel--phone :deep(.panel-frame__body > .deal-panel__fine-print) {
  display: contents;
}

.deal-panel.deal-panel--phone :deep(.panel-frame__body .deal-panel__validity-field),
.deal-panel.deal-panel--phone :deep(.panel-frame__body > .deal-panel__outlet-note) {
  order: 1;
}

.deal-panel.deal-panel--phone :deep(.panel-frame__body > .flash-claim),
.deal-panel.deal-panel--phone :deep(.panel-frame__body > .deal-panel__media) {
  order: 2;
}

.deal-panel.deal-panel--phone :deep(.panel-frame__body .deal-panel__conditions) {
  order: 3;
}

.deal-panel.deal-panel--phone :deep(.panel-frame__body > .squad-cta) {
  order: 4;
}

/* The poster sits in a quiet neutral frame sized to the photo, instead of floating with blank
   sides (or, in the popup, above an empty band). */
.deal-panel.deal-panel--phone :deep(.deal-gallery) {
  height: auto;
  max-height: min(240px, 34vh);
  aspect-ratio: var(--frame-ratio);
  background: var(--paper-sunk);
  border-radius: 18px;
}

.deal-panel:not(.deal-panel--dialog) :deep(.panel-frame__title) {
  color: var(--coral-deep);
  font-size: clamp(1.8rem, 3vw, 2.125rem);
  line-height: 1.2;
}
.deal-panel:not(.deal-panel--dialog) :deep(.panel-frame__heading) { margin-bottom: -8px; }
.deal-panel:not(.deal-panel--dialog) .deal-panel__status { margin-bottom: -10px; }
.deal-panel :deep(.deal-gallery) { border-radius: 0; background: transparent; }
.deal-panel :deep(.deal-photo__img) { object-fit: contain; object-position: center top; }

/* biome-ignore lint/style/noDescendingSpecificity: the earlier, more specific rule is a modifier override for a different state of the same element */
.deal-panel__status {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.deal-panel__validity-field {
  margin: 0 0 18px;
}

.deal-panel__validity-field dd {
  margin: 4px 0 0;
  font-weight: 600;
}

.deal-panel__conditions {
  padding: 20px;
  background: var(--sunny-wash);
  border-radius: 18px;
}

.deal-panel__conditions h2 {
  margin: 0 0 12px;
  color: var(--ink);
  font-size: 1.125rem;
  font-weight: 700;
}

.deal-panel__conditions p {
  margin: 0;
}

.deal-panel__conflicting { color: var(--tag-end-ink); background: var(--tag-end-bg); }

.deal-panel__expired {
  color: var(--coral-deep);
}

.deal-panel__comments-back { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 8px 0; border: 0; border-radius: 4px; background: transparent; color: var(--ink-muted); font: 600 0.875rem/1.5 var(--font-sans); cursor: pointer; }
.deal-panel__comments-back:focus-visible { outline: 3px solid var(--coral-deep); outline-offset: 3px; }
.deal-panel__media {
  display: flex;
  flex-direction: column;
  flex: none;
}

.deal-panel__headline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  margin-top: var(--space-1);
}

.deal-panel__venue {
  min-width: 0;
  font-weight: 600;
  color: var(--ink);
  overflow-wrap: anywhere;
  text-underline-offset: 3px;
}



.deal-panel__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.deal-panel__outlet-note {
  margin: 0;
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

.deal-panel__save-icon svg {
  fill-opacity: 0;
  transition: fill-opacity var(--dur-small) var(--ease-out);
}

.deal-panel__save-icon.is-filled svg {
  fill-opacity: 1;
}

.deal-panel__save-icon.is-popping {
  animation: shell-pop 220ms var(--ease-out);
}

/* Phones (sheet and popup): one loud thing (the coral title), then quieter layers under it. The
   outlet is a secondary line, not a second heading; validity reads as one fact row; section
   headings share one size with the community sections below. */
.deal-panel.deal-panel--phone :deep(.panel-frame__title) {
  font-size: 1.5rem;
}

.deal-panel.deal-panel--phone .deal-panel__venue {
  font-weight: 500;
  color: var(--ink-muted);
  text-decoration-color: var(--hairline-strong);
  text-decoration-thickness: 1px;
}

.deal-panel.deal-panel--phone .deal-panel__validity-field {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  font-size: var(--text-sm);
}

.deal-panel.deal-panel--phone .deal-panel__validity-field dd {
  margin: 0;
}

.deal-panel.deal-panel--phone .deal-panel__conditions {
  padding: 16px;
}

.deal-panel.deal-panel--phone .deal-panel__conditions h2 {
  margin-bottom: 8px;
  font-size: 1rem;
}

.deal-panel.deal-panel--phone .deal-panel__terms {
  font-size: var(--text-sm);
}

@media (prefers-reduced-motion: reduce) {
  .deal-panel__save-icon.is-popping {
    animation: none;
  }
}
</style>
