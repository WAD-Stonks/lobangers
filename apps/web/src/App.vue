<script setup lang="ts">
import { AppShell, BApp } from '@broke-oclock/ui'
import SiteHeader from '@web/components/SiteHeader.vue'
import SplashScreen from '@web/components/SplashScreen.vue'
import { routeLayout } from '@web/router/layouts'
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'

const route = useRoute()
const layout = computed(() => routeLayout(route))
const administration = computed(() => route.path === '/admin' || route.path.startsWith('/admin/'))
</script>

<template>
  <BApp>
    <SplashScreen />
    <!-- The map shell owns the whole viewport and brings its own header and landmarks. -->
    <RouterView v-if="layout === 'canvas'" />
    <!-- The landing page brings its own navbar. -->
    <main v-else-if="layout === 'landing'" class="landing-canvas">
      <RouterView />
    </main>
    <div
      v-else
      class="min-vh-100 bg-light-subtle text-body site-layout"
      :class="{ 'site-layout--shell': !administration, 'site-layout--admin': administration }"
    >
      <SiteHeader :embedded="administration" />
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
