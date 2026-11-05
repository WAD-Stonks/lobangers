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

const REFRESH_MS = 30_000
const TICK_MS = 1000
const PUSH_REFRESH_MS = 1000

type Session = Readonly<Ref<{ data: { user: { id?: string } } | null }>>

export const createFlashDrops = (session: Session) => {
  const drops = shallowRef<readonly PublicFlashDrop[]>([])
  const codes = shallowRef<readonly FlashCode[]>([])
  const now = shallowRef(Date.now())
  let latestCodes = 0
  let refreshTimer: ReturnType<typeof setInterval> | null = null
  let tickTimer: ReturnType<typeof setInterval> | null = null
  let closeChannel: CloseChannel | null = null

  const refresh = async () => {
    try {
      const response = await api.flashDrops.active()
      drops.value = response.items
    } catch (error) {
      console.error('Could not load flash drops', error)
    }
  }

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
    if (change.kind === 'STOPPED' && codes.value.some((code) => code.dropId === change.dropId))
      void loadCodes()
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible') void refresh()
  }

  const start = () => {
    void refresh()
    refreshTimer = setInterval(() => {
      if (!document.hidden) void refresh()
    }, REFRESH_MS)
    tickTimer = setInterval(() => {
      now.value = Date.now()
    }, TICK_MS)
    document.addEventListener('visibilitychange', onVisible)
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

export const useFlashDrops = (): FlashDrops | null => inject(FLASH_KEY, null)
