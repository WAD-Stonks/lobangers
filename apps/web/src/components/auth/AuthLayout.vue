<script setup lang="ts">
import background from '@web/assets/auth-background.jpg'
import backgroundDark from '@web/assets/auth-background-dark.jpg'
import logo from '@web/assets/lobangers-logo.svg'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { RouterLink } from 'vue-router'

// The sign-in, sign-up and password pages share this frame: a logo bar with a way back to the
// deals, and one centred card. The page supplies the card's heading (id `titleId`) and body.
withDefaults(defineProps<{ titleId?: string }>(), { titleId: 'auth-page-title' })
</script>

<template>
  <section class="auth-page" data-testid="standalone-auth" :style="{ '--auth-background': `url(${background})`, '--auth-background-dark': `url(${backgroundDark})` }">
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
/* The Singapore skyline sits along the bottom edge; the header and card float over it.
   #fdf4ea and #0f1523 are each illustration's sky, so tall pages continue it above the image. */
/* biome-ignore lint/suspicious/noDuplicateProperties: 100vh is the fallback for browsers without dvh. */
.auth-page { position: relative; isolation: isolate; min-height: 100vh; min-height: 100dvh; background: #fdf4ea; color: var(--ink); }
/* Pinned to the viewport, so a taller card (an opened details note) scrolls over it instead of pushing it down. */
.auth-page::before { content: ''; position: fixed; inset: 0; z-index: -1; background: var(--auth-background) center bottom / max(100%, 900px) auto no-repeat; pointer-events: none; }
.app-palette[data-theme='dark'] .auth-page { background: #0f1523; }
.app-palette[data-theme='dark'] .auth-page::before { background-image: var(--auth-background-dark); }
.auth-page__header { display: flex; justify-content: space-between; align-items: center; gap: 20px; min-height: 88px; padding: 16px clamp(20px, 4vw, 64px); }
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
/* A card with Lobbie peeking over it makes room for him and lets him replace the ticket mark. */
/* Starts high on the page; Lobbie's antennae may rise into the empty middle of the header. */
.auth-page__body:has(.auth-lobbie) { align-items: start; padding-top: 0; }
.auth-page__card:has(.auth-lobbie) { position: relative; margin-top: 112px; border-radius: 28px; box-shadow: 0 20px 60px rgb(120 84 20 / 0.12); }
.auth-page__card:has(.auth-lobbie) .auth-page__mark { display: none; }
.auth-page__card:has(.auth-lobbie) h1 { font-size: 2rem; }
.auth-page__card:has(.auth-lobbie) .auth-page__intro { max-width: 22rem; margin-inline: auto; line-height: 1.6; }
/* Leading mail and lock icons inside the fields. */
.auth-page__card:has(.auth-lobbie) #login-email,
.auth-page__card:has(.auth-lobbie) #login-password,
.auth-page__card:has(.auth-lobbie) #reg-name,
.auth-page__card:has(.auth-lobbie) #reg-email,
.auth-page__card:has(.auth-lobbie) #reg-password,
.auth-page__card:has(.auth-lobbie) #reg-confirm { padding-left: 48px; background: no-repeat 16px center / 20px 20px; }
.auth-page__card:has(.auth-lobbie) #reg-name { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b6b72' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='8' r='4'/%3E%3Cpath d='M4 21a8 8 0 0 1 16 0'/%3E%3C/svg%3E"); }
.auth-page__card:has(.auth-lobbie) #login-email,
.auth-page__card:has(.auth-lobbie) #reg-email { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b6b72' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='5' width='18' height='14' rx='2'/%3E%3Cpath d='m3 7 9 6 9-6'/%3E%3C/svg%3E"); }
.auth-page__card:has(.auth-lobbie) #login-password,
.auth-page__card:has(.auth-lobbie) #reg-password,
.auth-page__card:has(.auth-lobbie) #reg-confirm { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b6b72' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='5' y='11' width='14' height='10' rx='2'/%3E%3Cpath d='M8 11V7a4 4 0 0 1 8 0v4'/%3E%3Ccircle cx='12' cy='16' r='1'/%3E%3C/svg%3E"); }
.auth-page__card:has(.auth-lobbie) .auth-back { display: flex; width: fit-content; margin-inline: auto; }
.auth-page__card:has(.auth-lobbie) .auth-page__switch a { display: inline-flex; align-items: center; min-height: 32px; padding: 2px 12px; border-radius: 999px; background: var(--sunny); color: var(--on-accent); text-decoration: none; }
.auth-page__card:has(.auth-lobbie) .auth-page__switch a:hover { background: var(--sunny-deep); }
</style>
