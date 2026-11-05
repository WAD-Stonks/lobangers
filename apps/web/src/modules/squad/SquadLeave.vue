<script setup lang="ts">
import { useSheetFocus } from '@web/modules/squad/use-sheet-focus'
import { ref } from 'vue'

const props = withDefaults(
  defineProps<{
    code: string
    others: string[]
    isHost: boolean
    busy: boolean
    returnFocus?: HTMLElement | null
    stage?: 'lobby' | 'live'
  }>(),
  { returnFocus: null, stage: 'live' },
)
const emit = defineEmits<{ leave: []; stay: [] }>()

const dialog = ref<HTMLElement | null>(null)
const stayButton = ref<HTMLButtonElement | null>(null)
const { onKeydown } = useSheetFocus({
  root: dialog,
  initial: stayButton,
  returnTo: () => props.returnFocus,
  onEscape: () => emit('stay'),
})

const othersText = () => {
  const names = props.others
  const doing = props.stage === 'lobby' ? 'waiting' : 'voting'
  if (names.length === 0) return `Nobody else is ${doing} right now.`
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
  return `${list} keep ${doing} without you.`
}
const detailText = () =>
  props.stage === 'lobby'
    ? `You can rejoin with code ${props.code} while the lobby is open.`
    : `Your yays on this deal won't count. You can rejoin with code ${props.code} while the room is open.`
</script>

<template>
  <div class="squad-overlay" :class="{ 'squad-overlay--fixed': stage === 'lobby' }">
    <button type="button" class="squad-overlay__scrim" aria-label="Stay in the room" tabindex="-1" @click="emit('stay')" />
    <div ref="dialog" class="squad-sheet" role="dialog" aria-modal="true" aria-labelledby="squad-leave-title" @keydown="onKeydown">
      <h2 id="squad-leave-title" class="squad-sheet__title">Leave Room {{ code }}?</h2>
      <p>{{ othersText() }} {{ detailText() }}</p>
      <p v-if="isHost">You're the host, so the person who's been here longest takes over.</p>
      <div class="squad-sheet__actions">
        <button type="button" class="lb-btn squad-btn-danger" data-testid="squad-leave-confirm" :disabled="busy" @click="emit('leave')">Leave room</button>
        <button ref="stayButton" type="button" class="lb-btn squad-btn-dark" @click="emit('stay')">Stay in the room</button>
      </div>
    </div>
  </div>
</template>
