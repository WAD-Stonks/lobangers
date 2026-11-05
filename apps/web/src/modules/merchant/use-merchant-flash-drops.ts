import { authClient } from '@web/lib/auth-client'
import { useConfirm } from '@web/lib/use-confirm'
import {
  type CloseChannel,
  coalesce,
  openMerchantFlashChannel,
} from '@web/modules/flash-drop/flash-channel'
import {
  deleteFlashDrop,
  endFlashDrop,
  flashDropErrorMessage,
  getFlashDrops,
  goLiveFlashDrop,
  type MerchantFlashDrop,
} from '@web/modules/merchant/flash-drop-api'
import { whenText } from '@web/modules/merchant/flash-drop-rules'
import type { NoticeTone } from '@web/modules/merchant/merchant-notice'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const TICK_MS = 4000
const POLL_MS = 30_000
const PUSH_REFRESH_MS = 1000

export const useMerchantFlashDrops = (notify: (tone: NoticeTone, text: string) => void) => {
  const { ask } = useConfirm()
  const session = authClient.useSession()

  const drops = ref<MerchantFlashDrop[]>([])
  const loading = ref(true)
  const loadError = ref('')
  const now = ref(new Date())
  const busyId = ref<string | null>(null)
  const live = ref(false)

  const drafts = computed(() => drops.value.filter((drop) => drop.status === 'DRAFT'))
  const running = computed(() =>
    drops.value.filter((drop) => drop.status === 'SCHEDULED' || drop.status === 'LIVE'),
  )
  const past = computed(() =>
    drops.value.filter((drop) => drop.status === 'ENDED' || drop.status === 'STOPPED'),
  )

  const load = async () => {
    loading.value = true
    loadError.value = ''
    try {
      drops.value = await getFlashDrops()
    } catch (error) {
      loadError.value = flashDropErrorMessage(error, 'Could not load your flash deals.')
    } finally {
      loading.value = false
    }
  }

  let latestRead = 0
  const reloadQuietly = async () => {
    const read = ++latestRead
    try {
      const fresh = await getFlashDrops()
      if (read === latestRead) drops.value = fresh
    } catch (error) {
      console.error('Could not refresh flash deals', error)
    }
  }
  const pushedReload = coalesce(() => void reloadQuietly(), PUSH_REFRESH_MS)

  const putDrop = (updated: MerchantFlashDrop) => {
    const known = drops.value.some((drop) => drop.id === updated.id)
    drops.value = known
      ? drops.value.map((drop) => (drop.id === updated.id ? updated : drop))
      : [updated, ...drops.value]
  }

  const act = async (drop: MerchantFlashDrop, work: () => Promise<string>, failure: string) => {
    busyId.value = drop.id
    try {
      notify('success', await work())
    } catch (error) {
      notify('error', flashDropErrorMessage(error, failure))
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
        const sent = await goLiveFlashDrop(drop)
        putDrop(sent)
        return sent.status === 'LIVE'
          ? `“${drop.dealTitle}” is live now.`
          : `“${drop.dealTitle}” goes live ${whenText(sent.startsAt, new Date()).toLowerCase()}.`
      },
      'Could not send the flash deal live. Please try again.',
    )
  }

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
      body:
        drop.claimedCount > 0
          ? `“${drop.dealTitle}” ends now: people stop seeing it and nobody new can claim a code. The ${drop.claimedCount} codes already claimed keep working until ${whenText(drop.codesExpireAt, new Date()).toLowerCase()}.`
          : `“${drop.dealTitle}” ends now and people will stop seeing it.`,
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
  let pollTimer: ReturnType<typeof setInterval> | undefined
  let closeChannel: CloseChannel | null = null

  const listen = (userId: string) => {
    let connectedBefore = false
    closeChannel = openMerchantFlashChannel(userId, {
      onChange: pushedReload,
      onLiveChange: (next) => {
        live.value = next
        if (next && connectedBefore) pushedReload()
        if (next) connectedBefore = true
      },
    })
  }
  const stopListening = () => {
    closeChannel?.()
    closeChannel = null
    live.value = false
  }

  watch(
    () => session.value.data?.user.id ?? null,
    (userId) => {
      stopListening()
      if (userId) listen(userId)
    },
    { immediate: true },
  )

  onMounted(() => {
    void load()
    timer = setInterval(() => {
      now.value = new Date()
    }, TICK_MS)
    pollTimer = setInterval(() => {
      if (!live.value && running.value.length > 0 && !document.hidden) void reloadQuietly()
    }, POLL_MS)
  })
  onBeforeUnmount(() => {
    clearInterval(timer)
    clearInterval(pollTimer)
    stopListening()
    pushedReload.cancel()
  })

  return {
    drops,
    drafts,
    running,
    past,
    loading,
    loadError,
    now,
    busyId,
    live,
    goLive,
    remove,
    endNow,
  }
}

export type MerchantFlashDrops = ReturnType<typeof useMerchantFlashDrops>
