<script setup lang="ts">
import type { DealPin } from '@broke-oclock/contracts/deals'
import { OUTLET_NOT_CONFIRMED } from '@web/modules/browse-map/deal-format'
import { regions } from '@web/modules/landing/deals'
import { isLikelyStillOn, landingDealLink, promotionDates, venuesInRegion } from '@web/modules/landing/live-deals'
import type { LandingDealsStatus } from '@web/modules/landing/use-landing-deals'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

const emit = defineEmits<{ retry: [] }>()
const failedImages = ref(new Set<string>())
const cuisine = ref('All Cuisines')
const area = ref('all')
const props = defineProps<{ live: DealPin[]; liveState: LandingDealsStatus }>()
const cuisines = computed(() => ['All Cuisines', ...new Set(props.live.map((deal) => deal.cuisine ?? 'Others'))])
const outletDialog = ref<HTMLDialogElement | null>(null)
const outletDeal = ref<DealPin | null>(null)
const outletSearch = ref('')
const visibleOutlets = computed(() => {
  const query = outletSearch.value.trim().toLocaleLowerCase()
  return outletDeal.value?.venues.filter(venue => venue.name.toLocaleLowerCase().includes(query)) ?? []
})
const openOutlets = (deal: DealPin) => {
  outletDeal.value = deal
  outletSearch.value = ''
  outletDialog.value?.showModal()
}
const selectedRegion = computed(() => regions[Number(area.value)]?.name)
const cardVenue = (deal: DealPin) =>
  area.value === 'all' ? deal.venues[0] : selectedRegion.value ? venuesInRegion(deal, selectedRegion.value)[0] : undefined
