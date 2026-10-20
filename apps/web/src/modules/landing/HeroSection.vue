<script setup lang="ts">
import { money, regions, samples } from '@web/modules/landing/deals'
import HeroWaterfront from '@web/modules/landing/HeroWaterfront.vue'
import IllustratedMap from '@web/modules/landing/IllustratedMap.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

const autoRotate = ref(true)
const selected = ref(0)
const discoveryKey = ref(0)
function discover(index: number) {
  autoRotate.value = false
  if (selected.value === index) discoveryKey.value++
  else selected.value = index
}
watch(selected, () => { discoveryKey.value++ })
const focused = ref(false)
const hovered = ref(false)
const reduced = ref(false)
const pauseOnFocus = () => {
  focused.value = true
  autoRotate.value = false
}
const featured = computed(() => samples[selected.value] ?? samples[0])
let clock: ReturnType<typeof setInterval> | undefined
let query: MediaQueryList | undefined
const syncMotion = () => {
  reduced.value = query?.matches ?? false
}
onMounted(() => {
  query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  syncMotion()
  query?.addEventListener('change', syncMotion)
  clock = setInterval(() => {
    if (!document.hidden && autoRotate.value && !focused.value && !hovered.value && !reduced.value)
      selected.value = (selected.value + 1) % regions.length
  }, 5200)
})
onBeforeUnmount(() => {
  clearInterval(clock)
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
    <section aria-label="Regional food deal preview" class="hero-map-area" @mouseenter="hovered = true" @mouseleave="hovered = false" @focusin="pauseOnFocus" @focusout="focused = false">
      <div class="hero-map-scene">
        <IllustratedMap hero-pins art-src="/landing/singapore-map-hero-water-extended-1536.webp" :active="selected" @select="discover" />
        <HeroWaterfront :paused="reduced" />
      </div>
        <RouterLink to="/browse" :key="discoveryKey" class="hero-deal" :class="{ 'hero-deal-initial': discoveryKey === 0 }" :aria-label="`Explore food deals after viewing the ${featured.restaurant} illustrative offer`">
          <img :key="discoveryKey" class="hero-discovered-food" :src="featured.image" :alt="`${featured.restaurant} illustrative food photo`" width="100" height="105" />
          <div class="hero-deal-copy">
            <small>ILLUSTRATIVE DEAL · {{ regions[selected]?.area }}</small>
            <Transition name="deal-swap" mode="out-in">
              <div :key="featured.id">
                <strong>{{ featured.restaurant }}</strong>
                <span>{{ featured.title }}</span>
                <b>{{ money(featured.price) }} <del>{{ money(featured.original) }}</del>
                </b>
              </div>
            </Transition>
            <span class="hero-deal-action">Explore food deals <span aria-hidden="true">→</span></span>
          </div>
          <span :key="discoveryKey" class="hero-deal-badge">{{ featured.badge }}</span>
        </RouterLink>
    </section>
  </section>
</template>
