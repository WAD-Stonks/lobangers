<script setup lang="ts">
import type { SquadMember, SquadState } from '@broke-oclock/contracts/squad'
import { avatarUrl } from '@web/modules/squad/avatar-art'
import SquadSeatBadge from '@web/modules/squad/SquadSeatBadge.vue'
import { computed } from 'vue'

const props = defineProps<{ state: SquadState }>()
const emit = defineEmits<{ remove: [member: SquadMember] }>()

const seats = computed(() => [
  ...props.state.members.filter((member) => !member.spectator),
  ...props.state.members.filter((member) => member.spectator),
])
const choosing = computed(() => props.state.phase === 'DECIDING' || props.state.phase === 'MATCHED')
const isHost = computed(() => !!props.state.me?.isHost)
const isMe = (member: SquadMember) => member.id === props.state.me?.memberId

const badge = (member: SquadMember) => {
  if (member.spectator) return { kind: 'watch', label: `${member.name} is watching` }
  if (member.away) return { kind: 'away', label: `${member.name} is away` }
  if (choosing.value && member.choice === 'AGAIN')
    return { kind: 'again', label: `${member.name} wants to vote again` }
  if (choosing.value && member.choice === 'NEXT')
    return { kind: 'next', label: `${member.name} wants the next deal` }
  if (props.state.phase === 'DECIDING') return { kind: 'wait', label: `${member.name} is choosing` }
  if (member.stance === 'YAY') return { kind: 'yay', label: `${member.name} says yay` }
  if (member.stance === 'NAH') return { kind: 'nah', label: `${member.name} says nah` }
  return { kind: 'wait', label: `${member.name} is thinking` }
}
</script>

<template>
  <ul class="squad-members" aria-label="People in the room">
    <li
      v-for="member in seats"
      :key="member.id"
      class="squad-seat"
      :class="{ 'squad-seat--me': isMe(member), 'squad-seat--away': member.away, 'squad-seat--watch': member.spectator }"
      :data-member-id="member.id"
    >
      <span class="visually-hidden">{{ badge(member).label }}{{ member.isHost ? ', host' : '' }}</span>
      <button v-if="isHost && !isMe(member)" type="button" class="squad-seat__face" :aria-label="`Remove ${member.name}`" @click="emit('remove', member)">
        <img :src="avatarUrl(member.avatar)" alt="" width="40" height="40" />
        <SquadSeatBadge :kind="badge(member).kind" />
      </button>
      <span v-else class="squad-seat__face" aria-hidden="true">
        <img :src="avatarUrl(member.avatar)" alt="" width="40" height="40" />
        <SquadSeatBadge :kind="badge(member).kind" />
      </span>
      <span class="squad-seat__name" aria-hidden="true">{{ isMe(member) ? 'You' : member.name }}</span>
      <span v-if="member.isHost" class="squad-seat__host" aria-hidden="true">Host</span>
    </li>
  </ul>
</template>
