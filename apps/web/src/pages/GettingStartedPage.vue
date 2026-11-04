<script setup lang="ts">
import { useCanAddDeal } from '@web/lib/use-can-add-deal'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

const features = [
  {
    name: 'Find a deal',
    path: '/browse',
    description: 'Explore the map or list, filter offers and check each outlet and its terms.',
  },
  {
    name: 'Share a deal',
    path: '/add',
    description: 'Sign in and submit an offer with a photo. An admin reviews it before publication.',
  },
  {
    name: 'Check recent experiences',
    path: '/deals',
    description: 'Open a deal to read comments and recent availability reports, or sign in to contribute.',
  },
  {
    name: 'Your account',
    path: '/me/profile',
    description: 'Manage your profile, find saved deals and track your submissions.',
  },
  {
    name: 'Plan with a Squad',
    path: '/squad/new',
    description: 'Sign in to start a room, invite friends and choose a deal together.',
  },
  {
    name: 'My codes',
    path: '/codes',
    description: 'Find the Flash Drop codes you claimed and check their offer details and expiry.',
  },
]

// Merchants add deals from their dashboard, so the Share a deal row is not for them.
const canAddDeal = useCanAddDeal()
const shownFeatures = computed(() =>
  features.filter((feature) => feature.path !== '/add' || canAddDeal.value),
)
</script>

<template>
  <section aria-labelledby="setup-title">
    <RouterLink class="link-secondary setup-back mb-3" to="/">← Back home</RouterLink>
    <h1 id="setup-title" class="h2 mb-3">Getting started</h1>
    <p class="text-secondary setup-copy">
      LoBangers brings nearby food promotions, recent community experiences and group planning
      into one place. Start with the map, then open an offer to check its details before heading out.
    </p>

    <h2 class="h4 mt-5 mb-3">Explore LoBangers</h2>
    <dl class="row g-0 module-list">
      <template v-for="feature in shownFeatures" :key="feature.path">
        <dt class="col-md-4 py-3"><RouterLink :to="feature.path">{{ feature.name }}</RouterLink></dt>
        <dd class="col-md-8 py-3 mb-0">{{ feature.description }}</dd>
      </template>
    </dl>

    <p class="text-secondary small mt-4 mb-0">
      You can browse without an account. Sign in to save deals, submit an offer or share an
      experience. Merchant tools require approved outlet access; administration is restricted to staff.
    </p>
  </section>
</template>
