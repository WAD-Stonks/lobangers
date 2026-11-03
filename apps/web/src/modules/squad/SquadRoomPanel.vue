<script setup lang="ts">
import { authClient } from '@web/lib/auth-client'
import SquadEnded from '@web/modules/squad/SquadEnded.vue'
import SquadLive from '@web/modules/squad/SquadLive.vue'
import SquadLobby from '@web/modules/squad/SquadLobby.vue'
import SquadMiniBar from '@web/modules/squad/SquadMiniBar.vue'
import SquadStirring from '@web/modules/squad/SquadStirring.vue'
import { SHEET_CONTROL_KEY } from '@web/modules/squad/sheet-control'
import { useSquadRoom } from '@web/modules/squad/use-squad-room'
import { computed, inject, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import '@web/modules/squad/squad.css'

// A Makan Squad room in the panel: the lobby before it starts, the live vote, or how it ended.
// On a phone the sheet can be tucked down to a live bar so the map shows; tapping the bar or
// the room's pin brings it back.
const route = useRoute()
const room = useSquadRoom()
const sheet = inject(SHEET_CONTROL_KEY, null)
const session = authClient.useSession()

const code = computed(() => String(route.params.code ?? '').toUpperCase())
const state = computed(() => room?.state.value ?? null)
const minimised = computed(() => sheet?.minimised.value ?? false)
const signedIn = computed(() => !!session.value.data)
const ended = computed(
  () => !!state.value && (state.value.status === 'CLOSED' || !!state.value.me?.kicked),
)
const loginTo = computed(() => ({ name: 'login', query: { redirect: route.fullPath } }))
const joinTo = computed(() => ({ name: 'squad-join', query: { code: code.value } }))

watch(
  [code, signedIn],
  ([next, isSignedIn]) => {
    if (room && isSignedIn && /^[A-Z]{4}$/.test(next)) room.open(next)
  },
  { immediate: true },
)

// The moment a lobby goes live, the sheet opens to full screen (even if it was dragged down or
// minimised in the lobby) and a short 3-2-1 plays over the room (skipped for reduced motion).
const stirring = ref(false)
const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
watch(
  () => state.value?.status,
  (next, previous) => {
    if (previous !== 'LOBBY' || next !== 'LIVE') return
    sheet?.expand()
    if (!reducedMotion()) stirring.value = true
  },
)
const hostName = computed(() => state.value?.members.find((member) => member.isHost)?.name ?? null)
</script>

<template>
  <section class="squad-room" :class="{ 'squad-room--mini': minimised }" aria-labelledby="squad-room-title">
    <h1 id="squad-room-title" class="visually-hidden" tabindex="-1" data-panel-heading>Room <span translate="no">{{ code }}</span></h1>

    <SquadMiniBar v-if="minimised && room && state" :room="room" :state="state" @open="sheet?.expand()" />

    <div v-else class="squad-room__body">
      <div v-if="!signedIn" class="squad-room__notice">
        <h2 class="squad-room__title">Log in to join Room {{ code }}</h2>
        <p>Squad rooms are for signed-in lobangers, so everyone knows who's voting.</p>
        <RouterLink class="lb-btn lb-btn--primary" :to="loginTo">Log in</RouterLink>
      </div>
      <div v-else-if="room?.error.value && !state" class="squad-room__notice" role="alert">
        <h2 class="squad-room__title">Can't open Room {{ code }}</h2>
        <p>{{ room.error.value }}</p>
        <RouterLink class="lb-btn lb-btn--primary" :to="joinTo">Join with a code</RouterLink>
      </div>
      <p v-else-if="!state" class="squad-room__loading" role="status">Opening Room {{ code }}…</p>
      <template v-else-if="room">
        <p v-if="room.connection.value === 'lost'" class="squad-room__lost" role="alert">
          Connection lost. Trying again…
          <button type="button" class="squad-link" @click="room.retry()">Retry now</button>
        </p>
        <SquadEnded v-if="ended" :state="state" />
        <SquadLobby v-else-if="state.status === 'LOBBY'" :room="room" />
        <SquadLive v-else :room="room" :state="state" />
      </template>
    </div>
    <SquadStirring v-if="stirring && !minimised" :host-name="hostName" :is-host="!!state?.me?.isHost" @done="stirring = false" />
  </section>
</template>
