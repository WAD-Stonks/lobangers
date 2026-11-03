<script setup lang="ts">
import type { SquadDeal, SquadState } from '@broke-oclock/contracts/squad'
import { THUMBS_DOWN_URL, THUMBS_UP_URL } from '@web/modules/squad/avatar-art'
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

// What the room does next, at the bottom where thumbs reach: Yay and Nah while voting (tap as
// often as you like), Vote again or Next deal once a vote falls short, the match (with a Keep
// looking vote in case the squad changes its mind), or the end of the list. People who joined
// late watch; the buttons tell them why they can't vote. `feed` is the latest thing someone did.
// `dealLink` builds the deal page link, so "Open the deal" is a real link.
const props = defineProps<{
  state: SquadState
  deal: SquadDeal | null
  busy: boolean
  dealLink: (dealId: string) => RouteLocationRaw
  feed?: string
}>()
const emit = defineEmits<{
  tap: [stance: 'YAY' | 'NAH']
  choose: [choice: 'AGAIN' | 'NEXT']
  addDeals: []
  close: []
}>()

const spectator = computed(() => !!props.state.me?.spectator)
const isHost = computed(() => !!props.state.me?.isHost)
const tally = computed(() => props.state.tally)
const myChoice = computed(
  () => props.state.members.find((member) => member.id === props.state.me?.memberId)?.choice ?? null,
)
const matched = computed(() => props.state.deals.find((deal) => deal.id === props.state.matchDealId) ?? null)
const top = computed(() => props.state.deals.find((deal) => deal.id === props.state.topDealId) ?? null)
const host = computed(() => props.state.members.find((member) => member.isHost)?.name ?? 'the host')
const directions = (deal: SquadDeal) =>
  deal.lat !== null && deal.lng !== null
    ? `https://www.google.com/maps/dir/?api=1&destination=${deal.lat},${deal.lng}`
    : null
// The bar tracks who has voted, so the squad can see who it's still waiting on.
const votedShare = computed(() => (tally.value.voters === 0 ? 0 : tally.value.voted / tally.value.voters))
</script>

<template>
  <div class="squad-dock" data-testid="squad-dock">
    <template v-if="state.phase === 'VOTING'">
      <div class="squad-tally" aria-live="polite">
        <span><strong>{{ tally.voted }} of {{ tally.voters }} voted</strong> · {{ tally.yesPeople }} yay</span>
        <span class="squad-tally__bar" aria-hidden="true"><i :style="{ transform: `scaleX(${votedShare})` }" /></span>
        <span class="squad-tally__rule">Match at over half yay</span>
        <span class="squad-tally__feed" aria-hidden="true">{{ feed }}</span>
      </div>
      <p v-if="spectator" class="squad-dock__note">You joined after the room started, so you're watching this one.</p>
      <div class="squad-dock__votes">
        <button type="button" class="squad-vote squad-vote--nah" data-testid="squad-nah" :disabled="spectator" @click="emit('tap', 'NAH')">
          <img :src="THUMBS_DOWN_URL" alt="" width="30" height="30" />Nah
        </button>
        <button type="button" class="squad-vote squad-vote--yay" data-testid="squad-yay" :disabled="spectator" @click="emit('tap', 'YAY')">
          <img :src="THUMBS_UP_URL" alt="" width="30" height="30" />Yay!
        </button>
      </div>
    </template>

    <template v-else-if="state.phase === 'DECIDING'">
      <p class="squad-dock__lead">Give it another go, or move on?</p>
      <p class="squad-dock__note">Vote again needs over half. Next deal needs 80%.</p>
      <div class="squad-dock__votes">
        <button
          type="button"
          class="squad-vote squad-vote--again"
          :class="{ 'is-chosen': myChoice === 'AGAIN' }"
          data-testid="squad-again"
          :disabled="spectator"
          :aria-pressed="myChoice === 'AGAIN'"
          @click="emit('choose', 'AGAIN')"
        >
          <span aria-hidden="true">↺</span> Vote again <span class="squad-vote__count">{{ tally.again }}</span>
        </button>
        <button
          type="button"
          class="squad-vote squad-vote--next"
          :class="{ 'is-chosen': myChoice === 'NEXT' }"
          data-testid="squad-next"
          :disabled="spectator"
          :aria-pressed="myChoice === 'NEXT'"
          @click="emit('choose', 'NEXT')"
        >
          Next deal <span aria-hidden="true">→</span> <span class="squad-vote__count">{{ tally.next }}</span>
        </button>
      </div>
    </template>

    <template v-else-if="state.phase === 'MATCHED' && matched">
      <p class="squad-dock__note">Changed your mind? Keep looking needs 80%.</p>
      <div class="squad-dock__match">
        <button
          type="button"
          class="squad-vote squad-vote--next"
          :class="{ 'is-chosen': myChoice === 'NEXT' }"
          data-testid="squad-keep-looking"
          :disabled="spectator || busy"
          :aria-pressed="myChoice === 'NEXT'"
          @click="emit('choose', 'NEXT')"
        >
          Keep looking <span class="squad-vote__count">{{ tally.next }}/{{ tally.voters }}</span>
        </button>
        <a v-if="directions(matched)" class="lb-btn lb-btn--primary squad-dock__go" :href="directions(matched) ?? undefined" target="_blank" rel="noopener noreferrer">Get directions</a>
        <RouterLink v-else class="lb-btn lb-btn--primary squad-dock__go" :to="dealLink(matched.id)">Open the deal</RouterLink>
      </div>
    </template>

    <template v-else-if="state.phase === 'OUT_OF_DEALS'">
      <p class="squad-dock__lead">That's all {{ state.deals.length }} {{ state.deals.length === 1 ? 'deal' : 'deals' }}! No match this time.</p>
      <div class="squad-dock__actions">
        <RouterLink v-if="top" class="lb-btn lb-btn--primary" :to="dealLink(top.id)">Go with the top pick: {{ top.title }}</RouterLink>
        <template v-if="isHost">
          <button type="button" class="lb-btn squad-btn-dark" :disabled="busy" @click="emit('addDeals')">Add more deals</button>
          <button type="button" class="squad-link squad-link--danger" :disabled="busy" @click="emit('close')">Close the room</button>
        </template>
        <p v-else class="squad-dock__note">Waiting for {{ host }} to add more deals or close the room.</p>
      </div>
    </template>
  </div>
</template>
