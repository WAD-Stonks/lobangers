<script setup lang="ts">
import type { SquadAvatar, SquadPeek } from '@broke-oclock/contracts/squad'
import { api } from '@web/lib/api-client'
import { authClient } from '@web/lib/auth-client'
import ShellIcon from '@web/modules/map-shell/ShellIcon.vue'
import { randomAvatar } from '@web/modules/squad/avatar-art'
import SquadAvatarPicker from '@web/modules/squad/SquadAvatarPicker.vue'
import SquadJoinNotice from '@web/modules/squad/SquadJoinNotice.vue'
import SquadNameField from '@web/modules/squad/SquadNameField.vue'
import {
  codeFromQuery,
  defaultSquadName,
  isCompleteCode,
  joinProblemFor,
  normaliseCode,
  squadNameError,
} from '@web/modules/squad/squad-forms'
import { messageFor, useSquadRoom } from '@web/modules/squad/use-squad-room'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import '@web/modules/squad/squad.css'

// Join a friend's room with its four-letter code. A peek first says whether the room is open,
// closed or already voting (then the visitor watches until the next deal); the join itself
// says if the name is taken or the room is full.
const route = useRoute()
const router = useRouter()
const room = useSquadRoom()
const session = authClient.useSession()

const code = ref(codeFromQuery(route.query.code) ?? '')
const name = ref(defaultSquadName(session.value.data?.user.name))
const nameTouched = ref(false)
const avatar = ref<SquadAvatar>(randomAvatar())
const codeError = ref('')
const nameError = ref('')
const pending = ref(false)
const shake = ref(0)
// A room already voting: the visitor confirms they will watch first.
const live = ref<SquadPeek | null>(null)
const full = ref<{ code: string; message: string; hostName: string | null } | null>(null)

const signedIn = computed(() => !!session.value.data)
const loginQuery = computed(() => ({ redirect: route.fullPath }))
const joinLabel = computed(() => {
  if (pending.value) return 'Joining…'
  const trimmed = name.value.trim()
  return trimmed ? `Join as ${trimmed}` : 'Join room'
})

watch(
  () => session.value.data?.user.name,
  (full) => {
    if (!nameTouched.value && !name.value) name.value = defaultSquadName(full)
  },
)

const onCode = (event: Event) => {
  code.value = normaliseCode((event.target as HTMLInputElement).value)
  codeError.value = ''
  live.value = null
}
const onName = (next: string) => {
  nameTouched.value = true
  name.value = next
  nameError.value = ''
}
const failCode = (message: string) => {
  codeError.value = message
  shake.value += 1
}

const join = async (target: string) => {
  if (!room) return
  const joined = await room.join(target, { displayName: name.value.trim(), avatar: avatar.value })
  if (joined) {
    await router.push({ name: 'squad-room', params: { code: target } })
    return
  }
  const message = room.error.value || 'Could not join that room.'
  const problem = joinProblemFor(message)
  live.value = null
  if (problem === 'name') nameError.value = message
  else if (problem === 'full') full.value = { code: target, message, hostName: null }
  else failCode(message)
}

const submit = async () => {
  if (pending.value) return
  const target = code.value
  if (!isCompleteCode(target)) return failCode('Codes are four letters, like KOPI.')
  nameError.value = squadNameError(name.value)
  if (nameError.value) return
  // Already in that room (an invite link opened twice): go straight back to it.
  const current = room?.state.value
  if (current?.code === target && current.status !== 'CLOSED' && current.me && !current.me.left && !current.me.kicked) {
    await router.push({ name: 'squad-room', params: { code: target } })
    return
  }
  pending.value = true
  try {
    if (live.value?.code === target) return await join(target)
    const peek = await api.squad.peek(target)
    if (peek.status === 'CLOSED') return failCode(`Room ${target} has closed. Ask your host for a new code.`)
    if (peek.status === 'LOBBY' && peek.members >= peek.capacity) {
      full.value = { code: target, message: `${target} is full · ${peek.members} of ${peek.capacity}`, hostName: peek.hostName }
      return
    }
    if (peek.status === 'LIVE') {
      live.value = peek
      return
    }
    await join(target)
  } catch (error) {
    failCode(messageFor(error, 'Could not reach that room. Check your connection and try again.'))
  } finally {
    pending.value = false
  }
}

const tryAnother = () => {
  full.value = null
  live.value = null
  code.value = ''
}
</script>

<template>
  <section class="squad-room" aria-labelledby="squad-join-title">
    <div class="squad-room__body">
      <RouterLink class="squad-back" :to="{ name: 'browse' }"><ShellIcon name="back" :size="16" />Back to the map</RouterLink>
      <h1 id="squad-join-title" class="squad-room__title" tabindex="-1" data-panel-heading>Join a Squad room</h1>

      <SquadJoinNotice
        v-if="!signedIn"
        title="Log in to join"
        body="Squad rooms need an account so your squad knows who's voting. You'll come straight back here."
      >
        <RouterLink class="lb-btn lb-btn--primary" data-testid="squad-login" :to="{ name: 'login', query: loginQuery }">Log in</RouterLink>
        <RouterLink class="lb-btn squad-btn-dark" :to="{ name: 'register', query: loginQuery }">Sign up</RouterLink>
      </SquadJoinNotice>

      <SquadJoinNotice
        v-else-if="full"
        :title="full.message"
        :body="`Ask ${full.hostName ?? 'the host'} to make space, or start your own room with the same deals.`"
        data-testid="squad-full"
      >
        <RouterLink class="lb-btn lb-btn--primary" :to="{ name: 'squad-new' }">Start my own room</RouterLink>
        <button type="button" class="lb-btn squad-btn-dark" @click="tryAnother">Try another code</button>
      </SquadJoinNotice>

      <form v-else class="squad-form squad-form--stack" novalidate @submit.prevent="submit">
        <p>Type the 4-letter code from your host, or tap their invite link.</p>
        <div class="squad-field">
          <label class="squad-field__label" for="squad-code">Room code</label>
          <input
            id="squad-code"
            name="code"
            :key="shake"
            class="squad-code-input"
            :class="{ 'is-bad': codeError }"
            type="text"
            :value="code"
            inputmode="text"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            enterkeyhint="go"
            placeholder="KOPI"
            data-testid="squad-code"
            :aria-invalid="codeError ? 'true' : 'false'"
            :aria-describedby="codeError ? 'squad-code-error' : undefined"
            @input="onCode"
          />
          <p v-if="codeError" id="squad-code-error" class="squad-error" role="alert">{{ codeError }}</p>
        </div>

        <SquadNameField :model-value="name" :avatar="avatar" :error="nameError" label="Join as" @update:model-value="onName" />
        <SquadAvatarPicker v-model="avatar" />

        <div v-if="live" class="squad-banner squad-banner--watch squad-join-live" role="status" data-testid="squad-watch-note">
          <strong>Room {{ live.code }} has started.</strong>
          <span>You'll watch: they're already stirring the pot. You can vote from the next deal.</span>
        </div>

        <button type="submit" class="lb-btn lb-btn--primary lb-btn--block squad-btn-big" data-testid="squad-join" :disabled="pending" :aria-busy="pending">
          {{ live && !pending ? `Watch Room ${live.code}` : joinLabel }}
        </button>
      </form>
    </div>
  </section>
</template>
