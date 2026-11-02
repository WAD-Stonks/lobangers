<script setup lang="ts">
import type { SquadAvatar, SquadEvent, SquadState } from '@broke-oclock/contracts/squad'
import { dealLocation } from '@web/modules/map-shell/shell-routes'
import { useToast } from '@web/modules/map-shell/use-toast'
import SquadConfirm from '@web/modules/squad/SquadConfirm.vue'
import SquadDealCard from '@web/modules/squad/SquadDealCard.vue'
import SquadDock from '@web/modules/squad/SquadDock.vue'
import SquadEffectsLayer from '@web/modules/squad/SquadEffectsLayer.vue'
import SquadLeave from '@web/modules/squad/SquadLeave.vue'
import SquadMembers from '@web/modules/squad/SquadMembers.vue'
import { shareRoom } from '@web/modules/squad/share-room'
import { SHEET_CONTROL_KEY } from '@web/modules/squad/sheet-control'
import { useSquadEffects } from '@web/modules/squad/use-squad-effects'
import type { SquadRoom } from '@web/modules/squad/use-squad-room'
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import { type RouteLocationRaw, useRoute, useRouter } from 'vue-router'

// The live room: who's here and how they voted, the deal on the table, and Yay or Nah. Every
// tap anyone makes plays as an effect for everyone.
const props = defineProps<{ room: SquadRoom; state: SquadState }>()

const route = useRoute()
const router = useRouter()
const toast = useToast()
const sheet = inject(SHEET_CONTROL_KEY, null)
const effects = useSquadEffects()

const root = ref<HTMLElement | null>(null)
const card = ref<InstanceType<typeof SquadDealCard> | null>(null)
const leaving = ref(false)
// Closing ends the room for everyone, so the host confirms it first.
const closing = ref(false)
// The button that opened the Leave or Close sheet, so focus returns there when it closes.
const sheetTrigger = ref<HTMLElement | null>(null)
const openSheet = (sheet: 'leave' | 'close', event?: Event) => {
  const trigger = event?.currentTarget ?? document.activeElement
  sheetTrigger.value = trigger instanceof HTMLElement ? trigger : null
  if (sheet === 'leave') leaving.value = true
  else closing.value = true
}
// Kept so "Rejoin" works after the seat is gone from the member list.
const lastSelf = ref<{ name: string; avatar: SquadAvatar } | null>(null)

const me = computed(() => props.state.members.find((member) => member.id === props.state.me?.memberId) ?? null)
watch(me, (member) => {
  if (member) lastSelf.value = { name: member.name, avatar: member.avatar }
}, { immediate: true })

const deal = computed(() => props.room.currentDeal.value)
const left = computed(() => !!props.state.me?.left)
const position = computed(() => {
  const round = props.state.round > 0 ? ` · Round ${props.state.round + 1}` : ''
  return `Deal ${Math.min(props.state.dealIndex + 1, props.state.deals.length)} of ${props.state.deals.length}${round}`
})
const otherVoters = computed(() =>
  props.state.members.filter((member) => !member.spectator && member.id !== props.state.me?.memberId),
)
const justYou = computed(
  () =>
    !left.value &&
    !props.state.me?.spectator &&
    otherVoters.value.filter((member) => !member.away).length === 0 &&
    (props.state.phase === 'VOTING' || props.state.phase === 'DECIDING'),
)
const stillVoting = computed(() => props.state.members.filter((member) => !member.spectator).length)

// Effect geometry, relative to the room so stickers stay put while the panel scrolls.
const boxOf = (element: Element | null | undefined) => {
  const base = root.value?.getBoundingClientRect()
  const rect = element?.getBoundingClientRect()
  if (!base || !rect) return null
  return { left: rect.left - base.left, top: rect.top - base.top, width: rect.width, height: rect.height }
}
const seatOf = (memberId: string | null) => {
  const seat = boxOf(root.value?.querySelector(`[data-member-id="${memberId}"]`))
  return seat ? { x: seat.left + seat.width / 2, y: seat.top + seat.height / 2 } : { x: 40, y: 120 }
}
const avatarOf = (memberId: string | null): SquadAvatar =>
  props.state.members.find((member) => member.id === memberId)?.avatar ?? 'kopi'
const nameOf = (memberId: string | null) =>
  memberId === props.state.me?.memberId
    ? 'You'
    : (props.state.members.find((member) => member.id === memberId)?.name ?? 'Someone')

const playYay = (memberId: string | null) => {
  const photo = boxOf(card.value?.photo)
  if (photo) effects.yay(avatarOf(memberId), photo, seatOf(memberId))
}
const playNah = () => effects.nah(root.value?.clientWidth ?? 360)

const stopListening = props.room.onEffect((event: SquadEvent) => {
  if (event.kind === 'YAY') playYay(event.memberId)
  else if (event.kind === 'NAH') playNah()
  else if (event.kind === 'AGAIN') effects.whoosh('again', nameOf(event.memberId))
  else if (event.kind === 'NEXT') effects.whoosh('next', nameOf(event.memberId))
})
onBeforeUnmount(stopListening)
watch(() => `${props.state.dealIndex}:${props.state.round}`, effects.clearStickers)

const tap = (stance: 'YAY' | 'NAH') => {
  props.room.tap(stance)
  if (stance === 'YAY') playYay(props.state.me?.memberId ?? null)
  else playNah()
}

const choose = (choice: 'AGAIN' | 'NEXT') => {
  void props.room.choose(choice)
  effects.whoosh(choice === 'AGAIN' ? 'again' : 'next', 'You')
}

