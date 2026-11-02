<script setup lang="ts">
import type { SquadMember, SquadState } from '@broke-oclock/contracts/squad'
import { avatarUrl, THUMBS_DOWN_URL, THUMBS_UP_URL } from '@web/modules/squad/avatar-art'
import { computed } from 'vue'

// Everyone in the room and where they stand: thumbs up or down while voting, again or next
// while deciding, "…" while thinking. Each seat is where that person's yay stickers fly from.
const props = defineProps<{ state: SquadState }>()

const voters = computed(() => props.state.members.filter((member) => !member.spectator))
const watchers = computed(() => props.state.members.filter((member) => member.spectator))
const deciding = computed(() => props.state.phase === 'DECIDING')

const badge = (member: SquadMember) => {
  if (member.away) return { kind: 'away', label: `${member.name} is away` }
  if (deciding.value) {
    if (member.choice === 'AGAIN') return { kind: 'again', label: `${member.name} wants to vote again` }
    if (member.choice === 'NEXT') return { kind: 'next', label: `${member.name} wants the next deal` }
    return { kind: 'wait', label: `${member.name} is choosing` }
  }
  if (member.stance === 'YAY') return { kind: 'yay', label: `${member.name} says yay` }
  if (member.stance === 'NAH') return { kind: 'nah', label: `${member.name} says nah` }
  return { kind: 'wait', label: `${member.name} is thinking` }
}
</script>

<template>
  <ul class="squad-members" aria-label="People in the room">
    <li
      v-for="member in voters"
      :key="member.id"
      class="squad-seat"
      :class="{ 'squad-seat--me': member.id === state.me?.memberId, 'squad-seat--away': member.away }"
      :data-member-id="member.id"
    >
      <span class="visually-hidden">{{ badge(member).label }}{{ member.isHost ? ', host' : '' }}</span>
      <span class="squad-seat__face" aria-hidden="true">
        <img :src="avatarUrl(member.avatar)" alt="" width="44" height="44" />
        <span class="squad-seat__badge" :class="`squad-seat__badge--${badge(member).kind}`">
          <img v-if="badge(member).kind === 'yay'" :src="THUMBS_UP_URL" alt="" width="16" height="16" />
          <img v-else-if="badge(member).kind === 'nah'" :src="THUMBS_DOWN_URL" alt="" width="16" height="16" />
          <template v-else-if="badge(member).kind === 'again'">↺</template>
          <template v-else-if="badge(member).kind === 'next'">→</template>
          <template v-else-if="badge(member).kind === 'away'">z</template>
          <template v-else>…</template>
        </span>
      </span>
      <span class="squad-seat__name" aria-hidden="true">{{ member.id === state.me?.memberId ? 'You' : member.name }}</span>
      <span v-if="member.isHost" class="squad-seat__host" aria-hidden="true">Host</span>
    </li>
  </ul>
  <p v-if="watchers.length" class="squad-watchers">
    Watching: {{ watchers.map((member) => (member.id === state.me?.memberId ? 'you' : member.name)).join(', ') }}
  </p>
</template>
