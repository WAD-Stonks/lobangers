<script setup lang="ts">
import { AppShell, BApp } from '@broke-oclock/ui'
import { adminNavigation } from '@web/components/admin/admin-navigation'
import ConfirmDialog from '@web/components/ConfirmDialog.vue'
import PageHeader from '@web/components/PageHeader.vue'
import RouteProgress from '@web/components/RouteProgress.vue'
import SplashScreen from '@web/components/SplashScreen.vue'
import { syncThemeColor, useTheme } from '@web/lib/theme'
import AuthPrompt from '@web/modules/account/AuthPrompt.vue'
import { authPrompt } from '@web/modules/account/auth-prompt'
import { readSplit } from '@web/modules/map-shell/filter-query'
import MapNavigation from '@web/modules/map-shell/MapNavigation.vue'
import { routeView } from '@web/modules/map-shell/shell-routes'
import { useBreakpoint } from '@web/modules/map-shell/use-breakpoint'
import { routeLayout } from '@web/router/layouts'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'

onBeforeUnmount(() => authPrompt.value?.resolve(null))
// Start the theme on every page, not only where a Dark mode switch or the map mounts, so system
// and other-tab changes apply at once instead of after a reload.
useTheme()
const route = useRoute()
const breakpoint = useBreakpoint()
const layout = computed(() => routeLayout(route))
// Scope the application palette to every route except the marketing landing page.
watch(layout, (value) => {
  document.documentElement.classList.toggle('app-palette', value !== 'landing')
  syncThemeColor()
}, { immediate: true })
onBeforeUnmount(() => document.documentElement.classList.remove('app-palette'))
const splitView = computed(() => routeView(route) === 'map' && readSplit(route.query) && !['saved', 'add-deal'].includes(String(route.name)))
const mapVisible = computed(() => layout.value === 'canvas' && routeView(route) === 'map')
const splashEligible = computed(() => mapVisible.value && breakpoint.value !== 'phone' && !['saved', 'add-deal'].includes(String(route.name)))
// Below desktop, plain pages (Add deal, merchant access) keep the same bottom nav as All Deals.
const pageBottomNav = computed(() => breakpoint.value !== 'desktop')
const showMapSplash = ref(false)
watch([mapVisible, splashEligible], ([visible, eligible], previous) => {
  if (!eligible) showMapSplash.value = false
  else if (visible && (previous[0] === false || (previous[0] === undefined && splitView.value))) showMapSplash.value = true
}, { immediate: true })
const routed = computed(() => route.matched.length > 0)
// Only matched admin destinations own an AdminShell; unknown URLs use the public fallback.
const administration = computed(() =>
  route.matched.some((record) => adminNavigation.some(({ href }) => record.path === href)),
)
</script>

<template>
  <BApp>
    <ConfirmDialog />
    <RouteProgress />
    <AuthPrompt v-if="layout !== 'canvas'" />
    <!-- The split map/results loading screen is skipped on phones. -->
    <template v-if="layout === 'canvas'">
      <SplashScreen v-if="showMapSplash" />
      <RouterView />
    </template>
    <!-- The landing page brings its own header, main and footer landmarks. -->
    <div v-else-if="layout === 'landing'" class="landing-canvas">
      <RouterView />
    </div>
    <main v-else-if="layout === 'auth'">
      <RouterView />
    </main>
    <div v-else-if="administration" class="admin-layout">
      <RouterView />
    </div>
    <!-- Nothing matches until the first navigation resolves (lazy pages, session check), so the
         public header does not flash, or load bookmarks, ahead of an admin page. -->
    <div v-else-if="routed" class="min-vh-100 bg-light-subtle text-body" :class="{ 'page-layout--bottom-nav': pageBottomNav }">
      <PageHeader />
      <AppShell>
        <RouterView />
      </AppShell>
      <MapNavigation v-if="pageBottomNav" bottom panel-open />
    </div>
  </BApp>
</template>

<style scoped>
/* Room for the fixed bottom nav, so the end of the page can scroll clear of it. */
.page-layout--bottom-nav {
  padding-bottom: calc(68px + env(safe-area-inset-bottom, 0px));
}
</style>
