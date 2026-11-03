import type {
  FlashCode,
  FlashDropChange,
  PublicFlashDrop,
} from '@broke-oclock/contracts/flash-drops'
import { api } from '@web/lib/api-client'
import {
  type CloseChannel,
  coalesce,
  openMapFlashChannel,
} from '@web/modules/flash-drop/flash-channel'
import {
  computed,
  type InjectionKey,
  inject,
  onBeforeUnmount,
  provide,
  type Ref,
  shallowRef,
  watch,
} from 'vue'

// Live Flash Drops for the map, banner and deal panel, and the visitor's claimed codes for the
// menu and My codes. A pushed change (a drop going live, being claimed, ending) re-reads them at
// once; they also refresh every 30 s, which catches scheduled starts and covers a missing or
// dropped socket, and when the tab comes back. A one-second clock drives every countdown.
const REFRESH_MS = 30_000
const TICK_MS = 1000
// At most one re-read a second however many pushes arrive.
const PUSH_REFRESH_MS = 1000

type Session = Readonly<Ref<{ data: { user: { id?: string } } | null }>>

export const createFlashDrops = (session: Session) => {
  const drops = shallowRef<readonly PublicFlashDrop[]>([])
  const codes = shallowRef<readonly FlashCode[]>([])
  const now = shallowRef(Date.now())
  // Bumped on every load and sign-out, so a slow response for an old session is dropped.
  let latestCodes = 0
  let refreshTimer: ReturnType<typeof setInterval> | null = null
  let tickTimer: ReturnType<typeof setInterval> | null = null
  let closeChannel: CloseChannel | null = null

  const refresh = async () => {
    try {
      const response = await api.flashDrops.active()
      drops.value = response.items
    } catch (error) {
      // Drops are extra; the map works without them.
      console.error('Could not load flash drops', error)
    }
  }

  // Resolves false when the codes could not be loaded, so My codes can offer a retry instead of
  // claiming there are none.
  const loadCodes = async (): Promise<boolean> => {
    const request = ++latestCodes
    try {
      const response = await api.flashDrops.myCodes()
      if (request === latestCodes) codes.value = response.items
      return true
    } catch (error) {
      console.error('Could not load flash codes', error)
      return false
    }
  }

  const upsertCode = (code: FlashCode) => {
    codes.value = [code, ...codes.value.filter((item) => item.dropId !== code.dropId)]
  }

  // Claims one code; the drop's count updates from the next refresh, or straight away here.
  const claim = async (dropId: string): Promise<FlashCode> => {
    const code = await api.flashDrops.claim(dropId)
    upsertCode(code)
    drops.value = drops.value.map((drop) =>
      drop.id === dropId ? { ...drop, codesLeft: Math.max(0, drop.codesLeft - 1) } : drop,
    )
    void refresh()
    return code
  }

  const pushedRefresh = coalesce(() => void refresh(), PUSH_REFRESH_MS)
  const onPushed = (change: FlashDropChange) => {
    pushedRefresh()
    // An admin removing a drop cancels its codes, so a held one is re-read too.
    if (change.kind === 'STOPPED' && codes.value.some((code) => code.dropId === change.dropId))
      void loadCodes()
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible') void refresh()
  }

  const start = () => {
    void refresh()
    // A hidden tab skips polls; onVisible catches up the moment it is shown again.
    refreshTimer = setInterval(() => {
      if (!document.hidden) void refresh()
    }, REFRESH_MS)
    tickTimer = setInterval(() => {
      now.value = Date.now()
    }, TICK_MS)
    document.addEventListener('visibilitychange', onVisible)
    // Pushes sent while the socket was down are lost, so a reconnect catches up. The first
    // connect needs nothing: the refresh above has just run.
    let connectedBefore = false
    closeChannel = openMapFlashChannel({
      onChange: onPushed,
      onLiveChange: (live) => {
        if (live && connectedBefore) pushedRefresh()
        if (live) connectedBefore = true
      },
    })
  }

  const stop = () => {
    if (refreshTimer) clearInterval(refreshTimer)
    if (tickTimer) clearInterval(tickTimer)
    refreshTimer = null
    tickTimer = null
    document.removeEventListener('visibilitychange', onVisible)
    closeChannel?.()
    closeChannel = null
    pushedRefresh.cancel()
  }

  watch(
    () => session.value.data?.user.id ?? (session.value.data ? 'signed-in' : null),
    (user) => {
      if (user) {
        void loadCodes()
        return
      }
      latestCodes += 1
      codes.value = []
    },
    { immediate: true },
  )

  const live = computed(() =>
    drops.value.filter((drop) => new Date(drop.endsAt).getTime() > now.value),
  )
  // Codes outlive claiming: they are good at the counter until they expire.
  const activeCodes = computed(() =>
    codes.value.filter((code) => code.active && new Date(code.expiresAt).getTime() > now.value),
  )

  return {
    drops: live,
    codes,
    activeCodes,
    now,
    refresh,
    loadCodes,
    claim,
    start,
    stop,
    liveForDeal: (dealId: string) => live.value.find((drop) => drop.dealId === dealId) ?? null,
    codeForDrop: (dropId: string) => codes.value.find((code) => code.dropId === dropId) ?? null,
  }
}

export type FlashDrops = ReturnType<typeof createFlashDrops>

const FLASH_KEY: InjectionKey<FlashDrops> = Symbol('flash-drops')

export const provideFlashDrops = (session: Session): FlashDrops => {
  const store = createFlashDrops(session)
  store.start()
  onBeforeUnmount(store.stop)
  provide(FLASH_KEY, store)
  return store
}

// Panels and the menu outside the map shell (or in tests) simply see no drops.
export const useFlashDrops = (): FlashDrops | null => inject(FLASH_KEY, null)
