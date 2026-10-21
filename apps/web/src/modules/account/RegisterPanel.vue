<script setup lang="ts">
import RegisterForm from '@web/modules/account/RegisterForm.vue'
import PanelFrame from '@web/modules/map-shell/PanelFrame.vue'
import { safeRedirect } from '@web/router/guards'
import { useRoute, useRouter } from 'vue-router'

// Sign up over the map. Accounts that must verify their email go to log in with a notice.
const route = useRoute()
const router = useRouter()

const onRegistered = (needsVerification: boolean) =>
  needsVerification
    ? router.replace({ name: 'login', query: { notice: 'verify' } })
    : router.replace(safeRedirect(route.query.redirect))
</script>

<template>
  <PanelFrame title="Create an account" :back="{ name: 'browse' }" back-label="Back to the map">
    <div class="account-panel__form">
      <RegisterForm @registered="onRegistered" />
    </div>
  </PanelFrame>
</template>

<style scoped>
.account-panel__form :deep(form) {
  /* biome-ignore lint/complexity/noImportantStyles: beats Bootstrap's p-4 utility, itself !important */
  padding: 0 !important;
  background: transparent;
  border: 0;
  box-shadow: none;
}

.account-panel__form :deep(form > h1) {
  display: none;
}

.account-panel__form :deep(input) {
  font-size: 1rem;
}
</style>
