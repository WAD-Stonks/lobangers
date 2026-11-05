<script setup lang="ts">
import ConfirmSheet from '@web/components/ConfirmSheet.vue'
import { useConfirm } from '@web/lib/use-confirm'

const { current, confirm, cancel } = useConfirm()
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-fade">
      <ConfirmSheet v-if="current" :request="current" @confirm="confirm" @cancel="cancel" />
    </Transition>
  </Teleport>
</template>

<style>
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1080;
  display: grid;
  place-items: center;
  padding: 16px;
}

.confirm-overlay__scrim {
  position: absolute;
  inset: 0;
  padding: 0;
  border: 0;
  background: rgba(17, 17, 20, 0.55);
  cursor: default;
}

.confirm-dialog {
  position: relative;
  width: min(100%, 26rem);
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  padding: 24px;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-card, 20px);
  background: var(--paper-white);
  color: var(--ink);
  box-shadow: var(--shadow-card);
  font-family: var(--font-sans);
}

.confirm-dialog__title {
  margin: 0 0 8px;
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 700;
  text-wrap: balance;
  overflow-wrap: anywhere;
}

.confirm-dialog__body {
  margin: 0 0 20px;
  color: var(--ink-muted);
  overflow-wrap: anywhere;
}

.confirm-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.confirm-dialog__button {
  min-height: var(--hit, 44px);
  padding: 0 20px;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  font: 700 0.95rem var(--font-sans);
  cursor: pointer;
  touch-action: manipulation;
}

.confirm-dialog__button:focus-visible {
  outline: 3px solid var(--sunny-ring);
  outline-offset: 2px;
}

.confirm-dialog__button--cancel {
  border-color: var(--hairline-strong);
  background: transparent;
  color: var(--ink);
}

.confirm-dialog__button--cancel:hover {
  background: var(--paper-hover);
}

.confirm-dialog__button--danger {
  background: var(--coral);
  color: var(--on-ink);
}

.confirm-dialog__button--danger:hover {
  background: var(--coral-deep);
}

.confirm-dialog__button--primary {
  background: var(--ink-strong);
  color: var(--on-ink, var(--paper-white));
}

.confirm-dialog__button--primary:hover {
  background: var(--ink-strong-hover);
}

@media (max-width: 480px) {
  .confirm-dialog__actions {
    flex-direction: column-reverse;
  }
  .confirm-dialog__button {
    width: 100%;
  }
}

.confirm-fade-enter-active,
.confirm-fade-leave-active {
  transition: opacity 150ms ease;
}
.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .confirm-fade-enter-active,
  .confirm-fade-leave-active {
    transition: none;
  }
}
</style>
