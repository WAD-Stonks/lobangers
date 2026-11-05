<script setup lang="ts">
import TicketLoading from '@web/components/TicketLoading.vue'
import DealRowList from '@web/modules/browse-map/DealRowList.vue'
import FoodDealGrid from '@web/modules/browse-map/FoodDealGrid.vue'
import type { DealRow } from '@web/modules/browse-map/types'
import PanelFrame from '@web/modules/map-shell/PanelFrame.vue'
import { browseLocation, dealLocation, venueLocation } from '@web/modules/map-shell/shell-routes'
import { useShell } from '@web/modules/map-shell/shell-state'
import { endedLabel, initials, offerLabel } from '@web/modules/venues-feed/deal-format'
import { placeAddress, placeName, readPlaceIds } from '@web/modules/venues-feed/place'
import { useVenueDetails } from '@web/modules/venues-feed/use-venue-detail'
import { toVenueDealRows } from '@web/modules/venues-feed/venue-deal-rows'
import { computed, ref, watch } from 'vue'
import { type LocationQueryValue, RouterLink, useRoute, useRouter } from 'vue-router'

type VenueTab = 'now' | 'past' | 'about'

const TABS: readonly { value: VenueTab; label: string }[] = [
  { value: 'now', label: 'Now' },
  { value: 'past', label: 'Past' },
  { value: 'about', label: 'About' },
]

const DEFAULT_TAB: VenueTab = 'now'

const route = useRoute()
const router = useRouter()
const shell = useShell()

const readTab = (value: LocationQueryValue | LocationQueryValue[] | undefined): VenueTab =>
  TABS.find((item) => item.value === value)?.value ?? DEFAULT_TAB
const tab = ref<VenueTab>(readTab(route.query.tab))

const isPlace = computed(() => route.name === 'place')
const venueIds = computed<readonly string[]>(() =>
  isPlace.value ? readPlaceIds(route.params.venueIds) : [String(route.params.venueId ?? '')],
)
const venueId = computed(() => venueIds.value.join(','))
const { state, details, reload: load } = useVenueDetails(venueIds)
const venues = computed(() => details.value.map((item) => item.venue))
const detail = computed(() => details.value[0] ?? null)
const noun = computed(() => (isPlace.value ? 'place' : 'venue'))
const backTo = computed(() => browseLocation(route.query))
const title = computed(() => {
  if (detail.value) return isPlace.value ? placeName(venues.value) : detail.value.venue.name
  if (state.value === 'not-found') return isPlace.value ? 'Place not found' : 'Venue not found'
  return state.value === 'error' ? `Unable to load this ${noun.value}` : `Loading ${noun.value}…`
})
const address = computed(() => placeAddress(venues.value))
const logo = computed(() => initials(isPlace.value ? title.value : (detail.value?.venue.merchantName ?? '')))

const rows = computed(() => {
  const seen = new Set<string>()
  return details.value
    .flatMap((item) =>
      toVenueDealRows(item.venue, item.deals, {
        deals: shell.deals.value,
        pin: shell.findVenuePin(item.venue.id),
        position: shell.position.value,
      }),
    )
    .filter((row) => !seen.has(row.deal.id) && seen.add(row.deal.id))
})
const pastDeals = computed(() => {
  const seen = new Set<string>()
  return details.value
    .flatMap((item) => item.pastDeals)
    .filter((deal) => !seen.has(deal.id) && seen.add(deal.id))
})
const toDeal = (row: DealRow) => dealLocation(route.query, row.deal.id, row.venue.id)

const selectTab = (next: VenueTab) => {
  tab.value = next
  const rest = Object.fromEntries(Object.entries(route.query).filter(([key]) => key !== 'tab'))
  void router.replace({ query: next === DEFAULT_TAB ? rest : { ...rest, tab: next } })
}

const TAB_KEYS: Readonly<Record<string, (index: number) => number>> = {
  ArrowRight: (index) => (index + 1) % TABS.length,
  ArrowLeft: (index) => (index - 1 + TABS.length) % TABS.length,
  Home: () => 0,
  End: () => TABS.length - 1,
}
const onTabKeydown = (event: KeyboardEvent) => {
  const move = TAB_KEYS[event.key]
  if (!move) return
  event.preventDefault()
  const next = TABS[move(TABS.findIndex((item) => item.value === tab.value))]
  if (!next) return
  selectTab(next.value)
  document.getElementById(`venue-tab-${next.value}`)?.focus()
}

watch(() => route.query.tab, (value) => {
  tab.value = readTab(value)
})
watch(venueId, () => {
  tab.value = readTab(route.query.tab)
})
</script>

<template>
  <PanelFrame :title="title" :back="backTo" :scroll-key="`${venueId}:${tab}`">
    <TicketLoading v-if="state === 'loading'" class="lb-meta" label="Loading venue…" />

    <div v-else-if="state === 'not-found'" class="lb-state" role="alert">
      <p class="lb-state__body">This {{ noun }} does not exist or is no longer listed.</p>
      <RouterLink class="lb-btn lb-btn--ink" :to="backTo">See other deals</RouterLink>
    </div>

    <div v-else-if="state === 'error'" class="lb-state" role="alert">
      <p class="lb-state__body">Something went wrong. Please try again.</p>
      <button type="button" class="lb-btn lb-btn--ink" @click="load">Retry</button>
    </div>

    <template v-else-if="detail">
      <div class="venue-panel__intro">
        <span class="venue-panel__logo" aria-hidden="true">{{ logo }}</span>
        <span class="lb-meta lb-text-wrap">{{ address }}</span>
      </div>

      <div class="lb-tabs" role="tablist" :aria-label="isPlace ? 'Place sections' : 'Venue sections'" @keydown="onTabKeydown">
        <button v-for="item in TABS" :id="`venue-tab-${item.value}`" :key="item.value" type="button" role="tab"
          class="lb-tab" :aria-selected="tab === item.value" :tabindex="tab === item.value ? 0 : -1"
          aria-controls="venue-tabpanel" @click="selectTab(item.value)">
          {{ item.label }}
        </button>
      </div>

      <div id="venue-tabpanel" role="tabpanel" :aria-labelledby="`venue-tab-${tab}`">
        <template v-if="tab === 'now'">
          <p v-if="rows.length === 0" class="lb-meta">No ongoing deals at this {{ noun }} right now.</p>
          <DealRowList v-else-if="shell.view.value === 'map'" :rows="rows" :to="toDeal" test-id="venue-deals" />
          <FoodDealGrid v-else :rows="rows" :to="toDeal" two-column />
        </template>

        <template v-else-if="tab === 'past'">
          <p v-if="pastDeals.length === 0" class="lb-meta">No past deals at this {{ noun }} yet.</p>
          <ul v-else class="venue-panel__past" aria-label="Past deals">
            <li v-for="deal in pastDeals" :key="deal.id" data-testid="venue-past-deal">
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
          <div v-if="isPlace">
            <dt class="lb-meta">Outlets here</dt>
            <dd>
              <ul class="venue-panel__outlets">
                <li v-for="venue in venues" :key="venue.id">
                  <RouterLink class="lb-text-wrap" :to="venueLocation(route.query, venue.id)">{{ venue.name }}</RouterLink>
                </li>
              </ul>
            </dd>
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

.venue-panel__outlets {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.venue-panel__outlets a {
  color: inherit;
}
</style>
