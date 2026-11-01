<script setup lang="ts">
import { authPrompt } from '@web/modules/account/auth-prompt'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const isSaved = computed(() => route.query.tab === 'saved')
const isShare = computed(() => route.query.tab === 'add-deal')
const visible = computed(() => Boolean(authPrompt.value) || route.name === 'auth-required')
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
const cancel = () => { if (authPrompt.value) authPrompt.value.resolve(null); else void router.push('/browse') }
</script>

<template>
  <section v-if="visible" class="auth-prompt" aria-labelledby="auth-prompt-title" @keydown.esc="cancel">
    <div class="auth-prompt__content" :class="{ 'auth-prompt__content--saved': isSaved || isShare }">
      <template v-if="isSaved || isShare">
        <svg class="saved-prompt__illustration" viewBox="0 0 540 330" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id="saved-yellow" x2="1" y2="1"><stop stop-color="#ffe976" /><stop offset="1" stop-color="#f8cc35" /></linearGradient>
            <filter id="saved-shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#584827" flood-opacity=".12" /></filter>
          </defs>
          <path fill="#fff8e6" d="M38 180C14 116 80 74 149 57S291 8 341 64s133 29 155 110-55 126-151 123S71 269 38 180" />
          <g v-if="isSaved" transform="translate(64 52) rotate(-8 105 120)" filter="url(#saved-shadow)">
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
        <h2 id="auth-prompt-title" ref="heading" tabindex="-1">{{ isShare ? 'Share good lobangs' : 'Save your favourite deals' }}</h2>
        <p class="saved-prompt__intro">{{ isShare ? 'Create a free account to share deals, send favourites to friends, and help more food lovers discover great finds.' : 'Create a free account to save deals, keep track of expiries, and join a community of food lovers.' }}</p>
        <div class="saved-prompt__benefits">
          <div class="saved-prompt__benefit"><span class="saved-prompt__icon"><svg v-if="isShare" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3m-4 4 4-4 4 4M7 10H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-2" /></svg><ShellIcon v-else name="bookmark" :size="26" /></span><div><h3>{{ isShare ? 'Share with friends' : 'Save deals you love' }}</h3><p>{{ isShare ? 'Send great food deals to the people you know.' : 'Keep your favourite food deals all in one place.' }}</p></div></div>
          <div class="saved-prompt__benefit"><span class="saved-prompt__icon"><ShellIcon v-if="isShare" name="edit" :size="28" /><svg v-else width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></svg></span><div><h3>{{ isShare ? 'Post your finds' : 'Track expiries' }}</h3><p>{{ isShare ? 'Share hidden gems, promos, and stall deals you discover.' : 'Keep expiry dates in view so you never miss a great deal.' }}</p></div></div>
          <div class="saved-prompt__benefit"><span class="saved-prompt__icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="9" cy="7" r="3" /><path d="M2 21v-3a7 7 0 0 1 14 0v3M16 4a3 3 0 0 1 0 6m3 4a6 6 0 0 1 3 5v2" /></svg></span><div><h3>{{ isShare ? 'Help the community' : 'Join the community' }}</h3><p>{{ isShare ? 'Let more foodies discover good lobangs near them.' : 'Share and discover deals with fellow foodies.' }}</p></div></div>
        </div>
        <button class="auth-prompt__primary saved-prompt__signup" type="button" @click="choose('register')">Create a free account</button>
        <button class="auth-prompt__secondary" type="button" @click="choose('login')">Log in</button>
      </template>
      <template v-else>
      <button class="auth-prompt__close" type="button" aria-label="Close login prompt" @click="cancel">×</button>
      <h2 id="auth-prompt-title" ref="heading" tabindex="-1">Log in or sign up</h2>
      <p>Save your favourite deals and join the community with a free account.</p>
      <button class="auth-prompt__primary" type="button" @click="choose('login')">Log in</button>
      <button class="auth-prompt__secondary" type="button" @click="choose('register')">Create an account</button>
      </template>
    </div>
  </section>
</template>

<style scoped>
.auth-prompt { height: 100%; overflow-y: auto; color: var(--ink); background: var(--paper-white); }
.auth-prompt__content { position: relative; display: grid; gap: 12px; padding: 40px 28px 24px; }
h2 { outline: none; margin: 0; font-size: 1.5rem; }
p { margin: 0 0 12px; color: var(--ink-muted); line-height: 1.5; }
button { min-height: 44px; border-radius: 12px; font-weight: 650; }
.auth-prompt__close { position: absolute; top: 8px; right: 12px; width: 36px; min-height: 36px; border: 0; background: transparent; font-size: 24px; }
.auth-prompt__primary { border: 1px solid var(--sunny); background: var(--sunny); color: var(--ink); }
.auth-prompt__secondary { border: 1px solid var(--hairline); background: white; color: var(--ink); }

.saved-prompt__illustration { display: block; width: 100%; height: auto; max-height: 260px; margin: 0 auto 4px; }
.auth-prompt__content--saved h2 { font-family: var(--font-sans); font-size: clamp(1.75rem, 2.3vw, 2.25rem); font-weight: 750; line-height: 1.15; letter-spacing: -.035em; }
.saved-prompt__intro { font-size: 1rem; margin: 4px 0 12px; }
.saved-prompt__benefits { display: grid; gap: 12px; margin: 0 0 12px; }
.saved-prompt__benefit { display: flex; align-items: center; gap: 16px; padding: 16px; border-radius: 18px; background: #fbfaf7; }
.saved-prompt__icon { display: grid; place-items: center; flex: 0 0 52px; height: 52px; border-radius: 50%; background: #fff0b4; }
.saved-prompt__benefit h3 { margin: 0 0 4px; font-size: 1rem; line-height: 1.3; font-weight: 700; }
.saved-prompt__benefit p { margin: 0; font-size: .9375rem; line-height: 1.4; }
.auth-prompt__content--saved button { min-height: 48px; }
.auth-prompt__content--saved { padding-bottom: calc(24px + var(--sheet-offset, 0px)); }
@media (max-width: 599.98px) { .saved-prompt__benefit { gap: 12px; padding: 14px; } }
</style>
