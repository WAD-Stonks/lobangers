<script setup lang="ts">
import type { SquadMember } from '@broke-oclock/contracts/squad'
import { useToast } from '@web/modules/map-shell/use-toast'
import SquadCodeTiles from '@web/modules/squad/SquadCodeTiles.vue'
import SquadConfirm from '@web/modules/squad/SquadConfirm.vue'
import SquadLeave from '@web/modules/squad/SquadLeave.vue'
import SquadLobbyMembers from '@web/modules/squad/SquadLobbyMembers.vue'
import { shareRoom } from '@web/modules/squad/share-room'
import { formatCountdown } from '@web/modules/squad/squad-forms'
import type { SquadRoom } from '@web/modules/squad/use-squad-room'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps<{ room: SquadRoom }>()
const router = useRouter()
const toast = useToast()

const TICK_MS = 1000
const ALONE_HINT_AFTER_MS = 5 * 60_000

const state = computed(() => props.room.state.value)
const isHost = computed(() => !!state.value?.me?.isHost)
const players = computed(() => state.value?.members.filter((member) => !member.spectator) ?? [])
const host = computed(() => state.value?.members.find((member) => member.isHost) ?? null)
const canStart = computed(() => players.value.length >= 2)
const busy = computed(() => props.room.busy.value)
const dealsText = computed(() => {
  const count = state.value?.deals.length ?? 0
  return `${count} ${count === 1 ? 'deal' : 'deals'} queued`
})

const now = ref(Date.now())
const timer = setInterval(() => {
  now.value = Date.now()
}, TICK_MS)
onBeforeUnmount(() => clearInterval(timer))
const skew = computed(() => (state.value ? new Date(state.value.serverTime).getTime() - Date.now() : 0))
const serverNow = computed(() => now.value + skew.value)
const closesIn = computed(() => {
  const expires = state.value?.expiresAt
  return expires ? formatCountdown(new Date(expires).getTime() - serverNow.value) : null
})
const alone = computed(
  () =>
    isHost.value &&
    players.value.length < 2 &&
    !!state.value &&
    serverNow.value - new Date(state.value.createdAt).getTime() > ALONE_HINT_AFTER_MS,
)

type Confirming = { kind: 'close' } | { kind: 'remove'; member: SquadMember } | null
const confirming = ref<Confirming>(null)
const leaving = ref(false)
const sheetTrigger = ref<HTMLElement | null>(null)
const others = computed(() =>
  players.value.filter((member) => member.id !== state.value?.me?.memberId).map((member) => member.name),
)

const triggerOf = (event?: Event): HTMLElement | null => {
  const target = event?.currentTarget ?? document.activeElement
  return target instanceof HTMLElement ? target : null
}
const ask = (next: Exclude<Confirming, null>, event?: Event) => {
  sheetTrigger.value = triggerOf(event)
  confirming.value = next
}
const askLeave = (event: Event) => {
  sheetTrigger.value = triggerOf(event)
  leaving.value = true
}

const start = async () => {
  if (!canStart.value || busy.value) return
  const started = await props.room.start()
  if (!started) toast.show(props.room.error.value || 'Could not start the room.', { tone: 'error' })
}

const confirm = async () => {
  const current = confirming.value
  if (!current || busy.value) return
  const done = current.kind === 'close' ? await props.room.close() : await props.room.remove(current.member.id)
  confirming.value = null
  if (!done) toast.show(props.room.error.value || 'That did not go through. Try again.', { tone: 'error' })
  else if (current.kind === 'remove') toast.show(`${current.member.name} was removed`)
}

const leave = async () => {
  if (busy.value) return
  const code = state.value?.code ?? ''
  const left = await props.room.leave()
  leaving.value = false
  if (!left) {
    toast.show(props.room.error.value || 'Could not leave the room.', { tone: 'error' })
    return
  }
  await router.push({ name: 'browse' })
  props.room.forget()
  toast.show(`You left Room ${code}`)
}