// The deal page link, tagged so its Back button returns to this room.
const dealLink = (dealId: string): RouteLocationRaw => {
  const target = props.state.deals.find((item) => item.id === dealId)
  const location = dealLocation(route.query, dealId, target?.venueId ?? undefined)
  return typeof location === 'object' && 'query' in location
    ? { ...location, query: { ...location.query, from: 'squad', room: props.state.code } }
    : location
}

const share = async () => {
  const result = await shareRoom(props.state.code)
  if (result === 'copied') toast.show(`Code ${props.state.code} copied. Send it to your friends.`)
  else if (result === 'failed') toast.show(`Tell your friends the code: ${props.state.code}`)
}

const leave = async () => {
  await props.room.leave()
  leaving.value = false
}

const closeRoom = async () => {
  await props.room.close()
  closing.value = false
}

const rejoin = () => {
  if (!lastSelf.value) return
  void props.room.join(props.state.code, { displayName: lastSelf.value.name, avatar: lastSelf.value.avatar })
}

const BROWSE: RouteLocationRaw = { name: 'browse' }

// A real link to the map; the room is forgotten only for an in-app navigation.
const browse = (event: MouseEvent, navigate: (event?: MouseEvent) => Promise<unknown>) => {
  const pending = navigate(event)
  if (event.defaultPrevented) props.room.forget()
  return pending
}
</script>

<template>
  <div ref="root" class="squad-live" data-testid="squad-live">
    <template v-if="left">
      <div class="squad-left" role="status">
        <h2 class="squad-room__title">You left Room {{ state.code }}</h2>
        <p>{{ stillVoting }} still voting. Code {{ state.code }} works while the room is open.</p>
        <div class="squad-sheet__actions">
          <button type="button" class="lb-btn lb-btn--primary" data-testid="squad-rejoin" :disabled="room.busy.value" @click="rejoin">Rejoin Room {{ state.code }}</button>
          <RouterLink v-slot="{ href, navigate }" :to="BROWSE" custom>
            <a :href="href" class="lb-btn squad-btn-dark" @click="browse($event, navigate)">Browse deals</a>
          </RouterLink>
        </div>
      </div>
    </template>

    <template v-else>
      <header class="squad-live__bar">
        <button type="button" class="squad-link" data-testid="squad-leave" @click="openSheet('leave', $event)"><span aria-hidden="true">←</span> Leave room</button>
        <span class="squad-live__tools">
          <button type="button" class="lb-btn squad-btn-dark squad-btn-small" @click="share">Share code</button>
          <button
            v-if="sheet?.mode.value === 'sheet'"
            type="button"
            class="squad-icon-btn"
            data-testid="squad-minimise"
            aria-label="Minimise the room to see the map"
            @click="sheet.minimise()"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </button>
        </span>
      </header>

      <div class="squad-live__title">
        <h2 class="squad-room__title">Room {{ state.code }} <span class="squad-live-dot" aria-hidden="true" /></h2>
        <span class="squad-live__position">{{ position }}</span>
      </div>

      <SquadMembers :state="state" />

      <p v-if="state.me?.spectator" class="squad-banner squad-banner--watch">
        You're watching. Everything happens live, but only people who joined before the start can vote.
      </p>

      <div v-if="justYou" class="squad-alone">
        <h2 class="squad-room__title">Just you left in {{ state.code }}</h2>
        <p>Everyone else left or went quiet. Invite more people, or close the room. Your saved deals stay saved.</p>
        <div class="squad-sheet__actions">
          <button type="button" class="lb-btn lb-btn--primary" @click="share">Share the code</button>
          <button v-if="state.me?.isHost" type="button" class="lb-btn squad-btn-dark" @click="openSheet('close', $event)">Close the room</button>
          <button v-else type="button" class="lb-btn squad-btn-dark" @click="openSheet('leave', $event)">Leave the room</button>
        </div>
      </div>

      <div class="squad-live__stage">
        <SquadDealCard v-if="deal" ref="card" :deal="deal" :position="position" :to="dealLink(deal.id)" />
        <div v-if="state.phase === 'MATCHED' && deal" class="squad-match" role="status" data-testid="squad-match">
          <strong>It's a match!</strong>
          <span>{{ state.tally.yesPeople }} of {{ state.tally.voters }} said yay to {{ deal.title }}</span>
        </div>
      </div>

      <SquadDock
        :state="state"
        :deal="deal"
        :busy="room.busy.value"
        @tap="tap"
        :deal-link="dealLink"
        @choose="choose"
        @add-deals="router.push({ name: 'squad-new', query: { room: state.code } })"
        @close="openSheet('close')"
      />
      <p v-if="room.error.value" class="squad-error" role="alert">{{ room.error.value }}</p>
    </template>

    <SquadEffectsLayer :effects="effects" />
    <SquadLeave
      v-if="leaving"
      :code="state.code"
      :others="otherVoters.map((member) => member.name)"
      :is-host="!!state.me?.isHost"
      :busy="room.busy.value"
      :return-focus="sheetTrigger"
      @leave="leave"
      @stay="leaving = false"
    />
    <SquadConfirm
      v-if="closing"
      :title="`Close Room ${state.code}?`"
      :body="`Everyone goes back to the map and code ${state.code} stops working.`"
      confirm-label="Close the room"
      cancel-label="Keep the room open"
      :busy="room.busy.value"
      :return-focus="sheetTrigger"
      @confirm="closeRoom"
      @cancel="closing = false"
    />
  </div>
</template>
