<script setup lang="ts">
import type { DealPin } from '@broke-oclock/contracts/deals'
import { authClient } from '@web/lib/auth-client'
import FoodDealCard from '@web/modules/browse-map/FoodDealCard.vue'
import type { DealRow } from '@web/modules/browse-map/types'
import { regions } from '@web/modules/landing/deals'
import { landingDealLink, venuesInRegion } from '@web/modules/landing/live-deals'
import type { LandingDealsStatus } from '@web/modules/landing/use-landing-deals'
import { provideSavedDeals } from '@web/modules/map-shell/use-saved-deals'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

const emit = defineEmits<{ retry: [] }>()
// The cards are the All Deals page's, and their save buttons need the visitor's saved deals.
provideSavedDeals(authClient.useSession())
const cuisine = ref('All Cuisines')
const area = ref('all')
const props = defineProps<{ live: DealPin[]; liveState: LandingDealsStatus }>()
const cuisines = computed(() => ['All Cuisines', ...new Set(props.live.map((deal) => deal.cuisine ?? 'Others'))])
const selectedRegion = computed(() => regions[Number(area.value)]?.name)
const cardVenue = (deal: DealPin) =>
  area.value === 'all' ? deal.venues[0] : selectedRegion.value ? venuesInRegion(deal, selectedRegion.value)[0] : undefined
const filtered = computed(() =>
  props.live.filter(
    (deal) =>
      (cuisine.value === 'All Cuisines' || (deal.cuisine ?? 'Others') === cuisine.value) &&
      (area.value === 'all' || (selectedRegion.value && venuesInRegion(deal, selectedRegion.value).length > 0)),
  ),
)
const page = ref(0)
// One row of cards per page, as many as fit at a comfortable card width (two to five), so cards
// never balloon on a narrower screen or turn skinny on a wide one.
const CARD_MIN_PX = 210
const CARD_GAP_PX = 20
const grid = ref<HTMLElement | null>(null)
const pageSize = ref(5)
let resizer: ResizeObserver | undefined
const fitColumns = (width: number) => {
  const next = Math.min(5, Math.max(2, Math.floor((width + CARD_GAP_PX) / (CARD_MIN_PX + CARD_GAP_PX))))
  if (next === pageSize.value) return
  // Keep the first card on screen in view when the page size changes.
  page.value = Math.floor((page.value * pageSize.value) / next)
  pageSize.value = next
}
onMounted(() => {
  if (typeof ResizeObserver === 'undefined') return
  resizer = new ResizeObserver(([entry]) => entry && fitColumns(entry.contentRect.width))
  watch(grid, (el, old) => { if (old) resizer?.unobserve(old); if (el) resizer?.observe(el) }, { immediate: true })
})
onBeforeUnmount(() => resizer?.disconnect())
let touchStart: { x: number; y: number } | null = null
const startSwipe = (event: TouchEvent) => {
  const touch = event.touches[0]
  touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null
}
const endSwipe = (event: TouchEvent) => {
  const start = touchStart
  touchStart = null
  const touch = event.changedTouches[0]
  if (!start || !touch) return
  const dx = start.x - touch.clientX
  const dy = start.y - touch.clientY
  if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return
  const next = Math.max(0, Math.min(pageCount.value - 1, page.value + (dx > 0 ? 1 : -1)))
  if (next === page.value) return
  if (event.cancelable) event.preventDefault()
  page.value = next
}
const pageCount = computed(() => Math.ceil(filtered.value.length / pageSize.value))
const visibleDeals = computed(() => filtered.value.slice(page.value * pageSize.value, (page.value + 1) * pageSize.value))
// Each card shows the deal at the outlet the region filter picked (its first outlet otherwise).
// A deal with no listed outlet still shows, named as such, and links to the deal alone.
const NO_OUTLET = { id: '', name: 'Restaurant details unavailable', lat: 0, lng: 0 }
const visibleRows = computed<DealRow[]>(() =>
  visibleDeals.value.map((deal) => ({
    key: deal.id,
    deal,
    venue: { ...(cardVenue(deal) ?? NO_OUTLET), deals: [deal] },
    distanceMetres: null,
    outletCount: deal.venues.length,
  })),
)
const rowLink = (row: DealRow) => (row.venue.id ? landingDealLink(row.deal, row.venue.id) : `/deals/${row.deal.id}?view=list&discovery=1`)
watch(filtered, () => { page.value = 0 }, { flush: 'sync' })
</script>

