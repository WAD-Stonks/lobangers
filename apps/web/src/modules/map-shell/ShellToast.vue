<script setup lang="ts">
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { type ToastAction, useToast } from '@web/modules/map-shell/use-toast'

// The live region is always in the page so screen readers announce each new toast.
const toast = useToast()

const runAction = (action: ToastAction) => {
  toast.dismiss()
  action.run()
}
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
        <button
          v-if="toast.current.value.action"
          type="button"
          class="shell-toast__action"
          data-testid="toast-action"
          @click="runAction(toast.current.value.action)"
        >
          {{ toast.current.value.action.label }}
        </button>
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
  /* The pill inverts in dark mode (light fill), so the icon colours need darker partners there. */
  --toast-icon: var(--sunny);
  --toast-error-icon: var(--tag-end-bg);
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
  color: var(--on-ink);
  background: var(--ink-strong);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-card);
  transform: translateX(-50%);
  pointer-events: auto;
}

.shell-toast :deep(svg) {
  color: var(--toast-icon);
}

.shell-toast--error :deep(svg) {
  color: var(--toast-error-icon);
}

.app-palette[data-theme='dark'] .shell-toast {
  --toast-icon: #7a5a00;
  --toast-error-icon: #a8391a;
}

.shell-toast__text {
  min-width: 0;
  overflow-wrap: anywhere;
}

/* Text button inside the pill; the padding makes a 44px target without growing the pill. */
.shell-toast__action {
  flex: none;
  min-height: var(--hit);
  margin: -10px -14px -10px 0;
  padding: 0 14px;
  font: inherit;
  font-weight: 750;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: var(--radius-pill);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
  touch-action: manipulation;
}

.shell-toast__action:hover {
  text-decoration-thickness: 2px;
}

.shell-toast__action:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
}
</style>
