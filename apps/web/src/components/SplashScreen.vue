<script setup lang="ts">
import logoUrl from '@web/assets/lobangers-logo.svg'
import { SPLASH_DURATION_MS } from '@web/components/splash-config'
import TicketLoader from '@web/components/TicketLoader.vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'

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
      <img :src="logoUrl" alt="" width="288" height="60" class="splash__logo" />
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
  overflow: hidden;
  background: var(--paper);
  color: var(--ink);
}

.splash__logo {
  display: block;
  width: min(54vw, 18rem);
  height: auto;
  animation: splash-rise 480ms var(--ease-out, ease-out) backwards;
}

.splash__loader {
  color: var(--coral);
  animation: splash-rise 480ms 120ms var(--ease-out, ease-out) backwards;
}

@keyframes splash-rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}

.splash-leave-active {
  transition: opacity 360ms ease;
}

.splash-leave-active .splash__logo,
.splash-leave-active .splash__loader {
  transition: transform 360ms var(--ease-out, ease-out);
}

.splash-leave-to {
  opacity: 0;
}

.splash-leave-to .splash__logo,
.splash-leave-to .splash__loader {
  transform: translateY(-12px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .splash__logo,
  .splash__loader {
    animation: none;
  }

  .splash-leave-active .splash__logo,
  .splash-leave-active .splash__loader {
    transition: none;
  }

  .splash-leave-to .splash__logo,
  .splash-leave-to .splash__loader {
    transform: none;
  }
}
</style>
