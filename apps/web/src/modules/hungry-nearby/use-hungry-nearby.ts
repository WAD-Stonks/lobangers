import {
  type MyPresence,
  type NearbyPerson,
  PRESENCE_HEARTBEAT_MS,
  type PresenceAvatar,
} from '@broke-oclock/contracts/presence'
import { ApiClientError, api } from '@web/lib/api-client'
import { isWithinSingapore } from '@web/modules/browse-map/singapore-bounds'
import type { Coordinates } from '@web/modules/browse-map/types'
import { type NearbyPrefs, readPrefs, writePrefs } from '@web/modules/hungry-nearby/nearby-prefs'
import { useNearbyMap } from '@web/modules/hungry-nearby/use-nearby-map'
import type { ToastQueue } from '@web/modules/map-shell/use-toast'
import type L from 'leaflet'
import {
  computed,
  type InjectionKey,
  inject,
  onBeforeUnmount,
  provide,
  type Ref,
  ref,
  shallowRef,
  watch,
} from 'vue'

// Hungry Nearby on the map: who else is around (anyone may look), and, for signed-in people
// who choose it, their own fuzzed spot kept alive by a heartbeat while the tab is visible.
// Nothing is shared until the viewer taps "Show me too".
const REFRESH_MS = 30_000
const MOVE_SETTLE_MS = 400

type Session = Readonly<Ref<{ data: { user: { id?: string } } | null }>>
export type HungryNearbyOptions = {
  readonly session: Session
  readonly map: Readonly<Ref<L.Map | null>>
  readonly position: Readonly<Ref<Coordinates | null>>
  readonly locate: () => Promise<Coordinates | null>
}

const isUnauthorized = (error: unknown) => error instanceof ApiClientError && error.status === 401

