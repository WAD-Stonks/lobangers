<script setup lang="ts">
import logo from '@web/assets/lobangers-logo.svg'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { RouterLink } from 'vue-router'

// The sign-in, sign-up and password pages share this frame: a logo bar with a way back to the
// deals, and one centred card. The page supplies the card's heading (id `titleId`) and body.
withDefaults(defineProps<{ titleId?: string }>(), { titleId: 'auth-page-title' })
</script>

<template>
  <section class="auth-page" data-testid="standalone-auth">
    <header class="auth-page__header">
      <RouterLink to="/" aria-label="Lobangers home"><img :src="logo" alt="Lobangers" width="160" height="33" /></RouterLink>
      <RouterLink class="auth-page__back" to="/deals"><ShellIcon name="back" :size="18" />Back to deals</RouterLink>
    </header>
    <div class="auth-page__body">
      <section class="auth-page__card" :aria-labelledby="titleId">
        <div class="auth-page__mark" aria-hidden="true"><ShellIcon name="ticket" :size="30" /></div>
        <slot />
      </section>
    </div>
  </section>
</template>

<!-- Not scoped: the card's heading, intro and form come from each page's slot. -->
<style>
/* biome-ignore lint/suspicious/noDuplicateProperties: 100vh is the fallback for browsers without dvh. */
.auth-page { min-height: 100vh; min-height: 100dvh; background: var(--page-background); color: var(--ink); }
.auth-page__header { display: flex; justify-content: space-between; align-items: center; gap: 20px; min-height: 88px; padding: 16px clamp(20px, 4vw, 64px); border-bottom: 1px solid var(--hairline); background: var(--paper-white); }
.auth-page__header img { display: block; width: 160px; height: auto; }
/* The logo link reaches the full touch target on touch screens. */
@media (pointer: coarse) { .auth-page__header > a { display: inline-flex; align-items: center; min-height: var(--hit); } }
.auth-page__back { display: inline-flex; flex-shrink: 0; align-items: center; gap: 8px; min-height: 44px; color: var(--ink); font-size: 0.875rem; font-weight: 600; text-decoration: none; }
.auth-page__back:hover { text-decoration: underline; }
.auth-page__body { display: grid; place-items: center; min-height: calc(100dvh - 88px); padding: 40px 20px; }
.auth-page__card { box-sizing: border-box; width: min(100%, 460px); min-width: 0; overflow-wrap: anywhere; padding: 32px; border: 1px solid var(--hairline); border-radius: 24px; background: var(--paper-white); box-shadow: 0 12px 48px rgb(29 29 34 / 0.06); }
.auth-page__mark { display: grid; place-items: center; width: 52px; height: 52px; margin: 0 auto 16px; border-radius: 16px; color: var(--on-accent); background: var(--sunny); }
.auth-page__card h1 { margin: 0 0 8px; text-align: center; font-size: 1.6rem; font-weight: 700; }
.auth-page__intro { margin: 0 0 28px; text-align: center; color: var(--ink-muted); font-size: 0.9375rem; }
.auth-page__card form {
  /* biome-ignore lint/complexity/noImportantStyles: overrides Bootstrap's p-4 utility. */
  padding: 0 !important;
  border: 0; background: transparent; box-shadow: none;
}
.auth-page__card form > h1, .auth-page__card form > h1 + p { display: none; }
.auth-page__card input { min-height: 48px; }
.auth-page__card form button[type='submit'] { min-height: 48px; border-radius: 12px; }
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
/* 320px phones: the logo and Back link share one row, so both give a little ground. */
@media (max-width: 359.98px) {
  .auth-page__header { gap: 12px; padding: 12px; }
  .auth-page__header img { width: 112px; }
  .auth-page__card { padding: 20px 16px; }
}
</style>
