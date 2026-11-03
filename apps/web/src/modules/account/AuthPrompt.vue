<script setup lang="ts">
import AccountMoreList from '@web/modules/account/AccountMoreList.vue'
import { authPrompt } from '@web/modules/account/auth-prompt'
import { promptContent } from '@web/modules/account/auth-prompt-content'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { useBreakpoint } from '@web/modules/map-shell/use-breakpoint'
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
// The tab names the protected page the visitor was heading to; /add shows under Share.
const content = computed(() => promptContent(route.query.tab))
const visible = computed(() => Boolean(authPrompt.value) || route.name === 'auth-required')
// The Account tab of a bottom nav lands here when signed out; with no menu button in that layout,
// the menu rows that need no account (Squad, About, Dark mode, Map tutorial) follow the prompt.
const breakpoint = useBreakpoint()
const showMore = computed(() =>
  !authPrompt.value && route.name === 'auth-required' && route.query.tab === 'profile' && breakpoint.value !== 'desktop',
)
const choose = (choice: 'login' | 'register') => {
  if (authPrompt.value) authPrompt.value.resolve(choice)
  else void router.push({ name: choice === 'login' ? 'sign-in' : 'sign-up', query: { redirect: route.query.redirect } })
}
const heading = ref<HTMLElement | null>(null)
let returnFocus: HTMLElement | null = null
watch(visible, async (prompt) => {
  if (prompt) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    heading.value?.focus({ preventScroll: true })
  } else returnFocus?.focus()
}, { immediate: true })
const cancel = () => {
  if (authPrompt.value) authPrompt.value.resolve(null)
  else if (router.options.history.state.back) router.back()
  else void router.push('/browse')
}
</script>

<template>
  <section v-if="visible" class="auth-prompt" aria-labelledby="auth-prompt-title" @keydown.esc="cancel">
    <div class="auth-prompt__content auth-prompt__content--saved">
      <button class="auth-prompt__back" type="button" @click="cancel"><ShellIcon name="back" :size="16" />Back</button>
      <svg class="saved-prompt__illustration" viewBox="0 0 540 330" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="saved-yellow" x2="1" y2="1"><stop stop-color="#ffe976" /><stop offset="1" stop-color="#f8cc35" /></linearGradient>
          <filter id="saved-shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#584827" flood-opacity=".12" /></filter>
        </defs>
        <path class="saved-prompt__blob" fill="#fff8e6" d="M38 180C14 116 80 74 149 57S291 8 341 64s133 29 155 110-55 126-151 123S71 269 38 180" />
        <g v-if="content.illustration === 'bookmark'" transform="translate(64 52) rotate(-8 105 120)" filter="url(#saved-shadow)">
          <path d="M15 14Q0 14 0 32v208q0 21 19 12l81-43 82 43q19 9 19-12V32q0-18-19-18Z" fill="#dba729" />
          <path d="M34 0Q18 0 18 18v218q0 17 16 9l76-41 77 41q17 8 17-9V18q0-18-18-18Z" fill="url(#saved-yellow)" stroke="#dfb63d" stroke-width="2" />
          <path d="M109 141c-65-37-45-86-15-68q13 8 15 18 4-10 17-18c31-18 48 31-17 68" fill="white" />
        </g>
        <g v-else filter="url(#saved-shadow)">
          <path d="M62 248C41 152 113 93 225 91l9-42q3-15 17-4l82 91q9 10-1 20l-96 77q-14 12-13-6l4-45c-81-14-129 9-151 67q-5 14-14-1Z" fill="#dca628" />
          <path d="M77 235C57 146 126 91 237 86l7-40q3-14 15-2l82 90q9 10-2 19l-93 76q-13 11-12-5l4-47c-80-16-133 4-155 61q-3 7-6-3Z" fill="url(#saved-yellow)" />
        </g>
        <g transform="translate(238 100) rotate(6 124 89)" filter="url(#saved-shadow)">
          <rect width="248" height="178" rx="23" fill="white" stroke="#e7e5df" stroke-width="2" />
          <rect x="14" y="14" width="220" height="92" rx="13" fill="#f8f4eb" />
          <ellipse cx="79" cy="70" rx="49" ry="27" fill="#87603e" />
          <ellipse cx="79" cy="56" rx="49" ry="26" fill="#d3ac72" />
          <ellipse cx="79" cy="52" rx="42" ry="21" fill="#f6d16e" />
          <path d="M49 45q34-17 51 2T56 60q-19-13 41-13M49 51q40-12 55 7M58 40q40 7 30 22" fill="none" stroke="#fff2ba" stroke-width="4" stroke-linecap="round" />
          <circle cx="58" cy="40" r="10" fill="#6a9b3c" /><circle cx="46" cy="47" r="8" fill="#85ae44" /><circle cx="103" cy="61" r="10" fill="#ed7450" />
          <ellipse cx="84" cy="39" rx="13" ry="10" fill="#fff8db" /><ellipse cx="84" cy="39" rx="7" ry="5" fill="#f4b644" />
          <path d="m100 55 36-48m-28 51 36-48" stroke="#8f633c" stroke-width="5" stroke-linecap="round" />
          <rect x="151" y="25" width="82" height="34" rx="9" fill="#ffe25c" />
          <text x="192" y="47" text-anchor="middle" font-family="var(--font-sans)" font-size="16" font-weight="800" fill="#332d22">50% OFF</text>
          <path d="M22 125h111M22 145h77" stroke="#e5e4e0" stroke-width="9" stroke-linecap="round" />
          <path d="M211 151c-35-18-25-43-9-33q6 4 9 9 3-5 9-9c16-10 26 15-9 33" fill="#f36554" />
        </g>
        <path d="m129 39-8-20m-9 32-15-8m373 29 13-20m5 35 17-5M38 230l-21-7m24 26-18 8" stroke="#ffd458" stroke-width="7" stroke-linecap="round" />
      </svg>
      <h2 id="auth-prompt-title" ref="heading" tabindex="-1">{{ content.heading }}</h2>
      <p class="saved-prompt__intro">{{ content.intro }}</p>
      <div class="saved-prompt__benefits">
        <div v-for="benefit in content.benefits" :key="benefit.title" class="saved-prompt__benefit">
          <span class="saved-prompt__icon">
            <svg v-if="benefit.icon === 'share'" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3m-4 4 4-4 4 4M7 10H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-2" /></svg>
            <svg v-else-if="benefit.icon === 'clock'" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></svg>
            <svg v-else-if="benefit.icon === 'people'" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="9" cy="7" r="3" /><path d="M2 21v-3a7 7 0 0 1 14 0v3M16 4a3 3 0 0 1 0 6m3 4a6 6 0 0 1 3 5v2" /></svg>
            <ShellIcon v-else :name="benefit.icon" :size="26" />
          </span>
          <div><h3>{{ benefit.title }}</h3><p>{{ benefit.text }}</p></div>
        </div>
      </div>
      <button class="auth-prompt__primary saved-prompt__signup" type="button" @click="choose('register')">Create a free account</button>
      <button class="auth-prompt__secondary" type="button" @click="choose('login')">Log in</button>
      <AccountMoreList v-if="showMore" class="auth-prompt__more" />
    </div>
  </section>