const dealLink = (deal: DealPin) => { const venue = cardVenue(deal); return venue ? landingDealLink(deal, venue.id) : `/deals/${deal.id}` }
const filtered = computed(() =>
  props.live.filter(
    (deal) =>
      (cuisine.value === 'All Cuisines' || (deal.cuisine ?? 'Others') === cuisine.value) &&
      (area.value === 'all' || (selectedRegion.value && venuesInRegion(deal, selectedRegion.value).length > 0)),
  ),
)
const page = ref(0)
const pageSize = ref(4)
const columnCount = ref(4)
const updatePageSize = () => {
  columnCount.value = window.innerWidth <= 1100 ? 2 : 4
}
onMounted(() => {
  updatePageSize()
  window.addEventListener('resize', updatePageSize)
})
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
watch(filtered, () => { page.value = 0 }, { flush: 'sync' })
onBeforeUnmount(() => {
  window.removeEventListener('resize', updatePageSize)
})
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
      <RouterLink class="landing-view-all" to="/browse?cat=food"><span>View all food deals</span><span aria-hidden="true">→</span></RouterLink>
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
    <div v-if="liveState === 'loading'" role="status" aria-busy="true">
      <p>Loading current food deals…</p>
      <div class="landing-deal-grid" :style="{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }" aria-hidden="true">
        <div v-for="index in pageSize" :key="index" class="landing-food-card landing-skeleton-card">
          <div class="landing-food-photo landing-skeleton" />
          <div class="landing-food-content"><span class="landing-skeleton" /><span class="landing-skeleton" /><span class="landing-skeleton" /></div>
        </div>
      </div>
    </div>
    <div v-else-if="liveState === 'error'" class="landing-deals-error" role="alert">
      <p>Deals couldn't load right now.</p>
      <button type="button" class="landing-button secondary" @click="emit('retry')">Retry loading deals</button>
      <RouterLink to="/browse">Explore the deal map →</RouterLink>
    </div>
    <template v-else>
      <div class="landing-carousel">
      <div id="landing-deal-carousel" class="landing-deal-grid" :style="{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }" @touchstart.passive="startSwipe" @touchend="endSwipe" @touchcancel="touchStart = null">
        <article v-for="deal in visibleDeals" :key="deal.id" class="landing-food-card" :aria-labelledby="`landing-offer-${deal.id} landing-restaurant-${deal.id}`">
          <RouterLink class="landing-card-link" :to="dealLink(deal)" :aria-label="`View ${deal.title}`" />
          <div class="landing-food-photo">
            <RouterLink class="landing-photo-link" :to="dealLink(deal)" :aria-label="`View ${deal.title}`">
            <img v-if="deal.images[0] && !failedImages.has(deal.images[0].url)" @error="failedImages.add(deal.images[0].url)" :src="deal.images[0].url" :alt="deal.images[0].alt ?? deal.title" loading="lazy" width="640" height="480" />
            <div v-else class="landing-food-placeholder"><span aria-hidden="true">🍽️</span><span>{{ deal.images.length ? 'Photo unavailable' : 'No photo yet' }}</span></div>
            </RouterLink>
            <span class="landing-photo-badge">{{ isLikelyStillOn(deal) ? 'Likely still on' : deal.votes.status === 'EXPIRED' ? 'Ended' : deal.votes.status === 'UNCERTAIN' ? 'Uncertain' : 'Unverified' }}</span>
          </div>
          <div class="landing-food-content">
            <div class="landing-card-heading">
            <p :id="`landing-offer-${deal.id}`" class="landing-deal-title" :title="deal.title"><RouterLink class="landing-offer-link" :to="dealLink(deal)">{{ deal.title }}</RouterLink></p>
            <h3 :id="`landing-restaurant-${deal.id}`" class="landing-restaurant-name" :title="cardVenue(deal)?.name"><RouterLink v-if="cardVenue(deal)" class="landing-venue-link" :to="`/venues/${cardVenue(deal)?.id}`">{{ cardVenue(deal)?.name }}</RouterLink><template v-else>Restaurant details unavailable</template></h3>
            </div>
            <div class="landing-outlet-summary">
              <span v-if="deal.outletUnconfirmed" class="landing-outlet-unsure" data-testid="outlet-unconfirmed">{{ OUTLET_NOT_CONFIRMED }}</span>
              <button v-if="deal.venues.length > 1" type="button" class="landing-outlet-button" :aria-label="`View all ${deal.venues.length} outlets for ${deal.title}`" @click="openOutlets(deal)">+{{ deal.venues.length - 1 }} more {{ deal.venues.length === 2 ? 'outlet' : 'outlets' }}</button>
              <span v-else-if="!deal.venues.length" class="landing-outlet-count">{{ deal.venues.length === 0 ? 'No outlets listed' : '' }}</span>
            </div>
            <div class="landing-card-meta">
              <span :title="promotionDates(deal)">{{ promotionDates(deal) }}</span>
            </div>
          </div>
        </article>
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
    <dialog ref="outletDialog" class="landing-outlet-dialog" aria-labelledby="landing-outlet-title">
      <div class="landing-outlet-dialog-header">
        <div><span class="landing-eyebrow">PARTICIPATING OUTLETS</span><h3 id="landing-outlet-title">{{ outletDeal?.title }}</h3></div>
        <button type="button" aria-label="Close outlets" @click="outletDialog?.close()">✕</button>
      </div>
      <label for="landing-outlet-search">Find an outlet</label>
      <input id="landing-outlet-search" v-model="outletSearch" type="search" placeholder="Search by outlet name" />
      <p role="status">{{ visibleOutlets.length }} of {{ outletDeal?.venues.length ?? 0 }} outlets</p>
      <ul class="landing-outlet-list">
        <li v-for="venue in visibleOutlets" :key="venue.id"><RouterLink :to="outletDeal ? landingDealLink(outletDeal, venue.id) : '/browse'" @click="outletDialog?.close()">{{ venue.name }} <span aria-hidden="true">↗</span></RouterLink></li>
      </ul>
      <p v-if="!visibleOutlets.length">No outlets match your search.</p>
    </dialog>
  </section>
</template>
