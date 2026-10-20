<script setup lang="ts">
import { AppShell, BApp } from '@broke-oclock/ui'
import SiteHeader from '@web/components/SiteHeader.vue'
import SplashScreen from '@web/components/SplashScreen.vue'
import { routeLayout } from '@web/router/layouts'
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'

const route = useRoute()
const layout = computed(() => routeLayout(route))
</script>

<template>
  <BApp>
    <SplashScreen />
    <!-- The map shell owns the whole viewport and brings its own header and landmarks. -->
    <RouterView v-if="layout === 'canvas'" />
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
