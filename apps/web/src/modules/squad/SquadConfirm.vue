<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'

// A small confirm sheet on the dark room surface ("Close the lobby?", "Remove Noah?"). Focus
// starts on the safe choice; Escape or tapping outside keeps things as they are.
withDefaults(
  defineProps<{ title: string; body: string; confirmLabel: string; cancelLabel: string; busy?: boolean }>(),
  { busy: false },
)
const emit = defineEmits<{ confirm: []; cancel: [] }>()

const cancelButton = ref<HTMLButtonElement | null>(null)
onMounted(() => void nextTick(() => cancelButton.value?.focus()))
</script>

<template>
  <div class="squad-overlay squad-overlay--fixed">
    <button type="button" class="squad-overlay__scrim" :aria-label="cancelLabel" tabindex="-1" @click="emit('cancel')" />
    <div class="squad-sheet" role="dialog" aria-modal="true" aria-labelledby="squad-confirm-title" @keydown.escape="emit('cancel')">
      <h2 id="squad-confirm-title" class="squad-sheet__title">{{ title }}</h2>
      <p>{{ body }}</p>
      <div class="squad-sheet__actions">
        <button type="button" class="lb-btn squad-btn-danger" data-testid="squad-confirm" :disabled="busy" @click="emit('confirm')">{{ confirmLabel }}</button>
        <button ref="cancelButton" type="button" class="lb-btn squad-btn-dark" @click="emit('cancel')">{{ cancelLabel }}</button>
      </div>
    </div>
  </div>
</template>
