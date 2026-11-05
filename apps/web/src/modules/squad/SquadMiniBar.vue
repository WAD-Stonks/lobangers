<script setup lang="ts">
import type { SquadState } from '@broke-oclock/contracts/squad'
import { avatarUrl } from '@web/modules/squad/avatar-art'
import type { SquadRoom } from '@web/modules/squad/use-squad-room'
import { computed } from 'vue'

const props = defineProps<{ room: SquadRoom; state: SquadState }>()
const emit = defineEmits<{ open: [] }>()

const deal = computed(() => props.room.currentDeal.value)
const status = computed(() => {
  const { phase, tally, status } = props.state
  if (status === 'LOBBY') return `${props.state.members.length} in the lobby`
  if (phase === 'MATCHED') return "It's a match!"
  if (phase === 'DECIDING') return 'Vote again or next deal?'
  if (phase === 'OUT_OF_DEALS') return 'Out of deals'
  return `${tally.yesPeople} of ${tally.voters} say yay`
})
</script>

<template>
  <button type="button" class="squad-mini" data-testid="squad-mini" :aria-label="`Open Room ${state.code}`" @click="emit('open')">
    <span class="squad-mini__row">
      <span class="squad-live-dot" aria-hidden="true" />
      <strong class="squad-mini__name">Room <span translate="no">{{ state.code }}</span></strong>
      <span class="squad-mini__status">{{ status }}</span>
      <span class="squad-mini__faces" aria-hidden="true">
        <img v-for="member in state.members.slice(0, 5)" :key="member.id" :src="avatarUrl(member.avatar)" alt="" width="26" height="26" />
      </span>
    </span>
    <span v-if="deal" class="squad-mini__deal">Voting on {{ deal.title }}</span>
    <span class="squad-mini__open">Open the room</span>
  </button>
</template>
