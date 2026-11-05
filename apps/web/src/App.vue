<script setup lang="ts">
import { AppShell, BApp } from '@broke-oclock/ui'
import { adminNavigation } from '@web/components/admin/admin-navigation'
import ConfirmDialog from '@web/components/ConfirmDialog.vue'
import PageHeader from '@web/components/PageHeader.vue'
import RouteProgress from '@web/components/RouteProgress.vue'
import SplashScreen from '@web/components/SplashScreen.vue'
import { syncThemeColor, useTheme } from '@web/lib/theme'
import AuthPrompt from '@web/modules/account/AuthPrompt.vue'
import { readSplit } from '@web/modules/map-shell/filter-query'
import MapNavigation from '@web/modules/map-shell/MapNavigation.vue'
import { routeView } from '@web/modules/map-shell/shell-routes'
import { useBreakpoint } from '@web/modules/map-shell/use-breakpoint'
import { routeLayout } from '@web/router/layouts'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'

useTheme()
const route = useRoute()
const breakpoint = useBreakpoint()
const layout = computed(() => routeLayout(route))
watch(layout, (value) => {
  document.documentElement.classList.toggle('app-palette', value !== 'landing')
  syncThemeColor()
}, { immediate: true })
onBeforeUnmount(() => document.documentElement.classList.remove('app-palette'))
const splitView = computed(() => routeView(route) === 'map' && readSplit(route.query) && !['saved', 'add-deal'].includes(String(route.name)))
const mapVisible = computed(() => layout.value === 'canvas' && routeView(route) === 'map')
const splashEligible = computed(() => mapVisible.value && breakpoint.value !== 'phone' && !['saved', 'add-deal'].includes(String(route.name)))
const pageBottomNav = computed(() => breakpoint.value !== 'desktop')
const showMapSplash = ref(false)
watch([mapVisible, splashEligible], ([visible, eligible], previous) => {
  if (!eligible) showMapSplash.value = false
  else if (visible && (previous[0] === false || (previous[0] === undefined && splitView.value))) showMapSplash.value = true
}, { immediate: true })
const routed = computed(() => route.matched.length > 0)
const administration = computed(() =>
  route.matched.some((record) => adminNavigation.some(({ href }) => record.path === href)),
)
</script>

<template>
  <BApp>
    <ConfirmDialog />
    <RouteProgress />
    <AuthPrompt v-if="layout !== 'canvas'" />
    <template v-if="layout === 'canvas'">
      <SplashScreen v-if="showMapSplash" />
      <RouterView />
    </template>
    <div v-else-if="layout === 'landing'" class="landing-canvas">
      <RouterView />
    </div>
    <main v-else-if="layout === 'auth'">
      <RouterView />
    </main>
    <div v-else-if="administration" class="admin-layout">
      <RouterView />
    </div>
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
.page-layout--bottom-nav {
  padding-bottom: calc(58px + env(safe-area-inset-bottom, 0px));
}
</style>
