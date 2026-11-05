import type {
  SquadAvatar,
  SquadBallot,
  SquadEvent,
  SquadJoin,
  SquadState,
  SquadTap,
} from '@broke-oclock/contracts/squad'
import { ApiClientError, api } from '@web/lib/api-client'
import {
  type ChannelOpener,
  openRoomChannel,
  type RoomChannel,
} from '@web/modules/squad/room-channel'
import { computed, type InjectionKey, inject, onBeforeUnmount, provide, shallowRef } from 'vue'

export const POLL_MS = 1500
const SLOW_POLL_MS = 5000
export const HEARTBEAT_MS = 15_000
export const REFRESH_AFTER_PUSH_MS = 350
const TAP_BATCH_MS = 220
export const LIVE_TAP_BATCH_MS = 1000
export const SOCKET_TAP_MS = 400
const TAPS_PER_REMOTE_EFFECT = 4
const MAX_REMOTE_EFFECTS = 3
const MAX_REMOTE_NAHS = 6
const MAX_SOCKET_TAPS = 50
const LOST_AFTER_FAILURES = 3
const STORAGE_KEY = 'lobangers.squad.room'

export type Connection = 'ok' | 'lost'
type TapBatch = { stance: 'YAY' | 'NAH'; taps: number }
const MAX_TAPS_PER_SEND = 20
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
  } catch {}
}

export const withBallot = (current: SquadState, ballot: SquadBallot): SquadState => {
  if (current.status !== 'LIVE' || current.phase !== 'VOTING') return current
  const members = current.members.map((member) =>
    member.id === ballot.memberId
      ? { ...member, stance: ballot.stance, yays: ballot.yays }
      : member,
  )
  const voters = members.filter((member) => !member.spectator && !member.away)
  return {
    ...current,
    members,
    tally: {
      ...current.tally,
      yesPeople: voters.filter((member) => member.stance === 'YAY').length,
      voted: voters.filter((member) => member.stance !== null).length,
    },
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
  let tapQueue: readonly TapBatch[] = []
  let sendingTaps = false
  let socketTaps = { yays: 0, nahs: 0 }
  let socketTimer: ReturnType<typeof setTimeout> | null = null
  const echoTimers = new Set<ReturnType<typeof setTimeout>>()
  let tapTimer: ReturnType<typeof setTimeout> | null = null
  let generation = 0
  let channel: RoomChannel | null = null
  let live = false
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  let polling = false
  let pollAgain = false

  const deliver = (events: readonly SquadEvent[], next: SquadState | null) => {
    const mine = next?.me?.memberId
    const fresh = events.filter((event) => event.seq > after).sort((a, b) => a.seq - b.seq)
    for (const event of fresh) {
      after = event.seq
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

  const refreshSoon = () => {
    if (refreshTimer) return
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      void poll()
    }, REFRESH_AFTER_PUSH_MS)
  }

  const closeChannel = () => {
    clearEchoes()
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
      onBallot: (ballot) => {
        if (opened !== generation || !state.value) return
        state.value = withBallot(state.value, ballot)
      },
      onTaps: (incoming) => playTaps(incoming),
      onLiveChange: (next) => {
        if (opened !== generation) return
        live = next
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

  const tapDelay = () => (live ? LIVE_TAP_BATCH_MS : TAP_BATCH_MS)

  const flushTaps = async () => {
    tapTimer = null
    const [batch, ...rest] = tapQueue
    if (sendingTaps || !batch || !code.value) return
    tapQueue = rest
    sendingTaps = true
    try {
      apply(await api.squad.vote(code.value, batch))
    } catch (reason) {
      if (reason instanceof ApiClientError && reason.status === 412) tapQueue = []
      else error.value = messageFor(reason, 'That vote did not go through. Try again.')
    } finally {
      sendingTaps = false
    }
    if (tapQueue.length > 0 && !tapTimer) tapTimer = setTimeout(() => void flushTaps(), tapDelay())
  }

  const echoCount = (taps: number) =>
    taps === 0 ? 0 : Math.min(MAX_REMOTE_EFFECTS, Math.ceil(taps / TAPS_PER_REMOTE_EFFECT))

  const playTaps = (incoming: SquadTap) => {
    const current = state.value
    if (!current || incoming.memberId === current.me?.memberId) return
    const kinds = [
      ...Array.from({ length: echoCount(incoming.yays) }, () => 'YAY' as const),
      ...Array.from({ length: Math.min(MAX_REMOTE_NAHS, incoming.nahs) }, () => 'NAH' as const),
    ]
    const gap = SOCKET_TAP_MS / kinds.length
    kinds.forEach((kind, index) => {
      const timer = setTimeout(() => {
        echoTimers.delete(timer)
        const now = state.value
        if (!now || now.dealIndex !== current.dealIndex) return
        const event: SquadEvent = {
          seq: after,
          kind,
          memberId: incoming.memberId,
          dealIndex: now.dealIndex,
          at: new Date().toISOString(),
        }
        for (const listener of listeners) listener(event, now)
      }, index * gap)
      echoTimers.add(timer)
    })
  }

  const clearEchoes = () => {
    for (const timer of echoTimers) clearTimeout(timer)
    echoTimers.clear()
  }

  const flushSocketTaps = () => {
    socketTimer = null
    const batch = socketTaps
    socketTaps = { yays: 0, nahs: 0 }
    const memberId = state.value?.me?.memberId
    if (batch.yays + batch.nahs > 0 && memberId) channel?.sendTaps({ memberId, ...batch })
  }

  const shareTap = (stance: 'YAY' | 'NAH') => {
    if (!live) return
    socketTaps =
      stance === 'YAY'
        ? { ...socketTaps, yays: Math.min(MAX_SOCKET_TAPS, socketTaps.yays + 1) }
        : { ...socketTaps, nahs: Math.min(MAX_SOCKET_TAPS, socketTaps.nahs + 1) }
    socketTimer ??= setTimeout(flushSocketTaps, SOCKET_TAP_MS)
  }

  const tap = (stance: 'YAY' | 'NAH') => {
    shareTap(stance)
    const last = tapQueue.at(-1)
    tapQueue =
      last && last.stance === stance && last.taps < MAX_TAPS_PER_SEND
        ? [...tapQueue.slice(0, -1), { stance, taps: last.taps + 1 }]
        : [...tapQueue, { stance, taps: 1 }]
    if (!tapTimer && !sendingTaps) tapTimer = setTimeout(() => void flushTaps(), tapDelay())
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible' && code.value) void poll()
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)

  const dispose = () => {
    stop()
    if (tapTimer) clearTimeout(tapTimer)
    if (socketTimer) clearTimeout(socketTimer)
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
