<script setup lang="ts">
import PanelFrame from '@web/modules/map-shell/PanelFrame.vue'
import { type RouteLocationRaw, RouterLink } from 'vue-router'

// Holding panel for a feature whose route exists but whose UI is still being built, so a
// link never lands on a blank screen. It names the owner so the gap is easy to chase.
withDefaults(
  defineProps<{
    title: string
    owner: string
    summary: string
    link?: { label: string; to: RouteLocationRaw } | null
  }>(),
  { link: null },
)
</script>

<template>
  <PanelFrame :title="title" :back="{ name: 'browse' }" back-label="Back to the map">
    <div class="lb-state">
      <span class="lb-tag lb-tag--build coming-soon__tag">Being built by {{ owner }}</span>
      <p class="lb-state__body">{{ summary }}</p>
      <RouterLink v-if="link" class="lb-btn lb-btn--ink coming-soon__link" :to="link.to">{{ link.label }}</RouterLink>
    </div>
  </PanelFrame>
</template>

<style scoped>
.coming-soon__tag,
.coming-soon__link {
  align-self: flex-start;
}
</style>
