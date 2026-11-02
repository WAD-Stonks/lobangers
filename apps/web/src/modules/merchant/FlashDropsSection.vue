<script setup lang="ts">
import TicketLoading from '@web/components/TicketLoading.vue'
import FlashDropForm from '@web/modules/merchant/FlashDropForm.vue'
import FlashDropList from '@web/modules/merchant/FlashDropList.vue'
import {
  createFlashDrop,
  endFlashDrop,
  flashDropErrorMessage,
  getFlashDrops,
  type MerchantFlashDrop,
  resendFlashDrop,
} from '@web/modules/merchant/flash-drop-api'
import {
  blankFlashDropForm,
  type FlashDropFormState,
  formFromDrop,
  toFlashDropBody,
} from '@web/modules/merchant/flash-drop-rules'
import type { MerchantDeal, MerchantOutlet } from '@web/modules/merchant/merchant-api'
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  deals: MerchantDeal[] // the merchant's current deals
  outlets: MerchantOutlet[]
}>()

// How often the "min left" text refreshes.
const TICK_MS = 4000
// How often the drops are fetched again, so approvals and claimed codes show up.
const REFRESH_MS = 30_000

const drops = ref<MerchantFlashDrop[]>([])
const loading = ref(true)
const errorMessage = ref('')
const successMessage = ref('')
const now = ref(new Date())
const busyId = ref<string | null>(null)

// ----- Form -----
// editingDrop is the sent-back drop being fixed, or null for a new drop. formKey makes Vue
// build a fresh form each time it opens.
const showForm = ref(false)
const editingDrop = ref<MerchantFlashDrop | null>(null)
const formInitial = ref<FlashDropFormState>(blankFlashDropForm(undefined, []))
const formKey = ref(0)
const saving = ref(false)
const serverError = ref('')
const formHolder = ref<HTMLElement | null>(null)
// The button that opened the form, so focus goes back to it when the form closes.
let formOpener: HTMLElement | null = null

const showFormWith = async (initial: FlashDropFormState, drop: MerchantFlashDrop | null) => {
  const active = document.activeElement
  if (!showForm.value) formOpener = active instanceof HTMLElement ? active : null
  formInitial.value = initial
  editingDrop.value = drop
  serverError.value = ''
  successMessage.value = ''
  formKey.value += 1
  showForm.value = true
  // Bring the form into view and move focus to its heading.
  await nextTick()
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  formHolder.value?.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  formHolder.value?.querySelector<HTMLElement>('h3')?.focus({ preventScroll: true })
}

// Called by the page: "New flash drop" (no deal) or "Flash drop this" (one deal).
const openForm = (dealId?: string) => {
  const deal = props.deals.find((item) => item.id === dealId)
  return showFormWith(blankFlashDropForm(deal, props.outlets), null)
}
defineExpose({ openForm })

const closeForm = async () => {
  showForm.value = false
  await nextTick()
  if (formOpener?.isConnected) formOpener.focus()
  formOpener = null
}

// ----- Loading -----
const loadDrops = async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    drops.value = await getFlashDrops()
  } catch (error) {
    errorMessage.value = flashDropErrorMessage(error, 'Could not load your flash drops.')
  } finally {
    loading.value = false
  }
}

// Fetches the drops again without the loading spinner. A failure keeps the list as it is; the
// next refresh tries again.
const refreshDrops = async () => {
  if (loading.value) return
  try {
    drops.value = await getFlashDrops()
  } catch (error) {
    console.warn('Could not refresh flash drops', error)
  }
}

// Swap one drop in the list for its updated copy (or add it at the top if it is new).
const putDrop = (updated: MerchantFlashDrop) => {
  const known = drops.value.some((drop) => drop.id === updated.id)
  drops.value = known
    ? drops.value.map((drop) => (drop.id === updated.id ? updated : drop))
    : [updated, ...drops.value]
}

// ----- Sending (new or resend) -----
const sendDrop = async (form: FlashDropFormState) => {
  if (saving.value) return
  saving.value = true
  serverError.value = ''
  try {
    const body = toFlashDropBody(form, new Date())
    const sent = editingDrop.value
      ? await resendFlashDrop(editingDrop.value, body)
      : await createFlashDrop(body)
    putDrop(sent)
    void closeForm()
    successMessage.value = `“${sent.dealTitle}” was sent for review. LoBangers usually replies within 30 minutes.`
  } catch (error) {
    serverError.value = flashDropErrorMessage(error, 'Could not send the flash drop. Please try again.')
  } finally {
    saving.value = false
  }
}

// ----- Withdraw / end early -----
const confirmEnd = async (drop: MerchantFlashDrop) => {
  const inReview = drop.status === 'IN_REVIEW'
  const question = inReview
    ? `Withdraw the flash drop for “${drop.dealTitle}”? LoBangers will stop reviewing it.`
    : `End the flash drop for “${drop.dealTitle}” now? People will stop seeing the banner.`
  if (!window.confirm(question)) return
  busyId.value = drop.id
  errorMessage.value = ''
  successMessage.value = ''
  try {
    putDrop(await endFlashDrop(drop))
    successMessage.value = inReview
      ? `The flash drop for “${drop.dealTitle}” was withdrawn.`
      : `The flash drop for “${drop.dealTitle}” has ended.`
  } catch (error) {
    errorMessage.value = flashDropErrorMessage(error, 'Could not end the flash drop. Please try again.')
  } finally {
    busyId.value = null
  }
}

const openResend = (drop: MerchantFlashDrop) => showFormWith(formFromDrop(drop), drop)

let clockTimer: ReturnType<typeof setInterval> | undefined
let refreshTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  loadDrops()
  clockTimer = setInterval(() => (now.value = new Date()), TICK_MS)
  refreshTimer = setInterval(refreshDrops, REFRESH_MS)
})
onBeforeUnmount(() => {
  clearInterval(clockTimer)
  clearInterval(refreshTimer)
})
</script>

<template>
  <section class="mb-4" aria-labelledby="flash-drops-title">
    <div class="d-flex flex-wrap justify-content-between align-items-baseline gap-2 mb-3">
      <h2 id="flash-drops-title" class="h4 mb-0">Flash drops</h2>
      <span class="small text-secondary">Short, limited-code drops that pop up on the map</span>
    </div>

    <p v-if="errorMessage" class="alert alert-danger" role="alert">{{ errorMessage }}</p>
    <p v-if="successMessage" class="alert alert-success" role="status">{{ successMessage }}</p>

    <div v-if="showForm" ref="formHolder" class="form-holder">
      <FlashDropForm
        :key="formKey"
        :deals="deals"
        :outlets="outlets"
        :initial="formInitial"
        :editing="editingDrop !== null"
        :saving="saving"
        :server-error="serverError"
        @submit="sendDrop"
        @cancel="closeForm"
      />
    </div>

    <TicketLoading v-if="loading" class="text-secondary" label="Loading your flash drops…" />
    <FlashDropList
      v-else
      :drops="drops"
      :busy-id="busyId"
      :now="now"
      @end="confirmEnd"
      @resend="openResend"
    />
  </section>
</template>

<style scoped>
/* Leave room above the form when it is scrolled into view. */
.form-holder {
  scroll-margin-top: 80px;
}
</style>
