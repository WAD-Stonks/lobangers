<script setup lang="ts">
import logo from '@web/assets/lobangers-logo.png'
import CuisineDiscovery from '@web/modules/landing/CuisineDiscovery.vue'
import HeroSection from '@web/modules/landing/HeroSection.vue'
import LandingNavbar from '@web/modules/landing/LandingNavbar.vue'
import ScrollStory from '@web/modules/landing/ScrollStory.vue'
import '@web/modules/landing/landing.css'
import '@web/modules/landing/cinematic-story.css'
import '@web/modules/landing/hero-effects.css'
import '@web/modules/landing/hero-layout.css'
import '@web/modules/landing/landing-usability.css'
import '@web/modules/landing/community-freshness.css'
import '@web/modules/landing/landing-backgrounds.css'
import '@web/modules/landing/landing-refinements.css'
import { useLandingDeals } from '@web/modules/landing/use-landing-deals'
import { useLandingMotion } from '@web/modules/landing/use-landing-motion'
import { ref } from 'vue'
import { RouterLink } from 'vue-router'

const root = ref<HTMLElement | null>(null)
const { pageProgress } = useLandingMotion(root)
const { deals, status, retry } = useLandingDeals()
</script>

<template>
  <div ref="root" class="lobangers-landing">
    <div class="landing-reading-progress" :style="{ transform: `scaleX(${pageProgress})` }" aria-hidden="true" />
    <a class="landing-skip" href="#hero-heading">Skip to content</a>
    <LandingNavbar />
    <HeroSection :live="deals" :live-state="status" @retry="retry" />
    <div class="story-intro" data-reveal data-scroll-reveal>
      <p class="story-intro-copy">A great meal shouldn't take<br />
        <span>twenty open tabs.</span>
      </p>
      <span class="intro-scribble" aria-hidden="true">↓</span>
    </div>
    <ScrollStory />
    <CuisineDiscovery :live="deals" :live-state="status" @retry="retry" />
    <footer class="landing-footer">
      <RouterLink to="/" class="footer-wordmark" aria-label="Lobangers home"><img :src="logo" alt="LOBANGERS" width="200" height="44" /></RouterLink>
      <p>Good food. Better prices. Little red dot.</p>
      <div>
        <RouterLink to="/browse">Find a lobang ↗</RouterLink>
        <RouterLink to="/submit-deal">Share a lobang ↗</RouterLink>
      </div>
      <small>Made for hungry Singaporeans.</small>
    </footer>
  </div>
</template>
