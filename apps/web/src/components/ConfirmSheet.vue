<script setup lang="ts">
import type { ConfirmRequest } from '@web/lib/use-confirm'
import { useSheetFocus } from '@web/modules/squad/use-sheet-focus'
import { ref } from 'vue'

defineProps<{ request: ConfirmRequest }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()

const dialog = ref<HTMLElement | null>(null)
const cancelButton = ref<HTMLButtonElement | null>(null)
const { onKeydown } = useSheetFocus({
  root: dialog,
  initial: cancelButton,
  returnTo: () => null,
  onEscape: () => emit('cancel'),
})
</script>

<template>
  <div class="confirm-overlay">
    <button type="button" class="confirm-overlay__scrim" tabindex="-1" :aria-label="request.cancelLabel ?? 'Cancel'" @click="emit('cancel')" />
    <div
      ref="dialog"
      class="confirm-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-body"
      data-testid="confirm-dialog"
      @keydown="onKeydown"
    >
      <h2 id="confirm-dialog-title" class="confirm-dialog__title">{{ request.title }}</h2>
      <p id="confirm-dialog-body" class="confirm-dialog__body">{{ request.body }}</p>
      <div class="confirm-dialog__actions">
        <button ref="cancelButton" type="button" class="confirm-dialog__button confirm-dialog__button--cancel" @click="emit('cancel')">
          {{ request.cancelLabel ?? 'Cancel' }}
        </button>
        <button
          type="button"
          class="confirm-dialog__button"
          :class="`confirm-dialog__button--${request.tone ?? 'danger'}`"
          data-testid="confirm-dialog-confirm"
          @click="emit('confirm')"
        >
          {{ request.confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
