<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'

// "Leave Room KOPI?" Leaving lets the others carry on without you; the code still works while
// the room is open. Escape or tapping outside keeps you in.
const props = defineProps<{ code: string; others: string[]; isHost: boolean; busy: boolean }>()
const emit = defineEmits<{ leave: []; stay: [] }>()

const stayButton = ref<HTMLButtonElement | null>(null)
onMounted(() => void nextTick(() => stayButton.value?.focus()))

const othersText = () => {
  const names = props.others
  if (names.length === 0) return 'Nobody else is voting right now.'
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
  return `${list} keep voting without you.`
}
</script>

<template>
  <div class="squad-overlay">
    <button type="button" class="squad-overlay__scrim" aria-label="Stay in the room" tabindex="-1" @click="emit('stay')" />
    <div class="squad-sheet" role="dialog" aria-modal="true" aria-labelledby="squad-leave-title" @keydown.escape="emit('stay')">
      <h2 id="squad-leave-title" class="squad-sheet__title">Leave Room {{ code }}?</h2>
      <p>{{ othersText() }} Your yays on this deal won't count. You can rejoin with code {{ code }} while the room is open.</p>
      <p v-if="isHost">You're the host, so the person who's been here longest takes over.</p>
      <div class="squad-sheet__actions">
        <button type="button" class="lb-btn squad-btn-danger" data-testid="squad-leave-confirm" :disabled="busy" @click="emit('leave')">Leave room</button>
        <button ref="stayButton" type="button" class="lb-btn squad-btn-dark" @click="emit('stay')">Stay in the room</button>
      </div>
    </div>
  </div>
</template>
