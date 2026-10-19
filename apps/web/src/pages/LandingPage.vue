<script setup lang="ts">
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
import { useLandingDeals } from '@web/modules/landing/use-landing-deals'
import { useLandingMotion } from '@web/modules/landing/use-landing-motion'
import { ref } from 'vue'
import { RouterLink } from 'vue-router'

const root = ref<HTMLElement | null>(null)
const { pageProgress } = useLandingMotion(root)
const { deals, status } = useLandingDeals()
</script>

<template>
  <div ref="root" class="lobangers-landing">
    <div class="landing-reading-progress" :style="{ transform: `scaleX(${pageProgress})` }" aria-hidden="true" />
    <a class="landing-skip" href="#hero-heading">Skip to content</a>
    <LandingNavbar />
    <HeroSection />
    <div class="story-intro" data-reveal data-scroll-reveal>
      <span class="landing-eyebrow">LESS HUNTING. MORE MAKAN.</span>
      <p class="story-intro-copy">A great meal shouldn't take<br />
        <span>twenty open tabs.</span>
      </p>
      <span class="intro-scribble" aria-hidden="true">↓</span>
    </div>
    <ScrollStory :live-deals="deals" />
    <CuisineDiscovery :live="deals" :live-state="status" />
    <section class="landing-final" aria-labelledby="final-heading">
      <span class="final-food food-one" aria-hidden="true">🍜</span>
      <span class="final-food food-two" aria-hidden="true">🧋</span>
      <span class="final-food food-three" aria-hidden="true">🍗</span>
      <span class="final-food food-four" aria-hidden="true">SAVE MORE ✳</span>
      <span class="landing-eyebrow" data-reveal>YOUR NEXT MEAL HAS A BETTER DEAL.</span>
      <h2 id="final-heading" data-reveal>Less searching.<br />More munching.</h2>
      <p data-reveal>Your next great food deal is waiting.<br />Discover delicious lobangs around Singapore.</p>
      <div data-reveal>
        <RouterLink to="/browse" class="landing-button dark">Explore Food Deals ↗</RouterLink>
        <a href="#story" class="landing-button replay">↺ Replay the Story</a>
      </div>
      <span class="final-spark" aria-hidden="true">✳</span>
    </section>
    <footer class="landing-footer">
      <RouterLink to="/" class="footer-wordmark">LOBANGERS<span>✳</span>
      </RouterLink>
      <p>Good food. Better prices. Little red dot.</p>
      <div>
        <RouterLink to="/browse">Find a lobang ↗</RouterLink>
        <RouterLink to="/submit-deal">Share a lobang ↗</RouterLink>
      </div>
      <small>Made for hungry Singaporeans.</small>
    </footer>
  </div>
</template>
