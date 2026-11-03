<script setup lang="ts">
import type { AccountVenue, MyMerchantRequest } from '@broke-oclock/contracts/account'
import AppSelect from '@web/components/AppSelect.vue'
import { withLeading } from '@web/components/select-options'
import { api } from '@web/lib/api-client'
import { focusFirstInvalid } from '@web/lib/form-focus'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { computed, nextTick, onMounted, ref } from 'vue'

const search = ref('')
const venues = ref<AccountVenue[]>([])
const venueId = ref('')
const venueOptions = computed(() =>
  withLeading(
    { value: '', label: 'Choose a stall' },
    venues.value.map((venue) => ({ value: venue.id, label: `${venue.name} (${venue.merchantName})` })),
  ),
)
const message = ref('')
const myRequests = ref<MyMerchantRequest[]>([])
const requestsCursor = ref<string | null>(null)
const loadingMoreRequests = ref(false)
const refreshingRequests = ref(false)
const submitting = ref(false)
const successMessage = ref('')
const errorMessage = ref('')
const searching = ref(false)
const attempted = ref(false) // inline errors only appear after the first Send
const formEl = ref<HTMLFormElement | null>(null)

// Send stays enabled; a submit with a missing field shows the inline errors and focuses the first.
const venueError = computed(() =>
  attempted.value && venueId.value === '' ? 'Choose the stall you run.' : '',
)
const messageError = computed(() =>
  attempted.value && message.value.trim() === '' ? 'Tell us why you should have access.' : '',
)
const isValid = computed(() => venueId.value !== '' && message.value.trim() !== '')

// Every search gets a number. Only the newest search may change the page, so a slow older
// search finishing last can't replace newer results or clear the stall the user already chose.
let latestSearch = 0
const findVenues = async () => {
  const thisSearch = ++latestSearch
  searching.value = true
  try {
    const result = await api.account.venues({ search: search.value })
    if (thisSearch !== latestSearch) return
    venues.value = result
    venueId.value = '' // the old choice may not be in the new list
  } catch {
    if (thisSearch !== latestSearch) return
    errorMessage.value = 'Could not search stalls. Please try again.'
  } finally {
    if (thisSearch === latestSearch) searching.value = false
  }
}

// Each refresh of the first page starts a new "generation" of the list. A response that belongs
// to an older generation (for example a slow Load more that was started before a request was
// sent) is thrown away, so it can't append stale items or move the cursor.
let requestsGeneration = 0
const loadMyRequests = async () => {
  const generation = ++requestsGeneration
  refreshingRequests.value = true
  loadingMoreRequests.value = false // any Load more still running belongs to the old list
  try {
    const result = await api.account.merchantRequests()
    if (generation !== requestsGeneration) return
    myRequests.value = result.items
    requestsCursor.value = result.nextCursor
  } catch {
    if (generation !== requestsGeneration) return
    errorMessage.value = 'Could not load your earlier requests.'
  } finally {
    if (generation === requestsGeneration) refreshingRequests.value = false
  }
}

// Older requests: the API returns 20 at a time plus a cursor for the next page.
const loadMoreRequests = async () => {
  if (!requestsCursor.value || loadingMoreRequests.value || refreshingRequests.value) return
  const generation = requestsGeneration
  loadingMoreRequests.value = true
  try {
    const result = await api.account.merchantRequests({ cursor: requestsCursor.value })
    if (generation !== requestsGeneration) return
    myRequests.value = [...myRequests.value, ...result.items]
    requestsCursor.value = result.nextCursor
  } catch {
    if (generation !== requestsGeneration) return
    errorMessage.value = 'Could not load more requests. Please try again.'
  } finally {
    if (generation === requestsGeneration) loadingMoreRequests.value = false
  }
}

