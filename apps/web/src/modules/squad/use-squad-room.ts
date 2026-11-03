import type { SquadAvatar, SquadEvent, SquadJoin, SquadState } from '@broke-oclock/contracts/squad'
import { ApiClientError, api } from '@web/lib/api-client'
import {
  type ChannelOpener,
  openRoomChannel,
  type RoomChannel,
} from '@web/modules/squad/room-channel'
import { computed, type InjectionKey, inject, onBeforeUnmount, provide, shallowRef } from 'vue'

// The Makan Squad room the visitor is in, shared by the room panel, the map and the menu. Other
// members' taps arrive live on the room's channel and play as effects at once; the full room
// state is then re-read once the burst settles. The sync heartbeat runs slowly while the channel
// is live and becomes the polling fallback when it is not. The visitor's own taps go in small
// batches so spamming Yay is one request, not twenty. The room survives moving between panels
// (opening a deal's details, minimising the sheet) because the shell owns it.

export const POLL_MS = 1500
const SLOW_POLL_MS = 5000
// With the channel live the heartbeat only says "still here"; it must beat AWAY_AFTER_MS (40s).
export const HEARTBEAT_MS = 15_000
// Pushed effects play at once; the state behind them is re-read once a burst of taps settles.
export const REFRESH_AFTER_PUSH_MS = 350
const TAP_BATCH_MS = 220
// After this many failed polls in a row the room says the connection was lost.
const LOST_AFTER_FAILURES = 3
const STORAGE_KEY = 'lobangers.squad.room'

export type Connection = 'ok' | 'lost'
export type EffectListener = (event: SquadEvent, state: SquadState) => void