<template>
  <section id="cuisines" class="cuisine-discovery" aria-labelledby="cuisine-heading">
    <header class="cuisine-intro" data-reveal>
      <h2 id="cuisine-heading"><span class="cuisine-heading-question">Craving something?</span><span class="cuisine-heading-offer">We've got some lobangs for you.</span></h2>
    </header>
    <div class="deal-grid-toolbar">
      <p v-if="liveState === 'ready'" role="status">
        <strong>{{ filtered.length }}</strong> current {{ filtered.length === 1 ? 'deal' : 'deals' }}
      </p>
      <RouterLink class="landing-view-all" to="/deals?cat=food"><span>View all food deals</span><span aria-hidden="true">→</span></RouterLink>
      <div>
        <label for="deal-area" class="visually-hidden">Filter deals by region</label>
        <select id="deal-area" v-model="area" :disabled="liveState !== 'ready'">
          <option value="all">All regions</option>
          <option v-for="(item, index) in regions" :key="item.name" :value="String(index)">{{ item.name }}</option>
        </select>
        <label for="deal-cuisine" class="visually-hidden">Filter deals by cuisine</label>
        <select id="deal-cuisine" v-model="cuisine" :disabled="liveState !== 'ready'">
          <option v-for="item in cuisines" :key="item" :value="item">{{ item }}</option>
        </select>
      </div>
    </div>
    <div v-if="liveState === 'loading'" role="status">
      <p>Loading current food deals…</p>
      <div ref="grid" class="landing-deal-grid" :style="{ '--deal-columns': pageSize }" aria-hidden="true">
        <div v-for="index in pageSize" :key="index" class="landing-food-card landing-skeleton-card">
          <div class="landing-food-photo landing-skeleton" />
          <div class="landing-food-content"><span class="landing-skeleton" /><span class="landing-skeleton" /><span class="landing-skeleton" /></div>
        </div>
      </div>
    </div>
    <div v-else-if="liveState === 'error'" class="landing-deals-error" role="alert">
      <p>Deals couldn't load right now.</p>
      <button type="button" class="landing-button secondary" @click="emit('retry')">Retry loading deals</button>
      <RouterLink to="/browse">Explore the deal map <span aria-hidden="true">→</span></RouterLink>
    </div>
    <template v-else>
      <div class="landing-carousel">
      <div id="landing-deal-carousel" ref="grid" class="landing-deal-grid" :style="{ '--deal-columns': pageSize }" @touchstart.passive="startSwipe" @touchend="endSwipe" @touchcancel="touchStart = null">
        <FoodDealCard v-for="row in visibleRows" :key="row.key" :row="row" :to="rowLink(row)" />
      </div>
      <nav v-if="filtered.length" class="landing-carousel-controls" aria-label="Deal carousel">
        <button type="button" aria-label="Previous deals" aria-controls="landing-deal-carousel" :disabled="page === 0" @click="page--"><span aria-hidden="true">←</span></button>
        <p class="landing-carousel-status" role="status" aria-live="polite">Showing {{ page * pageSize + 1 }}–{{ Math.min((page + 1) * pageSize, filtered.length) }} of {{ filtered.length }} deals</p>
        <button type="button" aria-label="Next deals" aria-controls="landing-deal-carousel" :disabled="page + 1 >= pageCount" @click="page++"><span aria-hidden="true">→</span></button>
      </nav>
      </div>
      <div v-if="!filtered.length" class="cuisine-empty" role="status">
        <span aria-hidden="true">🍽️</span>
        <h3>{{ live.length ? 'No deals match this craving yet.' : 'No current food deals yet.' }}</h3>
        <p>Try another cuisine or explore the food map.</p>
        <button type="button" class="landing-button secondary" @click="cuisine = 'All Cuisines'; area = 'all'">Reset filters</button>
      </div>
    </template>
  </section>
</template>