</template>

<style scoped>
/* Light values are the original literals; dark mode swaps the pale washes for warm charcoal so the
   illustration and benefit rows do not glare on the dark card. */
.auth-prompt { --saved-blob: #fff8e6; --saved-benefit-bg: var(--paper-white); --saved-icon-bg: #fff0b4; height: 100%; overflow-y: auto; color: var(--ink); background: var(--page-background, var(--paper-white)); }
.app-palette[data-theme='dark'] .auth-prompt { --saved-blob: var(--sunny-wash); --saved-benefit-bg: var(--paper-hover); --saved-icon-bg: var(--sunny-soft); }
.auth-prompt__content { position: relative; display: grid; gap: 12px; padding: 40px 28px 24px; }
.auth-prompt__more { margin-top: 16px; padding-top: 8px; border-top: 1px solid var(--hairline); text-align: left; }
h2 { outline: none; margin: 0; font-size: 1.5rem; }
p { margin: 0 0 12px; color: var(--ink-muted); line-height: 1.5; }
button { min-height: 44px; border-radius: 12px; font-weight: 650; }
.auth-prompt__back { display: inline-flex; align-items: center; justify-self: start; gap: 6px; min-height: var(--hit); margin: -12px 0 0; padding: 0; border: 0; background: transparent; font: 700 0.8125rem/1 var(--font-sans); color: var(--ink-muted); cursor: pointer; }
.auth-prompt__back:hover { color: var(--ink); }
.auth-prompt__primary { border: 1px solid var(--sunny); background: var(--sunny); color: var(--on-accent); }
.auth-prompt__secondary { border: 1px solid var(--hairline); background: var(--paper-white); color: var(--ink); }
.auth-prompt__primary, .auth-prompt__secondary { cursor: pointer; touch-action: manipulation; transition: background-color 150ms ease, border-color 150ms ease; }
@media (hover: hover) and (pointer: fine) {
  .auth-prompt__primary:hover { border-color: var(--sunny-deep); background: var(--sunny-deep); }
  .auth-prompt__secondary:hover { border-color: var(--hairline-strong); background: var(--paper-hover); }
}

.saved-prompt__illustration { display: block; width: 100%; height: auto; max-height: 260px; margin: 0 auto 4px; }
.saved-prompt__blob { fill: var(--saved-blob); }
.auth-prompt__content--saved h2 { font-family: var(--font-sans); font-size: clamp(1.75rem, 2.3vw, 2.25rem); font-weight: 750; line-height: 1.15; letter-spacing: -.035em; }
.saved-prompt__intro { font-size: 1rem; margin: 4px 0 12px; }
.saved-prompt__benefits { display: grid; gap: 12px; margin: 0 0 12px; }
.saved-prompt__benefit { display: flex; align-items: center; gap: 16px; padding: 16px; border-radius: 18px; background: var(--saved-benefit-bg); }
.saved-prompt__icon { display: grid; place-items: center; flex: 0 0 52px; height: 52px; border-radius: 50%; background: var(--saved-icon-bg); }
.saved-prompt__benefit > div { min-width: 0; overflow-wrap: anywhere; }
.saved-prompt__benefit h3 { margin: 0 0 4px; font-size: 1rem; line-height: 1.3; font-weight: 700; }
.saved-prompt__benefit p { margin: 0; font-size: .9375rem; line-height: 1.4; }
.auth-prompt__content--saved button { min-height: 48px; }
.auth-prompt__content--saved { padding-bottom: calc(24px + var(--sheet-offset, 0px) + env(safe-area-inset-bottom, 0px)); }
@media (max-width: 599.98px) { .saved-prompt__benefit { gap: 12px; padding: 14px; } }
/* 320px phones: a little less side padding so the benefit rows keep room for their text. */
@media (max-width: 359.98px) { .auth-prompt__content { padding-inline: 18px; } .saved-prompt__icon { flex-basis: 44px; height: 44px; } }
</style>
