<script setup lang="ts">
import logoUrl from '@web/assets/logo.png'
import { SPLASH_DURATION_MS } from '@web/components/splash-config'
import TicketLoader from '@web/components/TicketLoader.vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'

// A solid sunny-yellow curtain with the logo in the middle, held for a fixed beat on first load,
// then launched up off the top of the screen to reveal the app behind it.
const visible = ref(true)
let timer: ReturnType<typeof setTimeout> | undefined

onMounted(() => {
  timer = setTimeout(() => {
    visible.value = false
  }, SPLASH_DURATION_MS)
})

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <Transition name="splash">
    <div v-if="visible" class="splash" role="status" aria-live="polite" data-testid="splash-screen">
      <img :src="logoUrl" alt="Lobangers" class="splash__logo" />
      <TicketLoader class="splash__loader" />
      <span class="visually-hidden">Loading Lobangers…</span>
    </div>
  </Transition>
</template>

<style scoped>
.splash {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: var(--space-6, 2rem);
  background: var(--sunny);
  color: var(--ink);
}

.splash__logo {
  display: block;
  width: min(60vw, 20rem);
  aspect-ratio: 5.6;
  object-fit: cover;
  object-position: center 48%;
}

.splash__loader {
  color: var(--ink);
}

/* Extends the curtain above the viewport so the wind-up squat never shows the page behind. */
.splash::before {
  content: '';
  position: absolute;
  inset: auto 0 100% 0;
  height: 30vh;
  background: inherit;
}

/* Exit: a quick squat downwards to wind up, then launch up and clear off the top. */
.splash-leave-active {
  animation: splash-launch 0.65s forwards;
}

@keyframes splash-launch {
  0% {
    transform: translateY(0);
    animation-timing-function: ease-out;
  }
  28% {
    transform: translateY(6%);
    animation-timing-function: cubic-bezier(0.55, 0, 0.8, 0.2);
  }
  100% {
    transform: translateY(-105%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .splash-leave-active {
    animation: none;
  }
}
</style>