const readStoredCode = (): string | null => {
  try {
    return sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

const storeCode = (code: string | null) => {
  try {
    if (code) sessionStorage.setItem(STORAGE_KEY, code)
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Private windows may refuse storage; the room still works for this page.
  }
}

export const messageFor = (error: unknown, fallback: string): string => {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return 'Log in to join a Squad room.'
    if ([400, 403, 404, 409, 412].includes(error.status) && error.message) return error.message
  }
  return fallback
}

export const createSquadRoom = (openChannel: ChannelOpener = openRoomChannel) => {
  const code = shallowRef<string | null>(readStoredCode())
  const state = shallowRef<SquadState | null>(null)
  const connection = shallowRef<Connection>('ok')
  const error = shallowRef('')
  const busy = shallowRef(false)
  const listeners = new Set<EffectListener>()
  let after = 0
  let failures = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingTaps: { stance: 'YAY' | 'NAH'; taps: number } | null = null
  let tapTimer: ReturnType<typeof setTimeout> | null = null
  let generation = 0
  let channel: RoomChannel | null = null
  let live = false
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  let polling = false
  let pollAgain = false

  // Plays each event once, whether it came pushed or in a sync reply, and in order.
  const deliver = (events: readonly SquadEvent[], next: SquadState | null) => {
    const mine = next?.me?.memberId
    const fresh = events.filter((event) => event.seq > after).sort((a, b) => a.seq - b.seq)
    for (const event of fresh) {
      after = event.seq
      // The visitor's own taps already played when they tapped.
      if ((event.kind === 'YAY' || event.kind === 'NAH') && event.memberId === mine) continue
      if (next) for (const listener of listeners) listener(event, next)
    }
  }

  const apply = (next: SquadState) => {
    state.value = next
    if (next.status === 'CLOSED' || next.me?.kicked) storeCode(null)
  }

  const poll = async () => {
    const current = code.value
    const started = generation
    if (!current) return
    // One sync at a time; a push during one asks for a fresh read when it lands.
    if (polling) {
      pollAgain = true
      return
    }
    polling = true
    try {
      const response = await api.squad.sync(current, after)
      if (started !== generation) return
      failures = 0
      connection.value = 'ok'
      // The first sync loads the room without replaying its history.
      if (after === 0) after = response.nextSeq
      else deliver(response.events, response.state)
      after = Math.max(after, response.nextSeq)
      apply(response.state)
    } catch (reason) {
      if (started !== generation) return
      failures += 1
      if (reason instanceof ApiClientError && [403, 404].includes(reason.status)) {
        error.value = messageFor(reason, 'This room is no longer available.')
        stop()
        return
      }
      if (failures >= LOST_AFTER_FAILURES) connection.value = 'lost'
    } finally {
      if (started === generation) polling = false
    }
    if (started !== generation) return
    if (pollAgain) {
      pollAgain = false
      void poll()
      return
    }
    schedule()
  }

  // Coalesces a burst of pushes into one state read.
  const refreshSoon = () => {
    if (refreshTimer) return
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      void poll()
    }, REFRESH_AFTER_PUSH_MS)
  }

  const closeChannel = () => {
    channel?.close()
    channel = null
    live = false
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = null
  }

  const openChannelFor = (target: string) => {
    closeChannel()
    const opened = generation
    channel = openChannel(target, {
      onEvents: (events) => {
        if (opened !== generation) return
        deliver(events, state.value)
        refreshSoon()
      },
      onLiveChange: (next) => {
        if (opened !== generation) return
        live = next
        // Catch up on anything missed while the channel was down, then pace the heartbeat.
        void poll()
      },
    })
  }

  const schedule = () => {
    if (timer) clearTimeout(timer)
    const closed = state.value?.status === 'CLOSED' || state.value?.me?.kicked
    if (!code.value) return
    if (closed) {
      closeChannel()
      return
    }
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
    const delay = live ? HEARTBEAT_MS : failures > 0 || hidden ? SLOW_POLL_MS : POLL_MS
    timer = setTimeout(() => void poll(), delay)
  }

  const stop = () => {
    if (timer) clearTimeout(timer)
    timer = null
    closeChannel()
  }

  // Follows a room by code; the first sync loads it without replaying old effects.
  // keepState holds the room a create/join just returned so the lobby shows at once, not a blank wait.
  const open = (next: string, keepState = false) => {
    if (code.value === next && state.value) return
    generation += 1
    stop()
    code.value = next
    storeCode(next)
    if (!keepState) state.value = null
    after = 0
    failures = 0
    polling = false
    pollAgain = false
    error.value = ''
    openChannelFor(next)
    void poll()
  }

  const forget = () => {
    generation += 1
    polling = false
    pollAgain = false
    stop()
    code.value = null
    state.value = null
    storeCode(null)
  }

  // Runs one room write, keeping the latest state and a readable error.
  const act = async (work: () => Promise<SquadState>, fallback: string) => {
    if (busy.value) return null
    busy.value = true
    error.value = ''
    try {
      const next = await work()
      apply(next)
      return next
    } catch (reason) {
      error.value = messageFor(reason, fallback)
      return null
    } finally {
      busy.value = false
    }
  }

  const room = () => {
    if (!code.value) throw new Error('No Squad room open')
    return code.value
  }

  const flushTaps = async () => {
    const batch = pendingTaps
    pendingTaps = null
    tapTimer = null
    if (!batch || !code.value) return
    try {
      apply(await api.squad.vote(code.value, batch))
    } catch (reason) {
      error.value = messageFor(reason, 'That vote did not go through. Try again.')
    }
  }

  // Every tap counts and plays at once; taps in quick succession travel together.
  const tap = (stance: 'YAY' | 'NAH') => {
    // Switching from Yay to Nah sends the Yays first, so the latest stance wins.
    if (pendingTaps && pendingTaps.stance !== stance) void flushTaps()
    pendingTaps = pendingTaps
      ? { stance, taps: Math.min(20, pendingTaps.taps + 1) }
      : { stance, taps: 1 }
    if (!tapTimer) tapTimer = setTimeout(() => void flushTaps(), TAP_BATCH_MS)
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible' && code.value) void poll()
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)

  const dispose = () => {
    stop()
    if (tapTimer) clearTimeout(tapTimer)
    listeners.clear()
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible)
  }

  if (code.value) {
    openChannelFor(code.value)
    void poll()
  }

  return {
    code,
    state,
    connection,
    error,
    busy,
    open,
    forget,
    tap,
    onEffect: (listener: EffectListener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    join: async (target: string, input: SquadJoin) => {
      const joined = await act(() => api.squad.join(target, input), 'Could not join that room.')
      if (joined) open(target, true)
      return joined
    },
    create: async (input: {
      dealIds: string[]
      capacity: number
      displayName: string
      avatar: SquadAvatar
    }) => {
      const created = await act(() => api.squad.create(input), 'Could not open a room. Try again.')
      if (created) open(created.code, true)
      return created
    },
    start: () => act(() => api.squad.start(room()), 'Could not start the room.'),
    leave: () => act(() => api.squad.leave(room()), 'Could not leave the room.'),
    close: () => act(() => api.squad.close(room()), 'Could not close the room.'),
    remove: (memberId: string) =>
      act(() => api.squad.remove(room(), memberId), 'Could not remove them.'),
    addDeals: (dealIds: string[]) =>
      act(() => api.squad.addDeals(room(), dealIds), 'Could not add those deals.'),
    choose: (choice: 'AGAIN' | 'NEXT') =>
      act(() => api.squad.choose(room(), { choice }), 'That choice did not go through.'),
    retry: () => {
      failures = 0
      void poll()
    },
    dispose,
    // The deal the room is voting on now, if live.
    currentDeal: computed(() => {
      const current = state.value
      if (current?.status !== 'LIVE') return null
      const id =
        current.phase === 'MATCHED' ? current.matchDealId : current.deals[current.dealIndex]?.id
      return current.deals.find((deal) => deal.id === id) ?? null
    }),
  }
}

export type SquadRoom = ReturnType<typeof createSquadRoom>

const SQUAD_KEY: InjectionKey<SquadRoom> = Symbol('squad-room')

export const provideSquadRoom = (): SquadRoom => {
  const room = createSquadRoom()
  onBeforeUnmount(room.dispose)
  provide(SQUAD_KEY, room)
  return room
}

export const useSquadRoom = (): SquadRoom | null => inject(SQUAD_KEY, null)
