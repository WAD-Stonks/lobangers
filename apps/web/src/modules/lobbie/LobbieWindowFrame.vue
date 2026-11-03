<script setup lang="ts">
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { useId } from 'vue'

// The floating chat window on the All Deals page. It takes the same slots as PanelFrame (the
// conversation, then a sticky action bar for the message box), so LobbiePanel can sit in either.
defineProps<{ title: string }>()
defineSlots<{ default(): unknown; actions?(): unknown }>()
const emit = defineEmits<{ close: [] }>()
const headingId = useId()
</script>

<template>
  <section
    class="lobbie-window"
    role="dialog"
    aria-modal="false"
    :aria-labelledby="headingId"
    data-testid="lobbie-window"
    @keydown.esc.stop="emit('close')"
  >
    <header class="lobbie-window__header">
      <div class="lobbie-window__titles">
        <h2 :id="headingId" class="lobbie-window__title">{{ title }}</h2>
        <p class="lobbie-window__subtitle">Your lobang-hunting buddy</p>
      </div>
      <button type="button" class="lobbie-window__close" aria-label="Close chat" data-testid="lobbie-window-close" @click="emit('close')">
        <ShellIcon name="close" :size="18" :stroke-width="2.4" />
      </button>
    </header>
    <div class="lobbie-window__body">
      <slot />
    </div>
    <div v-if="$slots.actions" class="lobbie-window__actions">
      <slot name="actions" />
    </div>
  </section>
</template>

<style scoped>
.lobbie-window {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  color: var(--ink);
  background: var(--paper-white);
  border: 1px solid var(--hairline);
  border-radius: 28px;
  box-shadow: var(--shadow-card);
}

.lobbie-window__header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 16px 16px 14px 20px;
  border-bottom: 1px solid var(--hairline);
}

.lobbie-window__titles {
  flex: 1 1 auto;
  min-width: 0;
}

.lobbie-window__title {
  margin: 0;
  font: 700 1.0625rem / 1.3 var(--font-sans);
}

.lobbie-window__subtitle {
  margin: 2px 0 0;
  font-size: 0.8125rem;
  color: var(--ink-muted);
}

.lobbie-window__close {
  display: grid;
  flex: none;
  place-items: center;
  width: var(--hit);
  height: var(--hit);
  padding: 0;
  color: var(--on-ink);
  background: var(--ink-strong);
  border: 0;
  border-radius: 50%;
  cursor: pointer;
}

.lobbie-window__close:hover {
  background: var(--ink-strong-hover);
}

.lobbie-window__close:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
}

/* The only part that scrolls. */
.lobbie-window__body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 18px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.lobbie-window__actions {
  padding: 12px 16px 16px;
  border-top: 1px solid var(--hairline);
}
</style>
