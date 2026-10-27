<script setup lang="ts">
import type { DealPin } from '@broke-oclock/contracts/deals'
import { areaFor } from '@web/modules/browse-map/cluster-area'
import { regions } from '@web/modules/landing/deals'
import HeroWaterfront from '@web/modules/landing/HeroWaterfront.vue'
import IllustratedMap from '@web/modules/landing/IllustratedMap.vue'
import { isLikelyStillOn, landingDealLink, promotionDates, randomRegionalDeal, venuesInRegion } from '@web/modules/landing/live-deals'
import type { LandingDealsStatus } from '@web/modules/landing/use-landing-deals'
import { useOutletAddresses } from '@web/modules/landing/use-outlet-addresses'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

const emit = defineEmits<{ retry: [] }>()
const props = defineProps<{ live: DealPin[]; liveState: LandingDealsStatus }>()
// Include a chain in each region where it has an outlet.
const regionalPicks = computed(() => regions.map(region => props.live.flatMap(deal => {
  const venue = venuesInRegion(deal, region.name)[0]
  return venue ? [{ deal, venue }] : []
})))
const picks = computed(() => regionalPicks.value.flat())
const lastDealByRegion = new Map<number, string>()
const featured = ref<ReturnType<typeof randomRegionalDeal>>(null)
const imageFailed = ref(false)
const selected = ref(0)
const mapArea = ref<HTMLElement | null>(null)
const preview = ref<HTMLElement | null>(null)
const previewOverlap = ref(64)
const previewDockTop = ref(0)
const previewPosition = ref<{ left: string; top: string } | undefined>()
const featuredHasAppeared = ref(false)
const shouldPopFeatured = ref(false)
let layoutObserver: ResizeObserver | undefined
function positionPreview() {
  const area = mapArea.value
  const card = preview.value
  const scene = area?.querySelector('.illustrated-map')
  if (!area || !card || !scene) return
  const bounds = area.getBoundingClientRect()
  const land = scene.getBoundingClientRect()
  const width = card.offsetWidth
  const height = card.offsetHeight
  if (!bounds.width || !width || !height) return
  // Keep the search envelope stable as deal text changes length.
  const placementHeight = bounds.width <= 340 ? 470 : bounds.width <= 480 ? 420 : 360
  // Use the same clearance for every pin, including whichever one is selected.
  // Its visual scale changes during rotation, but the card position should not.
  const pins = [...area.querySelectorAll<HTMLElement>('.island-marker')].map(pin => {
    const anchorX = land.left + land.width * parseFloat(pin.style.left) / 100
    const anchorY = land.top + land.height * parseFloat(pin.style.top) / 100
    const pinWidth = pin.offsetWidth * 1.6
    const pinHeight = pin.offsetHeight * 1.6
    return {
      left: anchorX - pinWidth / 2,
      right: anchorX + pinWidth / 2,
      top: anchorY - pinHeight * .91,
      bottom: anchorY + pinHeight * .09,
    }
  })
  // Overlap the shoreline when a central placement cannot clear every pin.
  const dockLeft = bounds.left + (bounds.width - width) / 2
  const dockPins = pins.filter(pin => pin.right + 20 > dockLeft && pin.left - 20 < dockLeft + width)
  const lowestPin = Math.max(land.top, ...dockPins.map(pin => pin.bottom + 20))
  previewOverlap.value = Math.max(0, Math.min(placementHeight * .4, land.height * .18, land.bottom - lowestPin))
  previewDockTop.value = land.bottom - bounds.top - previewOverlap.value
  const candidates: { x: number; y: number; distance: number }[] = []
  const centerX = land.left + land.width * .5
  const centerY = land.top + land.height * .47
  if (window.innerWidth >= 1440) {
    previewPosition.value = {
      left: `${centerX - bounds.left}px`,
      top: `${centerY - bounds.top}px`,
    }
    return
  }
  for (let y = land.top + land.height * .3; y <= land.top + land.height * .65; y += 8) {
    for (let x = bounds.left + width / 2 + 16; x <= bounds.right - width / 2 - 16; x += 8) {
      const left = x - width / 2
      const top = y - placementHeight / 2
      if (top < land.top + land.height * .15 || top + placementHeight > land.bottom - land.height * .15) continue
      if (pins.some(pin => left < pin.right + 20 && left + width > pin.left - 20 && top < pin.bottom + 20 && top + placementHeight > pin.top - 20)) continue
      candidates.push({ x, y, distance: Math.hypot(x - centerX, y - centerY) })
    }
  }
  const best = candidates.sort((a, b) => a.distance - b.distance)[0]
  previewPosition.value = best ? { left: `${best.x - bounds.left}px`, top: `${best.y - bounds.top}px` } : undefined
}
watch([featured, selected, () => props.liveState], async () => {
  await nextTick()
  layoutObserver?.disconnect()
  if (mapArea.value) layoutObserver?.observe(mapArea.value)
  if (preview.value) layoutObserver?.observe(preview.value)
  positionPreview()
}, { flush: 'post' })
const discoveryKey = ref(0)
const reduced = ref(false)
function discover(index: number) {
  const region = regions[index]
  if (!region) return
  selected.value = index
  const pick = randomRegionalDeal(props.live, region.name)
  if (featured.value?.deal.id === pick?.deal.id) discoveryKey.value++
  featured.value = pick
  restartRotation()
}
watch(picks, available => {
  featured.value = available.find(pick => pick.deal.id === featured.value?.deal.id && pick.venue.id === featured.value?.venue.id) ?? available[0] ?? null
}, { immediate: true })
watch(featured, async pick => {
  imageFailed.value = false
  discoveryKey.value++
  shouldPopFeatured.value = Boolean(pick && featuredHasAppeared.value)
  if (pick) {
    selected.value = regions.findIndex(region => region.name === areaFor(pick.venue).region)
    lastDealByRegion.set(selected.value, pick.deal.id)
    await nextTick()
    featuredHasAppeared.value = true
  }
}, { immediate: true })
let rotation: ReturnType<typeof setInterval> | undefined
function restartRotation() {
  clearInterval(rotation)
  if (props.liveState !== 'ready' || regionalPicks.value.filter(pool => pool.length).length < 2) return
  rotation = setInterval(() => {
    for (let step = 1; step < regions.length; step++) {
      const regionIndex = (selected.value + step) % regions.length
      const pool = regionalPicks.value[regionIndex] ?? []
      if (!pool.length) continue
      const previous = pool.findIndex(pick => pick.deal.id === lastDealByRegion.get(regionIndex))
      featured.value = pool[(previous + 1) % pool.length] ?? null
      break
    }
  }, 5000)
}
watch([picks, () => props.liveState], restartRotation)
const { locationFor } = useOutletAddresses(computed(() => featured.value ? [featured.value.venue] : []))
const outletLocation = computed(() => locationFor(featured.value?.venue))
let query: MediaQueryList | undefined
const syncMotion = () => {
  reduced.value = query?.matches ?? false
}
onMounted(() => {
  restartRotation()
  if (typeof ResizeObserver !== 'undefined') {
    layoutObserver = new ResizeObserver(positionPreview)
    if (mapArea.value) layoutObserver.observe(mapArea.value)
    if (preview.value) layoutObserver.observe(preview.value)
  }
  positionPreview()
  query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  syncMotion()
  query?.addEventListener('change', syncMotion)

})
onBeforeUnmount(() => {
  clearInterval(rotation)
  layoutObserver?.disconnect()
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
    <section ref="mapArea" aria-label="Regional food deal preview" class="hero-map-area" :class="{ 'hero-map-docked': (featured || liveState === 'loading' || liveState === 'ready') && !previewPosition }" @transitionend="positionPreview" @animationend="positionPreview">
      <div class="hero-map-scene">
        <IllustratedMap hero-pins art-src="/landing/singapore-map-hero-water-extended-1536.webp" :active="selected" @select="discover" />
        <HeroWaterfront :paused="reduced" />
      </div>
        <div v-if="liveState === 'loading'" ref="preview" class="hero-deal hero-live-card hero-loading-card" :class="{ 'hero-card-docked': !previewPosition }" :style="previewPosition ?? { left: '50%', top: `${previewDockTop}px` }" role="status" aria-busy="true">
          <span class="visually-hidden">Loading current deals…</span>
          <div class="hero-card-topline" aria-hidden="true">
            <span class="hero-card-region"><i /><span class="landing-skeleton hero-loading-region" /></span>
            <span class="landing-skeleton hero-loading-eyebrow" />
          </div>
          <div class="hero-card-main" aria-hidden="true">
            <div class="hero-card-photo"><span class="landing-skeleton" /></div>
            <div class="hero-deal-copy hero-loading-content">
              <span class="landing-skeleton hero-loading-cuisine" />
              <span class="landing-skeleton hero-loading-title" />
              <span class="landing-skeleton hero-loading-restaurant" />
              <span class="landing-skeleton hero-loading-period" />
            </div>
          </div>
          <div class="hero-card-footer" aria-hidden="true">
            <span class="landing-skeleton hero-loading-location" />
            <span class="landing-skeleton hero-loading-action" />
          </div>
        </div>
        <article v-else-if="featured" :key="discoveryKey" ref="preview" class="hero-deal hero-live-card" :class="{ 'hero-card-docked': !previewPosition, 'hero-card-no-entry': !featuredHasAppeared, 'hero-card-pop': shouldPopFeatured }" :style="previewPosition ?? { left: '50%', top: `${previewDockTop}px` }" :aria-label="`View ${featured.deal.title} at ${featured.venue.name}`">
          <RouterLink class="landing-card-link" :to="landingDealLink(featured.deal, featured.venue.id)" :aria-label="`View ${featured.deal.title}`" />
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
                  <span class="hero-promotion-title" :title="featured.deal.title">{{ featured.deal.title }}</span>
                  <RouterLink :to="`/venues/${featured.venue.id}`" class="hero-restaurant-link"><strong class="hero-restaurant-name" :title="featured.venue.name">{{ featured.venue.name }}</strong></RouterLink>
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
        <div v-else ref="preview" class="hero-deal hero-live-card hero-empty-card" :class="{ 'hero-card-docked': !previewPosition }" :style="previewPosition ?? { left: '50%', top: `${previewDockTop}px` }" role="status">
          <div class="hero-deal-copy">
            <small>{{ regions[selected]?.name }}</small>
            <strong>{{ liveState === 'error' ? 'Deals could not load right now.' : 'No current deals in this region yet.' }}</strong>
            <button v-if="liveState === 'error'" type="button" class="landing-button secondary" @click="emit('retry')">Retry loading deals</button>
            <RouterLink to="/browse">Explore food deals →</RouterLink>
          </div>
        </div>
    </section>
  </section>
</template>
