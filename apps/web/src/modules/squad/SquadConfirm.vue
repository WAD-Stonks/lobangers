<script setup lang="ts">
import { useSheetFocus } from '@web/modules/squad/use-sheet-focus'
import { ref } from 'vue'

const props = withDefaults(
  defineProps<{
    title: string
    body: string
    confirmLabel: string
    cancelLabel: string
    busy?: boolean
    returnFocus?: HTMLElement | null
  }>(),
  { busy: false, returnFocus: null },
)
const emit = defineEmits<{ confirm: []; cancel: [] }>()

const dialog = ref<HTMLElement | null>(null)
const cancelButton = ref<HTMLButtonElement | null>(null)
const { onKeydown } = useSheetFocus({
  root: dialog,
  initial: cancelButton,
  returnTo: () => props.returnFocus,
  onEscape: () => emit('cancel'),
})
</script>

<template>
  <div class="squad-overlay squad-overlay--fixed">
    <button type="button" class="squad-overlay__scrim" :aria-label="cancelLabel" tabindex="-1" @click="emit('cancel')" />
    <div ref="dialog" class="squad-sheet" role="dialog" aria-modal="true" aria-labelledby="squad-confirm-title" @keydown="onKeydown">
      <h2 id="squad-confirm-title" class="squad-sheet__title">{{ title }}</h2>
      <p>{{ body }}</p>
      <div class="squad-sheet__actions">
        <button type="button" class="lb-btn squad-btn-danger" data-testid="squad-confirm" :disabled="busy" @click="emit('confirm')">{{ confirmLabel }}</button>
        <button ref="cancelButton" type="button" class="lb-btn squad-btn-dark" @click="emit('cancel')">{{ cancelLabel }}</button>
      </div>
    </div>
  </div>
</template>
