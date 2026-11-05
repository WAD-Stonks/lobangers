<script setup lang="ts">
import type { SquadState } from '@broke-oclock/contracts/squad'
import { avatarUrl } from '@web/modules/squad/avatar-art'
import { useSquadRoom } from '@web/modules/squad/use-squad-room'
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

const props = defineProps<{ state: SquadState }>()
const room = useSquadRoom()

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

const NEW_ROOM: RouteLocationRaw = { name: 'squad-new' }
const MAP: RouteLocationRaw = { name: 'browse' }

const go = async (event: MouseEvent, navigate: (event?: MouseEvent) => Promise<unknown>) => {
  await navigate(event)
  if (!event.defaultPrevented) return
  room?.forget()
}
</script>

<template>
  <div class="squad-ended" role="status" data-testid="squad-ended">
    <img class="squad-ended__face" :src="avatarUrl(face, 'poked')" alt="" width="96" height="96" />
    <h2 class="squad-room__title">{{ copy.title }}</h2>
    <p>{{ copy.body }}</p>
    <div class="squad-sheet__actions">
      <RouterLink v-slot="{ href, navigate }" :to="NEW_ROOM" custom>
        <a :href="href" class="lb-btn lb-btn--primary" @click="go($event, navigate)">Start a new room</a>
      </RouterLink>
      <RouterLink v-slot="{ href, navigate }" :to="MAP" custom>
        <a :href="href" class="lb-btn squad-btn-dark" @click="go($event, navigate)">Back to the map</a>
      </RouterLink>
    </div>
  </div>
</template>
