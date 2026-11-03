<script setup lang="ts">
import TicketLoading from '@web/components/TicketLoading.vue'
import DealRowList from '@web/modules/browse-map/DealRowList.vue'
import FoodDealGrid from '@web/modules/browse-map/FoodDealGrid.vue'
import type { DealRow } from '@web/modules/browse-map/types'
import PanelFrame from '@web/modules/map-shell/PanelFrame.vue'
import { browseLocation, dealLocation } from '@web/modules/map-shell/shell-routes'
import { useShell } from '@web/modules/map-shell/shell-state'
import { endedLabel, initials, offerLabel } from '@web/modules/venues-feed/deal-format'
import { useVenueDetail } from '@web/modules/venues-feed/use-venue-detail'
import { toVenueDealRows } from '@web/modules/venues-feed/venue-deal-rows'
import { computed, ref, watch } from 'vue'
import { type LocationQueryValue, RouterLink, useRoute, useRouter } from 'vue-router'

// An outlet over the map: its live deals (each links to the deal panel), past deals and
// details, in three tabs. The map keeps the outlet's pin selected while this is open.
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

// The open tab lives in ?tab= (like the account panel) so a shared link or the back button lands
// on the same section. The default tab is left out of the URL.
const readTab = (value: LocationQueryValue | LocationQueryValue[] | undefined): VenueTab =>
  TABS.find((item) => item.value === value)?.value ?? DEFAULT_TAB
const tab = ref<VenueTab>(readTab(route.query.tab))

const venueId = computed(() => String(route.params.venueId ?? ''))
const { state, detail, reload: load } = useVenueDetail(venueId)
const backTo = computed(() => browseLocation(route.query))
const title = computed(() => {
  if (detail.value) return detail.value.venue.name
  return state.value === 'not-found' ? 'Venue not found' : state.value === 'error' ? 'Unable to load this venue' : 'Loading venue…'
})
const address = computed(() => {
  const venue = detail.value?.venue
  if (!venue) return ''
  return venue.postalCode ? `${venue.address}, Singapore ${venue.postalCode}` : venue.address
})

// Same cards as the browse list, reusing the map's loaded copy of each deal when it has one.
const rows = computed(() => {
  const venue = detail.value?.venue
  if (!venue) return []
  return toVenueDealRows(venue, detail.value?.deals ?? [], {
    deals: shell.deals.value,
    pin: shell.findVenuePin(venue.id),
    position: shell.position.value,
  })
})
const toDeal = (row: DealRow) => dealLocation(route.query, row.deal.id, row.venue.id)

const selectTab = (next: VenueTab) => {
  tab.value = next
  const rest = Object.fromEntries(Object.entries(route.query).filter(([key]) => key !== 'tab'))
  void router.replace({ query: next === DEFAULT_TAB ? rest : { ...rest, tab: next } })
}

// Arrow keys, Home and End move between tabs; only the selected tab sits in the Tab order.
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

      <div class="lb-tabs" role="tablist" aria-label="Venue sections" @keydown="onTabKeydown">
        <button v-for="item in TABS" :id="`venue-tab-${item.value}`" :key="item.value" type="button" role="tab"
          class="lb-tab" :aria-selected="tab === item.value" :tabindex="tab === item.value ? 0 : -1"
          aria-controls="venue-tabpanel" @click="selectTab(item.value)">
          {{ item.label }}
        </button>
      </div>

      <div id="venue-tabpanel" role="tabpanel" :aria-labelledby="`venue-tab-${tab}`">
        <template v-if="tab === 'now'">
          <p v-if="rows.length === 0" class="lb-meta">No ongoing deals at this venue right now.</p>
          <!-- On the map a venue's deals are a list, like the map's results; All Deals keeps cards. -->
          <DealRowList v-else-if="shell.view.value === 'map'" :rows="rows" :to="toDeal" test-id="venue-deals" />
          <FoodDealGrid v-else :rows="rows" :to="toDeal" two-column />
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
