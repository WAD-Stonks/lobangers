<script setup lang="ts">
import type { VenueDetailResponse } from '@broke-oclock/contracts/venues'
import { ApiClientError, api } from '@web/lib/api-client'
import PanelFrame from '@web/modules/map-shell/PanelFrame.vue'
import { browseLocation, dealLocation } from '@web/modules/map-shell/shell-routes'
import { endedLabel, initials, offerLabel } from '@web/modules/venues-feed/deal-format'
import VenueDealCard from '@web/modules/venues-feed/VenueDealCard.vue'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

// An outlet over the map: its live deals (each links to the deal panel), past deals and
// details, in three tabs. The map keeps the outlet's pin selected while this is open.
type VenueTab = 'now' | 'past' | 'about'
type LoadState = 'loading' | 'ready' | 'not-found' | 'error'

const TABS: readonly { value: VenueTab; label: string }[] = [
  { value: 'now', label: 'Now' },
  { value: 'past', label: 'Past' },
  { value: 'about', label: 'About' },
]

const route = useRoute()
const state = ref<LoadState>('loading')
const detail = ref<VenueDetailResponse | null>(null)
const tab = ref<VenueTab>('now')
let latestRequest = 0

const venueId = computed(() => String(route.params.venueId ?? ''))
const backTo = computed(() => browseLocation(route.query))
const title = computed(() => {
  if (detail.value) return detail.value.venue.name
  return state.value === 'not-found' ? 'Venue not found' : state.value === 'error' ? 'Unable to load this venue' : 'Loading venue'
})
const address = computed(() => {
  const venue = detail.value?.venue
  if (!venue) return ''
  return venue.postalCode ? `${venue.address}, Singapore ${venue.postalCode}` : venue.address
})

const load = async () => {
  const request = ++latestRequest
  state.value = 'loading'
  detail.value = null
  try {
    const data = await api.venues.get(venueId.value)
    if (request !== latestRequest) return
    detail.value = data
    state.value = 'ready'
  } catch (failure) {
    if (request !== latestRequest) return
    const code = failure instanceof ApiClientError ? failure.code : null
    state.value = code === 'NOT_FOUND' || code === 'BAD_REQUEST' ? 'not-found' : 'error'
  }
}

watch(venueId, () => {
  tab.value = 'now'
  void load()
}, { immediate: true })
</script>

<template>
  <PanelFrame :title="title" :back="backTo" :scroll-key="`${venueId}:${tab}`">
    <p v-if="state === 'loading'" class="lb-meta" role="status">Loading venue…</p>

    <div v-else-if="state === 'not-found'" class="lb-state" role="alert">
      <p class="lb-state__body">This venue does not exist or is no longer listed.</p>
      <RouterLink class="lb-btn lb-btn--ink" :to="backTo">See other deals</RouterLink>
    </div>

    <div v-else-if="state === 'error'" class="lb-state" role="alert">
      <p class="lb-state__body">Something went wrong. Please try again.</p>
      <button type="button" class="lb-btn lb-btn--ink" @click="load">Retry</button>
    </div>

    <template v-else-if="detail">
      <div class="venue-panel__intro">
        <span class="venue-panel__logo" aria-hidden="true">{{ initials(detail.venue.merchantName) }}</span>
        <span class="lb-meta lb-text-wrap">{{ address }}</span>
      </div>

      <div class="lb-tabs" role="tablist" aria-label="Venue sections">
        <button v-for="item in TABS" :id="`venue-tab-${item.value}`" :key="item.value" type="button" role="tab"
          class="lb-tab" :aria-selected="tab === item.value" aria-controls="venue-tabpanel" @click="tab = item.value">
          {{ item.label }}
        </button>
      </div>

      <div id="venue-tabpanel" role="tabpanel" :aria-labelledby="`venue-tab-${tab}`">
        <template v-if="tab === 'now'">
          <p v-if="detail.deals.length === 0" class="lb-meta">No ongoing deals at this venue right now.</p>
          <ul v-else class="venue-panel__cards" aria-label="Ongoing deals">
            <li v-for="deal in detail.deals" :key="deal.id">
              <RouterLink class="venue-panel__card-link" :to="dealLocation(route.query, deal.id, detail.venue.id)">
                <VenueDealCard :deal="deal" />
              </RouterLink>
            </li>
          </ul>
        </template>

        <template v-else-if="tab === 'past'">
          <p v-if="detail.pastDeals.length === 0" class="lb-meta">No past deals at this venue yet.</p>
          <ul v-else class="venue-panel__past" aria-label="Past deals">
            <li v-for="deal in detail.pastDeals" :key="deal.id" data-testid="venue-past-deal">
              <span class="venue-panel__past-text">
                <strong class="lb-text-wrap">{{ deal.title }}</strong>
                <span class="lb-meta">{{ endedLabel(deal) }}</span>
              </span>
              <span v-if="offerLabel(deal)" class="lb-tag lb-tag--new">{{ offerLabel(deal) }}</span>
            </li>
          </ul>
        </template>

        <dl v-else class="venue-panel__about">
          <div>
            <dt class="lb-meta">Address</dt>
            <dd class="lb-text-wrap">{{ address }}</dd>
          </div>
          <div v-if="detail.venue.area">
            <dt class="lb-meta">Area</dt>
            <dd>{{ detail.venue.area }}</dd>
          </div>
        </dl>
      </div>
    </template>
  </PanelFrame>
</template>

<style scoped>
.venue-panel__intro {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: calc(var(--space-2) * -1);
}

.venue-panel__logo {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 56px;
  height: 56px;
  font: 600 1.25rem/1 var(--font-display);
  background: var(--tint-food);
  border-radius: 18px;
}

.venue-panel__cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 9.5rem), 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.venue-panel__card-link {
  display: block;
  height: 100%;
  color: var(--ink);
  text-decoration: none;
  border-radius: var(--radius-control);
}

.venue-panel__card-link:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
}

.venue-panel__past {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.venue-panel__past li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 12px 0;
  border-bottom: 1px solid var(--hairline);
}

.venue-panel__past-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.venue-panel__about {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
}

.venue-panel__about dd {
  margin: 2px 0 0;
  font-weight: 600;
}
</style>
