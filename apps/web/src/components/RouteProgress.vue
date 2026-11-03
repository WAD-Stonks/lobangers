<script setup lang="ts">
import { pendingNavigationFor } from '@web/router/pending-navigation'
import { onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const SHOW_DELAY_MS = 100
const pending = pendingNavigationFor(useRouter())
const visible = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
watch(pending, (to) => {
  clearTimeout(timer)
  visible.value = false
  if (to === null || to.matched[0]?.meta.layout === 'canvas') return
  timer = setTimeout(() => {
    visible.value = true
  }, SHOW_DELAY_MS)
})
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div v-if="visible" class="route-progress" role="progressbar" aria-label="Loading page" data-testid="route-progress">
    <span class="route-progress__bar" />
  </div>
</template>

<style scoped>
.route-progress {
  position: fixed;
  inset: 0 0 auto;
  z-index: 2100;
  height: 3px;
  overflow: hidden;
  pointer-events: none;
}

.route-progress__bar {
  display: block;
  width: 40%;
  height: 100%;
  border-radius: 0 999px 999px 0;
  background: var(--coral);
  animation: route-progress-slide 1.1s var(--ease-out, ease-in-out) infinite;
}

@keyframes route-progress-slide {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(250%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .route-progress__bar {
    width: 100%;
    opacity: 0.7;
    animation: none;
  }
}
</style>
