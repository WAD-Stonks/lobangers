<script setup lang="ts">
import type { DealPin } from '@broke-oclock/contracts/deals'
import { api } from '@web/lib/api-client'
import { nearestArea } from '@web/modules/browse-map/cluster-area'
import { regions } from '@web/modules/landing/deals'
import HeroWaterfront from '@web/modules/landing/HeroWaterfront.vue'
import IllustratedMap from '@web/modules/landing/IllustratedMap.vue'
import { isLikelyStillOn, landingDealLink, promotionDates, randomRegionalDeal } from '@web/modules/landing/live-deals'
import type { LandingDealsStatus } from '@web/modules/landing/use-landing-deals'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

const props = defineProps<{ live: DealPin[]; liveState: LandingDealsStatus }>()
const regionalPicks = computed(() => regions.map((region) => randomRegionalDeal(props.live, region.name)))
const imageFailed = ref(false)
const selected = ref(0)
const discoveryKey = ref(0)
function discover(index: number) {
  if (selected.value === index) discoveryKey.value++
  else selected.value = index
}
watch(selected, () => { discoveryKey.value++ })
const reduced = ref(false)
const featured = computed(() => regionalPicks.value[selected.value])
watch(featured, () => { imageFailed.value = false })
const outletAddress = ref('')
const addressCache = new Map<string, string>()
const outletLocation = computed(() => outletAddress.value || (featured.value ? `Near ${nearestArea(featured.value.venue)}` : ''))
watch(() => featured.value?.venue.id, async (venueId, _previous, onCleanup) => {
  let active = true
  onCleanup(() => { active = false })
  outletAddress.value = venueId ? addressCache.get(venueId) ?? '' : ''
  if (!venueId || addressCache.has(venueId)) return
  try {
    const result = await api.venues.get(venueId)
    const address = result.venue.address.trim() || result.venue.area?.trim() || ''
    addressCache.set(venueId, address)
    if (active) outletAddress.value = address
  } catch {
    // The outlet coordinates still provide a neighbourhood if its details are unavailable.
  }
}, { immediate: true })
let query: MediaQueryList | undefined
const syncMotion = () => {
  reduced.value = query?.matches ?? false
}
onMounted(() => {
  query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  syncMotion()
  query?.addEventListener('change', syncMotion)

})
onBeforeUnmount(() => {
  query?.removeEventListener('change', syncMotion)
})
</script>

<template>
  <section class="landing-hero" aria-labelledby="hero-heading" :class="{ 'hero-ambient-paused': reduced }">
    <div class="hero-paper-background" aria-hidden="true" />
    <div class="hero-copy">
      <h1 id="hero-heading" aria-label="Bang for your buck.">
        <svg class="hero-headline-accent accent-coral" viewBox="0 0 80 90" aria-hidden="true" focusable="false"><path d="M12 65L35 68" pathLength="1" style="--ray-index: 0" />
          <path d="M23 29L45 46" pathLength="1" style="--ray-index: 1" />
          <path d="M57 9L66 31" pathLength="1" style="--ray-index: 2" /></svg>
        <svg class="hero-headline-accent accent-yellow" viewBox="0 0 70 70" aria-hidden="true" focusable="false"><path d="M30 9L21 30" pathLength="1" style="--ray-index: 0" />
          <path d="M60 37L40 47" pathLength="1" style="--ray-index: 1" /></svg>
        <span class="headline-line" aria-hidden="true">
          <span v-for="(letter, index) in 'Bang for'" :key="index" class="headline-letter" :style="{ '--letter-index': index }">{{ letter }}</span>
        </span>
        <br />
        <span class="headline-line" aria-hidden="true">
          <span v-for="(letter, index) in 'your '" :key="index" class="headline-letter" :style="{ '--letter-index': index + 8 }">{{ letter }}</span><span class="hero-underline"><span v-for="(letter, index) in 'buck.'" :key="index" class="headline-letter" :style="{ '--letter-index': index + 13 }">{{ letter }}</span></span>
        </span>
      </h1>
      <p class="hero-subtitle">Good food, better prices, all around Singapore.</p>
      <RouterLink to="/browse" class="landing-button primary">Explore food deals <span aria-hidden="true">→</span>
      </RouterLink>
    </div>
    <section aria-label="Regional food deal preview" class="hero-map-area">
      <div class="hero-map-scene">
        <IllustratedMap hero-pins art-src="/landing/singapore-map-hero-water-extended-1536.webp" :active="selected" @select="discover" />
        <HeroWaterfront :paused="reduced" />
      </div>
        <article v-if="featured" :key="discoveryKey" class="hero-deal hero-live-card" :aria-label="`View ${featured.deal.title} at ${featured.venue.name}`">
          <div class="hero-card-topline"><span class="hero-card-region"><i aria-hidden="true" />{{ regions[selected]?.name }}</span><span>FEATURED FIND</span></div>
          <div class="hero-card-main">
            <div class="hero-card-photo">
              <img v-if="featured.deal.images[0] && !imageFailed" :key="discoveryKey" class="hero-discovered-food" :src="featured.deal.images[0].url" :alt="featured.deal.images[0].alt ?? featured.deal.title" width="128" height="144" @error="imageFailed = true" />
              <div v-else class="hero-food-placeholder"><span aria-hidden="true">🍽️</span><span>No photo yet</span></div>
            </div>
            <div class="hero-deal-copy">
              <small>{{ featured.deal.cuisine ?? 'Others' }}</small>
              <Transition name="deal-swap" mode="out-in">
                <div :key="featured.deal.id">
                  <RouterLink :to="`/venues/${featured.venue.id}`" class="hero-restaurant-link"><strong class="hero-restaurant-name" :title="featured.venue.name">{{ featured.venue.name }}</strong></RouterLink>
                  <span class="hero-promotion-title" :title="featured.deal.title">{{ featured.deal.title }}</span>
                </div>
              </Transition>
          <span v-if="isLikelyStillOn(featured.deal)" class="landing-verification-badge">✓ Likely still on</span>
          <p class="hero-promotion-period" :title="promotionDates(featured.deal)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18" /></svg><span>{{ promotionDates(featured.deal) }}</span></p>
            </div>
          </div>
          <div class="hero-card-footer">
            <p class="hero-outlet-location" :title="outletLocation"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg><span>{{ outletLocation }}</span></p>
            <RouterLink :to="landingDealLink(featured.deal, featured.venue.id)" class="hero-deal-action">View deal <span aria-hidden="true">→</span></RouterLink>
          </div>
        </article>
        <div v-else class="hero-deal" role="status">
          <div class="hero-deal-copy">
            <small>{{ regions[selected]?.name }}</small>
            <strong>{{ liveState === 'loading' ? 'Loading current deals…' : liveState === 'error' ? 'Deals could not load right now.' : 'No current deals in this region yet.' }}</strong>
            <RouterLink to="/browse">Explore food deals →</RouterLink>
          </div>
        </div>
    </section>
  </section>
</template>
