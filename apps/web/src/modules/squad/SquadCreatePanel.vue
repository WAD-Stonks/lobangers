<script setup lang="ts">
import { SQUAD_MAX_DEALS, SQUAD_MAX_SIZE, SQUAD_MIN_SIZE, type SquadAvatar } from '@broke-oclock/contracts/squad'
import { authClient } from '@web/lib/auth-client'
import { focusFirstInvalid } from '@web/lib/form-focus'
import { useUnsavedChanges } from '@web/lib/use-unsaved-changes'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { useShell } from '@web/modules/map-shell/shell-state'
import { randomAvatar } from '@web/modules/squad/avatar-art'
import SquadAvatarPicker from '@web/modules/squad/SquadAvatarPicker.vue'
import SquadDealPicker from '@web/modules/squad/SquadDealPicker.vue'
import SquadNameField from '@web/modules/squad/SquadNameField.vue'
import {
  clampCapacity,
  codeFromQuery,
  DEFAULT_CAPACITY,
  defaultSquadName,
  nearbyDealIds,
  nearestDeals,
  squadNameError,
} from '@web/modules/squad/squad-forms'
import { useSquadRoom } from '@web/modules/squad/use-squad-room'
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import '@web/modules/squad/squad.css'

// Start a Makan Squad room: pick deals, set the room size, choose a name and face, then open
// the lobby. With ?room=KOPI the host is topping up a room that ran out of deals, so only the
// deal picker shows. With ?deal=<id> that deal starts picked.
const DEAL_ID = /^[a-f0-9]{24}$/
const route = useRoute()
const router = useRouter()
const room = useSquadRoom()
const shell = useShell()
const session = authClient.useSession()

const addTo = computed(() => codeFromQuery(route.query.room))
const fromDeal = typeof route.query.deal === 'string' && DEAL_ID.test(route.query.deal) ? route.query.deal : null

const picked = ref<readonly string[]>(fromDeal ? [fromDeal] : [])
// "Surprise me": the room picks every deal near the host (up to the limit) when it opens.
const randomise = ref(false)
const capacity = ref(DEFAULT_CAPACITY)
const name = ref(defaultSquadName(session.value.data?.user.name))
const nameTouched = ref(false)
const avatar = ref<SquadAvatar>(randomAvatar())
const nameError = ref('')
const formError = ref('')
const form = ref<HTMLFormElement | null>(null)

// Picked deals or a typed name would be lost by leaving; once the room opens nothing is.
const initialPicked = [...picked.value]
const initialName = name.value
const opened = ref(false)
const isDirty = computed(
  () =>
    !opened.value &&
    (picked.value.length !== initialPicked.length ||
      picked.value.some((id, index) => id !== initialPicked[index]) ||
      (nameTouched.value && name.value !== initialName)),
)
useUnsavedChanges(isDirty)

// The session may arrive after the panel opens; fill the name once, unless they typed already.
watch(
  () => session.value.data?.user.name,
  (full) => {
    if (!nameTouched.value && !name.value) name.value = defaultSquadName(full)
  },
)
const onName = (next: string) => {
  nameTouched.value = true
  name.value = next
  if (nameError.value) nameError.value = squadNameError(next)
}

// In add mode the room's own deals are already in; follow the room if it is not open yet.
watch(
  addTo,
  (code) => {
    if (code && room && room.code.value !== code) room.open(code)
  },
  { immediate: true },
)
const roomDeals = computed(() =>
  addTo.value && room?.state.value?.code === addTo.value ? room.state.value.deals.map((deal) => deal.id) : [],
)
const maxPick = computed(() => (addTo.value ? Math.max(1, SQUAD_MAX_DEALS - roomDeals.value.length) : SQUAD_MAX_DEALS))

const busy = computed(() => room?.busy.value ?? false)
const randomIds = () => nearbyDealIds(nearestDeals(shell.deals.value, shell.position.value))
const canSubmit = computed(() => (randomise.value && !addTo.value ? randomIds().length > 0 : picked.value.length > 0))
const submitLabel = computed(() => {
  if (randomise.value && !addTo.value) {
    if (!canSubmit.value) return 'No deals nearby to pick from'
    return busy.value ? 'Opening the lobby…' : `Open the lobby with ${randomIds().length} random deals`
  }
  if (picked.value.length === 0) return 'Pick at least 1 deal'
  if (addTo.value) return `Add ${picked.value.length} ${picked.value.length === 1 ? 'deal' : 'deals'} to Room ${addTo.value}`
  return busy.value ? 'Opening the lobby…' : 'Open the lobby'
})
const backTo = computed(() => {
  if (addTo.value) return { name: 'squad-room', params: { code: addTo.value } }
  if (fromDeal) return { name: 'deal', params: { dealId: fromDeal } }
  return { name: 'browse' }
})
const backLabel = computed(() => {
  if (addTo.value) return `Back to Room ${addTo.value}`
  return fromDeal ? 'Back to the deal' : 'Back to the map'
})

