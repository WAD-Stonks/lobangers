<script setup lang="ts">
import type { SquadState } from '@broke-oclock/contracts/squad'
import { avatarUrl } from '@web/modules/squad/avatar-art'
import { useSquadRoom } from '@web/modules/squad/use-squad-room'
import { computed } from 'vue'
import { useRouter } from 'vue-router'

// How a room ended for this visitor: the host closed it, nobody joined in time, everyone
// left, or the host removed them. Either way the next step is a new room or the map.
const props = defineProps<{ state: SquadState }>()
const room = useSquadRoom()
const router = useRouter()

const hostName = computed(() => props.state.members.find((member) => member.isHost)?.name ?? 'The host')
const face = computed(
  () => props.state.members.find((member) => member.id === props.state.me?.memberId)?.avatar ?? 'kopi',
)
const wasHost = computed(() => !!props.state.me?.isHost)

const copy = computed(() => {
  const code = props.state.code
  if (props.state.me?.kicked)
    return {
      title: `You were removed from Room ${code}`,
      body: 'The host took you out of this room. You can start your own room any time.',
    }
  if (props.state.closeReason === 'EXPIRED')
    return {
      title: `Room ${code} closed`,
      body: 'Nobody joined in 30 minutes, so the lobby closed.',
    }
  if (props.state.closeReason === 'EMPTY')
    return {
      title: `Room ${code} closed`,
      body: 'Everyone left, so the room closed. Your saved deals stay saved.',
    }
  return wasHost.value
    ? { title: `You closed Room ${code}`, body: `Code ${code} no longer works. Start a new room whenever your squad is hungry.` }
    : { title: `${hostName.value} closed Room ${code}`, body: 'The room is over. Start your own, or go back to the map.' }
})

const go = async (to: { name: string }) => {
  await router.push(to)
  room?.forget()
}
</script>

<template>
  <div class="squad-ended" role="status" data-testid="squad-ended">
    <img class="squad-ended__face" :src="avatarUrl(face, 'poked')" alt="" width="96" height="96" />
    <h2 class="squad-room__title">{{ copy.title }}</h2>
    <p>{{ copy.body }}</p>
    <div class="squad-sheet__actions">
      <button type="button" class="lb-btn lb-btn--primary" @click="go({ name: 'squad-new' })">Start a new room</button>
      <button type="button" class="lb-btn squad-btn-dark" @click="go({ name: 'browse' })">Back to the map</button>
    </div>
  </div>
</template>
