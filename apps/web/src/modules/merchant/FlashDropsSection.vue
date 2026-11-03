<script setup lang="ts">
import TicketLoading from '@web/components/TicketLoading.vue'
import { useConfirm } from '@web/lib/use-confirm'
import DealSection from '@web/modules/merchant/DealSection.vue'
import FlashDropList from '@web/modules/merchant/FlashDropList.vue'
import {
  deleteFlashDrop,
  endFlashDrop,
  flashDropErrorMessage,
  getFlashDrops,
  goLiveFlashDrop,
  type MerchantFlashDrop,
} from '@web/modules/merchant/flash-drop-api'
import { whenText } from '@web/modules/merchant/flash-drop-rules'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

// The merchant's own flash deals: drafts (saved from the deal form with "Save as flash deal"),
// the ones that have gone live, and past ones. Drafts are edited in the deal form, so Edit is
// passed up to the page.
const emit = defineEmits<{ edit: [drop: MerchantFlashDrop] }>()

// How often the "min left" text and the statuses refresh.
const TICK_MS = 4000

// The dashboard mounts the app's confirm dialog; these ask through it.
const { ask } = useConfirm()

const drops = ref<MerchantFlashDrop[]>([])
const loading = ref(true)
const errorMessage = ref('')
const successMessage = ref('')
const now = ref(new Date())
const busyId = ref<string | null>(null)

const drafts = computed(() => drops.value.filter((drop) => drop.status === 'DRAFT'))
const running = computed(() =>
  drops.value.filter((drop) => drop.status === 'SCHEDULED' || drop.status === 'LIVE'),
)
const past = computed(() =>
  drops.value.filter((drop) => drop.status === 'ENDED' || drop.status === 'STOPPED'),
)

const loadDrops = async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    drops.value = await getFlashDrops()
  } catch (error) {
    errorMessage.value = flashDropErrorMessage(error, 'Could not load your flash deals.')
  } finally {
    loading.value = false
  }
}

// Swap one flash deal in the list for its updated copy (or add it at the top if it is new).
const putDrop = (updated: MerchantFlashDrop) => {
  const known = drops.value.some((drop) => drop.id === updated.id)
  drops.value = known
    ? drops.value.map((drop) => (drop.id === updated.id ? updated : drop))
    : [updated, ...drops.value]
}

// The page calls this after "Save as flash deal".
const saved = (drop: MerchantFlashDrop, created: boolean) => {
  putDrop(drop)
  errorMessage.value = ''
  successMessage.value = created
    ? `“${drop.dealTitle}” was saved as a draft. Press Go live when you are ready.`
    : `The draft “${drop.dealTitle}” was updated.`
}
defineExpose({ saved })

// Runs one request for a flash deal, with its button disabled meanwhile.
const act = async (drop: MerchantFlashDrop, work: () => Promise<string>, failure: string) => {
  busyId.value = drop.id
  errorMessage.value = ''
  successMessage.value = ''
  try {
    successMessage.value = await work()
  } catch (error) {
    errorMessage.value = flashDropErrorMessage(error, failure)
  } finally {
    busyId.value = null
  }
}

const goLive = async (drop: MerchantFlashDrop) => {
  const when = drop.startsOnGoLive ? 'now' : whenText(drop.startsAt, new Date()).toLowerCase()
  const confirmed = await ask({
    title: 'Send this flash deal live?',
    body: `“${drop.dealTitle}” starts ${when}. Everyone on LoBangers is told when it starts.`,
    confirmLabel: 'Go live',
    tone: 'primary',
  })
  if (!confirmed) return
  return act(
    drop,
    async () => {
      const live = await goLiveFlashDrop(drop)
      putDrop(live)
      return live.status === 'LIVE'
        ? `“${drop.dealTitle}” is live now.`
        : `“${drop.dealTitle}” goes live ${whenText(live.startsAt, new Date()).toLowerCase()}.`
    },
    'Could not send the flash deal live. Please try again.',
  )
}

// Deletes a draft, or takes a past flash deal out of the merchant's history.
const remove = async (drop: MerchantFlashDrop) => {
  const draft = drop.status === 'DRAFT'
  const confirmed = await ask(
    draft
      ? {
          title: 'Delete this draft?',
          body: `The draft “${drop.dealTitle}” will be deleted. This cannot be undone.`,
          confirmLabel: 'Delete draft',
        }
      : {
          title: 'Delete this flash deal?',
          body: `“${drop.dealTitle}” will be removed from your past flash deals. Codes people claimed stay valid.`,
          confirmLabel: 'Delete',
        },
  )
  if (!confirmed) return
  return act(
    drop,
    async () => {
      await deleteFlashDrop(drop)
      drops.value = drops.value.filter((item) => item.id !== drop.id)
      return draft
        ? `The draft “${drop.dealTitle}” was deleted.`
        : `“${drop.dealTitle}” was deleted from your past flash deals.`
    },
    'Could not delete the flash deal. Please try again.',
  )
}

const endNow = async (drop: MerchantFlashDrop) => {
  const confirmed = await ask({
    title: 'End this flash deal?',
    body: `“${drop.dealTitle}” ends now and people will stop seeing it.`,
    confirmLabel: 'End now',
  })
  if (!confirmed) return
  return act(
    drop,
    async () => {
      putDrop(await endFlashDrop(drop))
      return `The flash deal “${drop.dealTitle}” has ended.`
    },
    'Could not end the flash deal. Please try again.',
  )
}

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  loadDrops()
  timer = setInterval(() => {
    now.value = new Date()
  }, TICK_MS)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <!-- One dropdown for all flash deals, with Drafts, Live and scheduled, and Past inside. -->
  <DealSection title="Flash deals" :count="drops.length">
    <p class="small text-secondary">Short, limited-code deals that pop up on the map.</p>
    <p v-if="errorMessage" class="alert alert-danger" role="alert">{{ errorMessage }}</p>
    <p v-if="successMessage" class="alert alert-success" role="status">{{ successMessage }}</p>

    <TicketLoading v-if="loading" class="text-secondary" label="Loading your flash deals…" />
    <template v-else>
      <DealSection title="Drafts" :count="drafts.length" level="h3">
        <FlashDropList
          :drops="drafts"
          :busy-id="busyId"
          :now="now"
          empty="No drafts. Use “Save as flash deal” in the deal form to make one."
          @edit="emit('edit', $event)"
          @go-live="goLive"
          @remove="remove"
        />
      </DealSection>
      <DealSection title="Live and scheduled" :count="running.length" level="h3">
        <FlashDropList
          :drops="running"
          :busy-id="busyId"
          :now="now"
          empty="Nothing live right now."
          @end="endNow"
        />
      </DealSection>
      <DealSection title="Past" :count="past.length" level="h3" :default-open="false">
        <FlashDropList
          :drops="past"
          :busy-id="busyId"
          :now="now"
          empty="No past flash deals yet."
          @remove="remove"
        />
      </DealSection>
    </template>
  </DealSection>
</template>
