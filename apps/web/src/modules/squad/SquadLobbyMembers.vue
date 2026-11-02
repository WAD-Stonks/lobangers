<script setup lang="ts">
import type { SquadMember, SquadState } from '@broke-oclock/contracts/squad'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { avatarUrl } from '@web/modules/squad/avatar-art'
import { computed } from 'vue'

// Who's in the lobby, in the order they joined, then a dashed slot for each seat still free.
// The host gets a remove button on everyone else's row.
const props = defineProps<{ state: SquadState }>()
const emit = defineEmits<{ remove: [member: SquadMember] }>()

const MAX_SLOTS_SHOWN = 3
const players = computed(() => props.state.members.filter((member) => !member.spectator))
const freeSlots = computed(() =>
  Math.min(MAX_SLOTS_SHOWN, Math.max(0, props.state.capacity - players.value.length)),
)
const isMe = (member: SquadMember) => member.id === props.state.me?.memberId
const canRemove = (member: SquadMember) => !!props.state.me?.isHost && !isMe(member)
</script>

<template>
  <ul class="squad-lobby-list" aria-label="People in the lobby" data-testid="squad-lobby-members">
    <li v-for="member in players" :key="member.id" class="squad-mrow" :class="{ 'is-me': isMe(member), 'is-away': member.away }">
      <img :src="avatarUrl(member.avatar)" alt="" width="36" height="36" />
      <span class="squad-mrow__name">{{ member.name }}</span>
      <span v-if="member.isHost" class="squad-tag squad-tag--host">Host</span>
      <span v-if="isMe(member)" class="squad-tag">You</span>
      <span v-if="member.away" class="squad-tag">Away</span>
      <button
        v-if="canRemove(member)"
        type="button"
        class="squad-mrow__remove"
        :aria-label="`Remove ${member.name}`"
        @click="emit('remove', member)"
      >
        <ShellIcon name="close" :size="14" :stroke-width="2.6" />
      </button>
    </li>
    <li v-for="slot in freeSlots" :key="`slot-${slot}`" class="squad-slot">
      <i aria-hidden="true" />
      <span>Waiting for someone…</span>
    </li>
  </ul>
</template>
