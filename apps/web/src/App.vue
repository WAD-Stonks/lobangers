<script setup lang="ts">
import { AppShell, BApp } from '@broke-oclock/ui'
import { adminNavigation } from '@web/components/admin/admin-navigation'
import SiteHeader from '@web/components/SiteHeader.vue'
import SplashScreen from '@web/components/SplashScreen.vue'
import AuthPrompt from '@web/modules/account/AuthPrompt.vue'
import { authPrompt } from '@web/modules/account/auth-prompt'
import { readSplit, readView } from '@web/modules/map-shell/filter-query'
import { useBreakpoint } from '@web/modules/map-shell/use-breakpoint'
import { routeLayout } from '@web/router/layouts'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'

onBeforeUnmount(() => authPrompt.value?.resolve(null))
const route = useRoute()
const breakpoint = useBreakpoint()
const layout = computed(() => routeLayout(route))
// Scope the application palette to every route except the marketing landing page.
watch(layout, (value) => {
  document.documentElement.classList.toggle('app-palette', value !== 'landing')
}, { immediate: true })
onBeforeUnmount(() => document.documentElement.classList.remove('app-palette'))
const splitView = computed(() => readView(route.query) === 'map' && readSplit(route.query) && !['saved', 'add-deal'].includes(String(route.name)))
const mapVisible = computed(() => layout.value === 'canvas' && (route.name === 'login' || readView(route.query) === 'map'))
const splashEligible = computed(() => mapVisible.value && breakpoint.value !== 'phone' && !['saved', 'add-deal'].includes(String(route.name)))
const showMapSplash = ref(false)
watch([mapVisible, splashEligible], ([visible, eligible], previous) => {
  if (!eligible) showMapSplash.value = false
  else if (visible && (previous[0] === false || (previous[0] === undefined && splitView.value))) showMapSplash.value = true
}, { immediate: true })
// Only matched admin destinations own an AdminShell; unknown URLs use the public fallback.
const administration = computed(() =>
  route.matched.some((record) => adminNavigation.some(({ href }) => record.path === href)),
)
</script>

<template>
  <BApp>
    <AuthPrompt v-if="layout !== 'canvas'" />
    <!-- The split map/results loading screen is skipped on phones. -->
    <template v-if="layout === 'canvas'">
      <SplashScreen v-if="showMapSplash" />
      <RouterView />
    </template>
    <!-- The landing page brings its own navbar. -->
    <main v-else-if="layout === 'landing'" class="landing-canvas">
      <RouterView />
    </main>
    <main v-else-if="layout === 'auth'">
      <RouterView />
    </main>
    <div v-else-if="administration" class="admin-layout">
      <RouterView />
    </div>
    <div v-else class="min-vh-100 bg-light-subtle text-body site-layout site-layout--shell">
      <SiteHeader />
      <AppShell>
        <RouterView />
      </AppShell>
    </div>
  </BApp>
</template>

<style scoped>
.site-layout--shell {
  padding-top: var(--site-header-clearance);
}
</style>
