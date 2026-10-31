<script setup lang="ts">
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { useToast } from '@web/modules/map-shell/use-toast'

// The live region is always in the page so screen readers announce each new toast.
const toast = useToast()
</script>

<template>
  <div class="shell-toast-region" aria-live="polite" aria-atomic="true" data-testid="toast-region">
    <Transition name="shell-rise">
      <div
        v-if="toast.current.value"
        :key="toast.current.value.id"
        class="shell-toast"
        :class="`shell-toast--${toast.current.value.tone}`"
        :role="toast.current.value.tone === 'error' ? 'alert' : 'status'"
        data-testid="toast"
      >
        <ShellIcon :name="toast.current.value.tone === 'error' ? 'close' : 'check'" :size="18" />
        <span class="shell-toast__text">{{ toast.current.value.text }}</span>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.shell-toast-region {
  position: absolute;
  inset: 0;
  z-index: 60;
  pointer-events: none;
}

.shell-toast {
  position: absolute;
  top: var(--toast-top, auto);
  bottom: var(--toast-bottom, auto);
  left: var(--map-centre-x, 50%);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  box-sizing: border-box;
  max-width: calc(100vw - 2 * var(--shell-gutter));
  min-height: 48px;
  padding: 12px 22px;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--paper);
  background: var(--ink-strong);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-card);
  transform: translateX(-50%);
  pointer-events: auto;
}

.shell-toast :deep(svg) {
  color: var(--sunny);
}

.shell-toast--error :deep(svg) {
  color: var(--tag-end-bg);
}

.shell-toast__text {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