const setCapacity = (next: number) => {
  capacity.value = clampCapacity(next)
}

const submit = async () => {
  if (!room || busy.value || !canSubmit.value) return
  formError.value = ''
  const code = addTo.value
  if (code) {
    const updated = await room.addDeals([...picked.value])
    if (updated) {
      opened.value = true
      await router.push({ name: 'squad-room', params: { code } })
    } else formError.value = room.error.value || 'Could not add those deals. Try again.'
    return
  }
  nameError.value = squadNameError(name.value)
  if (nameError.value) {
    await nextTick()
    focusFirstInvalid(form.value)
    return
  }
  const created = await room.create({
    dealIds: randomise.value ? [...randomIds()] : [...picked.value],
    capacity: capacity.value,
    displayName: name.value.trim(),
    avatar: avatar.value,
  })
  if (created) {
    opened.value = true
    await router.push({ name: 'squad-room', params: { code: created.code } })
  } else formError.value = room.error.value || 'Could not open a room. Try again.'
}
</script>

<template>
  <section class="squad-room" aria-labelledby="squad-create-title">
    <form ref="form" class="squad-form" novalidate @submit.prevent="submit">
      <div class="squad-room__body squad-room__body--with-foot">
        <RouterLink class="squad-back" :to="backTo"><ShellIcon name="back" :size="16" />{{ backLabel }}</RouterLink>
        <header class="squad-intro">
          <h1 id="squad-create-title" class="squad-room__title" tabindex="-1" data-panel-heading>
            {{ addTo ? `Add deals to Room ${addTo}` : 'Start a Squad room' }}
          </h1>
          <p v-if="addTo">You've voted through every deal. Pick a few more and the room carries on.</p>
          <template v-else>
            <p>Pick a few deals, invite your friends, then vote yay or nah together.</p>
            <p class="squad-intro__aside">
              Got a code from a friend?
              <RouterLink class="squad-intro__link" :to="{ name: 'squad-join' }" data-testid="squad-create-join">Join a room</RouterLink>
            </p>
          </template>
        </header>

        <label v-if="!addTo" class="squad-random">
          <input v-model="randomise" type="checkbox" data-testid="squad-randomise" />
          <span class="squad-random__text">
            <strong>Randomise any near me</strong>
            <span>We pick every deal nearby, up to {{ SQUAD_MAX_DEALS }}.</span>
          </span>
        </label>
        <SquadDealPicker v-model="picked" :exclude="roomDeals" :max="maxPick" :disabled="randomise && !addTo" />

        <template v-if="!addTo">
          <fieldset class="squad-stepper-row">
            <legend class="squad-field__label">Room size</legend>
            <div class="squad-stepper">
              <button type="button" class="squad-stepper__btn" aria-label="Fewer people" :disabled="capacity <= SQUAD_MIN_SIZE" @click="setCapacity(capacity - 1)">−</button>
              <output class="squad-stepper__value" data-testid="squad-capacity" aria-live="polite">{{ capacity }}<span class="visually-hidden"> people</span></output>
              <button type="button" class="squad-stepper__btn" aria-label="More people" :disabled="capacity >= SQUAD_MAX_SIZE" @click="setCapacity(capacity + 1)">+</button>
            </div>
          </fieldset>
          <SquadNameField :model-value="name" :avatar="avatar" :error="nameError" @update:model-value="onName" />
          <SquadAvatarPicker v-model="avatar" />
        </template>
      </div>

      <div class="squad-foot">
        <p v-if="formError" class="squad-error" role="alert">{{ formError }}</p>
        <button
          type="submit"
          class="lb-btn lb-btn--primary lb-btn--block squad-btn-big"
          data-testid="squad-open"
          :disabled="busy || !canSubmit"
          :aria-busy="busy"
        >
          {{ submitLabel }}
        </button>
      </div>
    </form>
  </section>
</template>
