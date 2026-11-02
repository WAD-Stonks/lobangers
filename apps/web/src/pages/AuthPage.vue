<script setup lang="ts">
import logo from '@web/assets/lobangers-logo.png'
import LoginForm from '@web/modules/account/LoginForm.vue'
import RegisterForm from '@web/modules/account/RegisterForm.vue'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

const props = defineProps<{ mode: 'login' | 'register' }>()
const route = useRoute()
const router = useRouter()
const notices: Record<string, string> = {
  verified: 'Your email is verified. You can log in now.',
  verify: 'Check your email for a link to verify your account, then log in.',
  reset: 'Your password was changed. Log in with the new one.',
}
const notice = computed(() => typeof route.query.notice === 'string' ? notices[route.query.notice] ?? '' : '')
const signedIn = () => router.replace('/deals')
const registered = (needsVerification: boolean) => needsVerification
  ? router.replace({ name: 'sign-in', query: { notice: 'verify' } })
  : router.replace('/deals')
</script>

<template>
  <section class="auth-page" data-testid="standalone-auth">
    <header class="auth-page__header">
      <RouterLink to="/" aria-label="Lobangers home"><img :src="logo" alt="Lobangers" /></RouterLink>
      <RouterLink class="auth-page__back" to="/deals"><ShellIcon name="back" :size="18" />Back to deals</RouterLink>
    </header>
    <div class="auth-page__body">
      <section class="auth-page__card" aria-labelledby="auth-page-title">
        <div class="auth-page__mark" aria-hidden="true"><ShellIcon name="ticket" :size="30" /></div>
        <h1 id="auth-page-title">{{ props.mode === 'login' ? 'Welcome back' : 'Create an account' }}</h1>
        <p class="auth-page__intro">{{ props.mode === 'login' ? 'Log in to save deals and share your finds.' : 'Save your favourites and discover more food deals.' }}</p>
        <p v-if="notice" class="auth-page__notice" role="status">{{ notice }}</p>
        <LoginForm v-if="props.mode === 'login'" destination="/deals" embedded @signed-in="signedIn" />
        <RegisterForm v-else @registered="registered" />
        <p v-if="props.mode === 'login'" class="auth-page__switch">New here? <RouterLink :to="{ name: 'sign-up', query: route.query.redirect ? { redirect: route.query.redirect } : {} }">Create an account</RouterLink></p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.auth-page { min-height: 100dvh; background: #fcfbf8; color: var(--ink); }
.auth-page__header { display: flex; justify-content: space-between; align-items: center; gap: 20px; min-height: 88px; padding: 16px clamp(20px, 4vw, 64px); border-bottom: 1px solid var(--hairline); background: var(--paper-white); }
.auth-page__header img { display: block; width: 160px; height: auto; }
.auth-page__back { display: inline-flex; align-items: center; gap: 8px; color: var(--ink); font-size: 0.875rem; font-weight: 600; text-decoration: none; }
.auth-page__back:hover { text-decoration: underline; }
.auth-page__body { display: grid; place-items: center; min-height: calc(100dvh - 88px); padding: 40px 20px; }
.auth-page__card { width: min(100%, 460px); padding: 32px; border: 1px solid var(--hairline); border-radius: 24px; background: var(--paper-white); box-shadow: 0 12px 48px rgb(29 29 34 / 0.06); }
.auth-page__mark { display: grid; place-items: center; width: 52px; height: 52px; margin: 0 auto 16px; border-radius: 16px; background: var(--sunny); }
.auth-page h1 { margin: 0 0 8px; text-align: center; font-size: 1.6rem; font-weight: 700; }
.auth-page__intro { margin: 0 0 28px; text-align: center; color: var(--ink-muted); font-size: 0.9375rem; }
.auth-page__card :deep(form) {
  /* biome-ignore lint/complexity/noImportantStyles: overrides Bootstrap's p-4 utility. */
  padding: 0 !important;
  border: 0; background: transparent; box-shadow: none;
}
.auth-page__card :deep(form > h1), .auth-page__card :deep(form > h1 + p) { display: none; }
.auth-page__card :deep(input) { min-height: 48px; }
.auth-page__card :deep(form button[type='submit']) { min-height: 48px; border-radius: 12px; }
.auth-page__switch { margin: 24px 0 0; text-align: center; font-size: 0.875rem; color: var(--ink-muted); }
.auth-page__switch a { color: var(--ink); font-weight: 650; text-underline-offset: 3px; }
.auth-page__notice { padding: 12px; border-radius: 12px; background: var(--tag-ok-bg); color: var(--tag-ok-ink); font-size: 0.875rem; }
@media (max-width: 599.98px) {
  .auth-page__header { min-height: 72px; padding: 16px; }
  .auth-page__header img { width: 130px; }
  .auth-page__back { font-size: 0.8125rem; }
  .auth-page__body { min-height: calc(100dvh - 72px); align-items: start; padding: 24px 16px; }
  .auth-page__card { padding: 24px; border-radius: 20px; }
}
</style>