const shareAgain = async () => {
  if (!state.value) return
  const result = await shareRoom(state.value.code)
  if (result === 'copied') toast.show('Invite copied. Paste it to your friends.')
}
</script>

<template>
  <div v-if="state" class="squad-lobby" data-testid="squad-lobby">
    <template v-if="isHost">
      <div class="squad-lobby__head">
        <h2 class="squad-room__title">Lobby</h2>
        <span class="squad-tag squad-tag--host">You're the host</span>
      </div>
      <SquadCodeTiles :code="state.code" />
    </template>
    <div v-else class="squad-lobby__wait">
      <h2 class="squad-room__title">You're in!</h2>
      <p>
        Waiting for <strong>{{ host?.name ?? 'the host' }}</strong> to start stirring the pot
        <span class="squad-dots" aria-hidden="true"><i /><i /><i /></span>
      </p>
    </div>

    <div class="squad-lobby__count">
      <strong aria-live="polite" data-testid="squad-lobby-count">
        {{ isHost ? '' : `Room ${state.code} · ` }}{{ players.length }} of {{ state.capacity }} in the lobby
      </strong>
      <span>{{ dealsText }}</span>
    </div>

    <SquadLobbyMembers :state="state" @remove="(member) => ask({ kind: 'remove', member })" />

    <div v-if="alone" class="squad-room__notice" role="status">
      <h3 class="squad-room__title squad-room__title--small">Nobody's here yet</h3>
      <p>Share the code again? The lobby closes itself after 30 minutes so it doesn't sit open forever.</p>
      <button type="button" class="lb-btn squad-btn-dark" @click="shareAgain">Share the code again</button>
    </div>

    <template v-if="isHost">
      <div class="squad-lobby__actions">
        <button
          type="button"
          class="lb-btn lb-btn--primary lb-btn--block squad-btn-big"
          data-testid="squad-start"
          :disabled="!canStart || busy"
          @click="start"
        >
          {{ canStart ? 'Start stirring the pot!' : 'Waiting for at least 1 friend' }}
        </button>
        <p v-if="closesIn" class="squad-lobby__timer" role="timer">
          The lobby closes itself in {{ closesIn }} if nobody starts it.
        </p>
        <button type="button" class="lb-btn lb-btn--block squad-btn-quiet-danger" data-testid="squad-close" @click="ask({ kind: 'close' }, $event)">
          Close lobby
        </button>
      </div>
    </template>
    <button v-else type="button" class="lb-btn squad-btn-dark lb-btn--block" data-testid="squad-leave-lobby" :disabled="busy" @click="askLeave">
      Leave lobby
    </button>

    <SquadConfirm
      v-if="confirming?.kind === 'close'"
      title="Close the lobby?"
      :body="players.length > 1 ? `Everyone here goes back to the map and code ${state.code} stops working.` : `Code ${state.code} stops working. You can start a new room any time.`"
      confirm-label="Close lobby"
      cancel-label="Keep waiting"
      :busy="busy"
      :return-focus="sheetTrigger"
      @confirm="confirm"
      @cancel="confirming = null"
    />
    <SquadConfirm
      v-else-if="confirming?.kind === 'remove'"
      :title="`Remove ${confirming.member.name}?`"
      :body="`${confirming.member.name} leaves the lobby and can't rejoin Room ${state.code}.`"
      :confirm-label="`Remove ${confirming.member.name}`"
      cancel-label="Keep them"
      :busy="busy"
      :return-focus="sheetTrigger"
      @confirm="confirm"
      @cancel="confirming = null"
    />
    <SquadLeave
      v-if="leaving"
      :code="state.code"
      :others="others"
      :is-host="false"
      :busy="busy"
      :return-focus="sheetTrigger"
      stage="lobby"
      @leave="leave"
      @stay="leaving = false"
    />
  </div>
</template>
