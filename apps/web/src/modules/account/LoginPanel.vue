<script setup lang="ts">
import LoginForm from '@web/modules/account/LoginForm.vue'
import PanelFrame from '@web/modules/map-shell/PanelFrame.vue'
import { useToast } from '@web/modules/map-shell/use-toast'
import { safeRedirect } from '@web/router/guards'
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

// Log in over the map. After signing in the visitor goes back to ?redirect=, or the map.
const route = useRoute()
const router = useRouter()
const toast = useToast()

// Fixed messages only: the ?notice= value picks one, it is never shown itself.
const NOTICES: Record<string, string> = {
  verified: 'Your email is verified. You can log in now.',
  verify: 'Check your email for a link to verify your account, then log in.',
  reset: 'Your password was changed. Log in with the new one.',
}
// Why the visitor was sent here, from where the guard bounced them.
const REASONS: readonly [prefix: string, title: string][] = [
  ['/submit-deal', 'Log in to add a deal'],
  ['/saved', 'Log in to see your saved deals'],
  ['/merchant', 'Log in to manage your stall'],
  ['/me/', 'Log in to see your account'],
  ['/deals/', 'Log in to save deals'],
]

const redirect = computed(() => safeRedirect(route.query.redirect))
const notice = computed(() => {
  const key = route.query.notice
  return typeof key === 'string' && Object.hasOwn(NOTICES, key) ? NOTICES[key] : ''
})
const title = computed(() => REASONS.find(([prefix]) => redirect.value.startsWith(prefix))?.[1] ?? 'Welcome back')

const onSignedIn = async () => {
  await router.replace(redirect.value)
  toast.show('You are logged in')
}
</script>

<template>
  <PanelFrame :title="title" :back="{ name: 'browse' }" back-label="Back to the map">
    <div v-if="notice" class="account-panel__notice" role="status">{{ notice }}</div>
    <div class="account-panel__form">
      <LoginForm @signed-in="onSignedIn" />
    </div>
    <p class="lb-meta account-panel__switch">
      New here?
      <RouterLink :to="{ name: 'register', query: route.query.redirect ? { redirect: route.query.redirect } : {} }">
        Create an account
      </RouterLink>
    </p>
  </PanelFrame>
</template>

<style scoped>
/* The form brings its own card and h1 for the standalone page; the panel supplies both here. */
.account-panel__form :deep(form) {
  /* biome-ignore lint/complexity/noImportantStyles: beats Bootstrap's p-4 utility, itself !important */
  padding: 0 !important;
  background: transparent;
  border: 0;
  box-shadow: none;
}

/* The panel title already greets the visitor, so the form's own lead line would repeat it. */
.account-panel__form :deep(form > h1),
.account-panel__form :deep(form > h1 + p) {
  display: none;
}

.account-panel__form :deep(input) {
  font-size: 1rem;
}

.account-panel__notice {
  padding: var(--space-3);
  font-size: var(--text-sm);
  color: var(--tag-ok-ink);
  background: var(--tag-ok-bg);
  border-radius: var(--radius-control);
}

.account-panel__switch {
  margin: 0;
  text-align: center;
}

.account-panel__switch a {
  font-weight: 700;
  color: var(--ink);
}
</style>
