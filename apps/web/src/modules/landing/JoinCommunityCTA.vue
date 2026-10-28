<script setup lang="ts">
import { segment } from '@web/modules/landing/use-story-progress'
import { RouterLink } from 'vue-router'

defineProps<{ progress: number; reduced: boolean }>()
</script>

<template>
  <div class="join-community" :inert="!reduced && progress < .35 ? true : undefined" :aria-hidden="!reduced && progress < .05">
    <h3 :style="{ opacity: segment(progress, 0, .6), transform: `translateY(${(1 - segment(progress, 0, .6)) * 15}px)` }">Good deals stay<br />in the loop.</h3>
    <p :style="{ opacity: segment(progress, .15, .8), transform: `translateY(${(1 - segment(progress, .15, .8)) * 23}px)` }">Real food hunters help keep every lobang up to date. Join the community to confirm deals and report expired promotions.</p>
    <div class="community-cta-actions" :style="{ opacity: segment(progress, .3, 1), transform: `translateY(${(1 - segment(progress, .3, 1)) * 32}px)` }">
      <RouterLink class="community-signup" to="/register">Sign up to contribute <span aria-hidden="true">→</span></RouterLink>
      <RouterLink class="community-explore" to="/browse">Explore food deals <span aria-hidden="true">→</span></RouterLink>
    </div>
  </div>
</template>