const sendRequest = async () => {
  if (submitting.value) return
  attempted.value = true
  if (!isValid.value) {
    await nextTick()
    focusFirstInvalid(formEl.value)
    return
  }
  submitting.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    await api.account.requestMerchantAccess({ venueId: venueId.value, message: message.value })
    successMessage.value = 'Request sent. An administrator will review it.'
    message.value = ''
    venueId.value = ''
    attempted.value = false
    await loadMyRequests() // refresh the list so the new request shows up
  } catch (error) {
    const code = errorCode(error)
    if (code === 'CONFLICT') {
      errorMessage.value = 'You already have a pending request or access for this stall.'
    } else if (code === 'PRECONDITION_FAILED') {
      errorMessage.value = 'This stall is unavailable, or your account cannot request access.'
    } else if (code === 'UNAUTHORIZED') {
      errorMessage.value = 'Please log in first.'
    } else {
      errorMessage.value = 'Could not send your request. Please try again.'
    }
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  findVenues()
  loadMyRequests()
})
</script>

<template>
  <section class="container py-4 merchant-access">
    <h1 class="h2 mb-3">Merchant access</h1>
    <p class="text-secondary">
      Run a stall? Request access to manage its deals. An administrator reviews every request.
    </p>

    <form ref="formEl" class="card card-body mb-4" novalidate @submit.prevent="sendRequest">
      <label for="venue-search" class="form-label">Find your stall</label>
      <div class="input-group mb-3">
        <!-- Enter here runs the search; it must not submit the access request. -->
        <input
          id="venue-search"
          v-model="search"
          name="venue-search"
          type="search"
          class="form-control"
          maxlength="100"
          autocomplete="off"
          placeholder="Stall or merchant name…"
          @keydown.enter.prevent="findVenues"
        />
        <button
          type="button"
          class="btn btn-outline-primary"
          :aria-busy="searching"
          @click="findVenues"
        >
          {{ searching ? 'Searching…' : 'Search' }}
        </button>
      </div>

      <label for="venue" class="form-label">Stall</label>
      <AppSelect
        id="venue"
        v-model="venueId"
        name="venue"
        class="form-select"
        :class="{ 'is-invalid': venueError, 'mb-3': !venueError }"
        :options="venueOptions"
        :aria-invalid="venueError ? 'true' : undefined"
        :aria-describedby="venueError ? 'venue-error' : undefined"
      />
      <div v-if="venueError" id="venue-error" class="invalid-feedback d-block mb-3">
        {{ venueError }}
      </div>

      <label for="why" class="form-label">Why should you have access?</label>
      <textarea
        id="why"
        v-model="message"
        name="message"
        rows="3"
        maxlength="1000"
        class="form-control"
        :class="{ 'is-invalid': messageError, 'mb-3': !messageError }"
        :aria-invalid="messageError ? 'true' : undefined"
        :aria-describedby="messageError ? 'why-error' : undefined"
      ></textarea>
      <div v-if="messageError" id="why-error" class="invalid-feedback d-block mb-3">
        {{ messageError }}
      </div>

      <p v-if="errorMessage" class="text-danger" role="alert">{{ errorMessage }}</p>
      <p v-if="successMessage" class="text-success" role="status">{{ successMessage }}</p>

      <button type="submit" class="btn btn-primary align-self-start" :disabled="submitting">
        {{ submitting ? 'Sending…' : 'Send request' }}
      </button>
    </form>

    <h2 class="h4 mb-3">Your requests</h2>
    <p v-if="myRequests.length === 0" class="text-secondary">No requests yet.</p>
    <ul v-else class="list-unstyled d-grid gap-2">
      <li v-for="item in myRequests" :key="item.id" class="card card-body">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <span class="text-break">{{ item.venueName }} ({{ item.merchantName }})</span>
          <span class="badge text-bg-secondary flex-shrink-0">{{ item.status }}</span>
        </div>
        <p v-if="item.reviewNote" class="small mb-0 mt-2 text-break">Reviewer note: {{ item.reviewNote }}</p>
      </li>
    </ul>
    <button
      v-if="requestsCursor"
      type="button"
      class="btn btn-outline-secondary mt-3"
      :disabled="loadingMoreRequests || refreshingRequests"
      @click="loadMoreRequests"
    >
      {{ loadingMoreRequests ? 'Loading…' : 'Load more' }}
    </button>
  </section>
</template>

<style scoped>
/* A readable form width on wide screens; Bootstrap's container still handles phone gutters. */
.merchant-access {
  max-width: 52rem;
}
</style>