export const createHungryNearby = (options: HungryNearbyOptions) => {
  // The shell's toast queue is provided by the same component that creates this store, so a
  // child (the toggle) binds it; until then notices go nowhere.
  let toast: Pick<ToastQueue, 'show'> = { show: () => undefined }
  const bindToast = (queue: Pick<ToastQueue, 'show'>) => {
    toast = queue
  }
  const prefs = shallowRef<NearbyPrefs>(readPrefs())
  const people = shallowRef<readonly NearbyPerson[]>([])
  const me = shallowRef<MyPresence | null>(null)
  const pending = ref<'share' | 'hide' | null>(null)
  const popoverOpen = ref(false)
  const signedIn = computed(() => options.session.value.data !== null)
  const looking = computed(() => prefs.value.looking)
  const sharing = computed(() => prefs.value.sharing && signedIn.value)
  // Bumped on each list request and on turning off, so a slow answer never brings people back.
  let latest = 0
  let refreshTimer: ReturnType<typeof setInterval> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let moveTimer: ReturnType<typeof setTimeout> | null = null

  const setPrefs = (next: Partial<NearbyPrefs>) => {
    prefs.value = { ...prefs.value, ...next }
    writePrefs(prefs.value)
  }

  const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible'

  // Lists around the middle of the map, or the visitor when the map looks off the island.
  const centre = (): Coordinates | null => {
    const middle = options.map.value?.getCenter()
    const candidate = middle ? { lat: middle.lat, lng: middle.lng } : options.position.value
    if (candidate && isWithinSingapore(candidate)) return candidate
    const position = options.position.value
    return position && isWithinSingapore(position) ? position : null
  }

  const refresh = async () => {
    const point = centre()
    if (!looking.value || !point) return
    const request = ++latest
    try {
      const response = await api.presence.nearby(point)
      if (request !== latest || !looking.value) return
      people.value = response.items
      if (sharing.value && response.me) me.value = response.me
    } catch (error) {
      // People nearby are extra; the map works without them.
      console.error('Could not load lobangers nearby', error)
    }
  }

  const stopSharingLocally = () => {
    me.value = null
    setPrefs({ sharing: false })
  }

  const heartbeat = async () => {
    const position = options.position.value
    if (!sharing.value || !visible() || !position || !isWithinSingapore(position)) return
    try {
      const response = await api.presence.share(position, prefs.value.avatar ?? undefined)
      if (sharing.value) me.value = response.me
    } catch (error) {
      if (isUnauthorized(error)) {
        stopSharingLocally()
        toast.show('Log in again to keep showing yourself.', { tone: 'error' })
        return
      }
      console.error('Could not keep you on the map', error)
    }
  }

  const syncTimers = () => {
    if (looking.value && !refreshTimer)
      refreshTimer = setInterval(() => visible() && void refresh(), REFRESH_MS)
    if (!looking.value && refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
    if (sharing.value && !heartbeatTimer)
      heartbeatTimer = setInterval(() => void heartbeat(), PRESENCE_HEARTBEAT_MS)
    if (!sharing.value && heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  const turnOn = () => {
    setPrefs({ looking: true })
    // The popover explains the choice; a toast now would cover it on phones.
    popoverOpen.value = true
    void refresh()
  }

  // "Just look": others stay on the map and the viewer stays hidden.
  const justLook = () => {
    popoverOpen.value = false
    if (!sharing.value) toast.show('Showing lobangers nearby. You stay hidden.')
  }

  const showMe = async (avatar: PresenceAvatar | null) => {
    if (!signedIn.value || pending.value) return
    pending.value = 'share'
    try {
      const position = options.position.value ?? (await options.locate())
      if (!position || !isWithinSingapore(position)) {
        toast.show('Turn on location in Singapore to show yourself.', { tone: 'error' })
        return
      }
      const response = await api.presence.share(position, avatar ?? undefined)
      me.value = response.me
      setPrefs({ looking: true, sharing: true, avatar: response.me.avatar })
      toast.show('You are on the map as a lobanger. Your spot is blurred by about 150\u00a0m.')
    } catch (error) {
      if (isUnauthorized(error)) stopSharingLocally()
      toast.show('Could not show you on the map. Try again.', { tone: 'error' })
      console.error('Could not share presence', error)
    } finally {
      pending.value = null
    }
  }

  const hideMe = async () => {
    if (pending.value === 'hide') return
    pending.value = 'hide'
    // Stop the heartbeat first, so nothing re-shares while the request is in flight.
    stopSharingLocally()
    try {
      await api.presence.hide()
      toast.show('You are hidden. Others no longer see you.')
    } catch (error) {
      console.error('Could not hide presence', error)
      toast.show('Could not reach the server. You will vanish within 2 minutes.', {
        tone: 'error',
      })
    } finally {
      pending.value = null
    }
  }

  const turnOff = async () => {
    popoverOpen.value = false
    const wasSharing = sharing.value
    setPrefs({ looking: false })
    latest += 1
    people.value = []
    if (wasSharing) await hideMe()
  }

  const toggle = () => (looking.value ? turnOff() : turnOn())

  const onVisible = () => {
    if (!visible()) return
    void refresh()
    void heartbeat()
  }
  const onMoved = () => {
    if (moveTimer) clearTimeout(moveTimer)
    moveTimer = setTimeout(() => void refresh(), MOVE_SETTLE_MS)
  }

  watch([looking, sharing], syncTimers, { immediate: true })
  // Sharing resumes once the session and position are known, e.g. after a reload.
  watch(
    () => [sharing.value, options.position.value !== null] as const,
    ([isSharing, located], previous) => {
      // Not right after "Show me too", which has just sent the first heartbeat itself.
      if (isSharing && located && !(previous?.[0] && previous[1]) && !me.value) void heartbeat()
      if (!isSharing) me.value = null
    },
    { immediate: true },
  )
  watch(
    options.map,
    (map, old) => {
      old?.off('moveend', onMoved)
      map?.on('moveend', onMoved)
      void refresh()
    },
    { immediate: true },
  )
  watch(
    () => options.position.value !== null,
    () => void refresh(),
  )

  const start = () => document.addEventListener('visibilitychange', onVisible)
  const stop = () => {
    document.removeEventListener('visibilitychange', onVisible)
    options.map.value?.off('moveend', onMoved)
    if (moveTimer) clearTimeout(moveTimer)
    if (refreshTimer) clearInterval(refreshTimer)
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    refreshTimer = null
    heartbeatTimer = null
  }

  return {
    people,
    me,
    looking,
    sharing,
    signedIn,
    pending,
    popoverOpen,
    avatar: computed(() => prefs.value.avatar),
    bindToast,
    justLook,
    toggle,
    turnOn,
    turnOff,
    showMe,
    hideMe,
    refresh,
    start,
    stop,
  }
}

export type HungryNearby = ReturnType<typeof createHungryNearby>

const NEARBY_KEY: InjectionKey<HungryNearby> = Symbol('hungry-nearby')

export const provideHungryNearby = (options: HungryNearbyOptions): HungryNearby => {
  const store = createHungryNearby(options)
  store.start()
  onBeforeUnmount(store.stop)
  useNearbyMap(options.map, store)
  provide(NEARBY_KEY, store)
  return store
}

// Controls mounted outside the map shell (or alone in a test) simply have no toggle.
export const useHungryNearby = (): HungryNearby | null => inject(NEARBY_KEY, null)
