import type { SquadEvent, SquadState } from '@broke-oclock/contracts/squad'
import type { ChannelHandlers } from '@web/modules/squad/room-channel'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The room composable over a fake live channel: pushed taps play once and at once, a burst
// of pushes becomes one state read, and the heartbeat slows down only while the channel is live.

const sync = vi.fn()
const vote = vi.fn()
vi.mock('@web/lib/api-client', () => ({
  ApiClientError: class ApiClientError extends Error {
    constructor(
      readonly code: string,
      readonly status: number,
      message: string,
    ) {
      super(message)
    }
  },
  api: {
    squad: {
      sync: (...args: unknown[]) => sync(...args),
      vote: (...args: unknown[]) => vote(...args),
    },
  },
}))
vi.mock('@web/modules/squad/room-channel', () => ({ openRoomChannel: vi.fn() }))

const { ApiClientError } = await import('@web/lib/api-client')
const {
  createSquadRoom,
  HEARTBEAT_MS,
  LIVE_TAP_BATCH_MS,
  POLL_MS,
  REFRESH_AFTER_PUSH_MS,
  SOCKET_TAP_MS,
  withBallot,
} = await import('@web/modules/squad/use-squad-room')

const ME = 'a'.repeat(24)
const FRIEND = 'b'.repeat(24)
const state = { status: 'LIVE', me: { memberId: ME, kicked: false } } as unknown as SquadState
const tap = (seq: number, memberId = FRIEND): SquadEvent => ({
  seq,
  kind: 'YAY',
  memberId,
  dealIndex: 0,
  at: new Date(0).toISOString(),
})
const reply = (nextSeq: number, events: SquadEvent[] = []) => ({ state, events, nextSeq })

const openWithChannel = async () => {
  let handlers: ChannelHandlers | null = null
  const close = vi.fn()
  const sendTaps = vi.fn(() => true)
  const room = createSquadRoom((_code, next) => {
    handlers = next
    return { close, sendTaps }
  })
  const played: number[] = []
  room.onEffect((event) => played.push(event.seq))
  room.open('KOPI')
  await vi.advanceTimersByTimeAsync(0)
  if (!handlers) throw new Error('channel was not opened')
  return { room, played, close, sendTaps, channel: handlers as ChannelHandlers }
}

beforeEach(() => {
  vi.useFakeTimers()
  sync.mockReset()
  vote.mockReset()
  sessionStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('live squad room', () => {
  it('plays pushed taps at once, skips my own, and never replays them from sync', async () => {
    sync.mockResolvedValueOnce(reply(4))
    const { room, played, channel } = await openWithChannel()
    channel.onEvents([tap(5), tap(6, ME), tap(7)])
    expect(played).toEqual([5, 7])
    sync.mockResolvedValueOnce(reply(8, [tap(7), tap(8)]))
    await vi.advanceTimersByTimeAsync(REFRESH_AFTER_PUSH_MS)
    expect(sync).toHaveBeenLastCalledWith('KOPI', 7)
    expect(played).toEqual([5, 7, 8])
    room.dispose()
  })

  it('turns a burst of pushes into one state read', async () => {
    sync.mockResolvedValue(reply(1))
    const { room, channel } = await openWithChannel()
    const before = sync.mock.calls.length
    for (let seq = 2; seq < 12; seq += 1) channel.onEvents([tap(seq)])
    await vi.advanceTimersByTimeAsync(REFRESH_AFTER_PUSH_MS)
    expect(sync.mock.calls.length - before).toBe(1)
    room.dispose()
  })

  it('polls quickly until the channel is live, then only beats every 15 seconds', async () => {
    sync.mockResolvedValue(reply(1))
    const { room, channel, close } = await openWithChannel()
    const calls = () => sync.mock.calls.length
    const start = calls()
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(calls()).toBe(start + 1)
    channel.onLiveChange(true)
    await vi.advanceTimersByTimeAsync(0)
    const live = calls()
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS - 1)
    expect(calls()).toBe(live)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls()).toBe(live + 1)
    room.forget()
    expect(close).toHaveBeenCalled()
    room.dispose()
  })

  it("sends a spammer's taps one batch at a time, keeping every tap and the order", async () => {
    sync.mockResolvedValue(reply(1))
    const { room } = await openWithChannel()
    let inFlight = 0
    let most = 0
    const answers: (() => void)[] = []
    vote.mockImplementation(
      () =>
        new Promise((resolve) => {
          inFlight += 1
          most = Math.max(most, inFlight)
          answers.push(() => {
            inFlight -= 1
            resolve(state)
          })
        }),
    )
    for (let index = 0; index < 3; index += 1) room.tap('YAY')
    await vi.advanceTimersByTimeAsync(300)
    for (let index = 0; index < 4; index += 1) room.tap('NAH')
    room.tap('YAY')
    while (answers.length > 0) {
      answers.shift()?.()
      await vi.advanceTimersByTimeAsync(300)
    }
    expect(most).toBe(1)
    expect(vote.mock.calls.map(([, batch]) => batch)).toEqual([
      { stance: 'YAY', taps: 3 },
      { stance: 'NAH', taps: 4 },
      { stance: 'YAY', taps: 1 },
    ])
    expect(room.error.value).toBe('')
    room.dispose()
  })

  it('drops leftover taps quietly once voting has closed', async () => {
    sync.mockResolvedValue(reply(1))
    const { room } = await openWithChannel()
    vote.mockRejectedValue(
      new ApiClientError('PRECONDITION_FAILED', 412, 'Voting on this deal has finished'),
    )
    room.tap('YAY')
    await vi.advanceTimersByTimeAsync(300)
    expect(room.error.value).toBe('')
    room.dispose()
  })

  it('shares taps over the socket each tick and sends the API one batch a second', async () => {
    sync.mockResolvedValue(reply(1))
    vote.mockResolvedValue(state)
    const { room, channel, sendTaps } = await openWithChannel()
    channel.onLiveChange(true)
    await vi.advanceTimersByTimeAsync(0)
    for (let index = 0; index < 5; index += 1) room.tap('YAY')
    room.tap('NAH')
    await vi.advanceTimersByTimeAsync(SOCKET_TAP_MS)
    expect(sendTaps).toHaveBeenCalledTimes(1)
    expect(sendTaps).toHaveBeenLastCalledWith({ memberId: ME, yays: 5, nahs: 1 })
    expect(vote).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(LIVE_TAP_BATCH_MS - SOCKET_TAP_MS)
    expect(vote).toHaveBeenCalledTimes(1)
    expect(vote).toHaveBeenLastCalledWith('KOPI', { stance: 'YAY', taps: 5 })
    await vi.advanceTimersByTimeAsync(LIVE_TAP_BATCH_MS - 1)
    expect(vote).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(vote).toHaveBeenLastCalledWith('KOPI', { stance: 'NAH', taps: 1 })
    room.dispose()
  })

  it('echoes a spammer as a few staggered effects on everyone else, not on my screen', async () => {
    sync.mockResolvedValue(reply(1))
    const { room, channel } = await openWithChannel()
    const kinds: string[] = []
    room.onEffect((event) => kinds.push(event.kind))
    channel.onTaps({ memberId: FRIEND, yays: 20, nahs: 1 })
    channel.onTaps({ memberId: ME, yays: 4, nahs: 0 })
    await vi.advanceTimersByTimeAsync(0)
    expect(kinds).toEqual(['YAY'])
    await vi.advanceTimersByTimeAsync(SOCKET_TAP_MS / 4)
    expect(kinds).toEqual(['YAY', 'YAY'])
    await vi.advanceTimersByTimeAsync(SOCKET_TAP_MS)
    expect(kinds).toEqual(['YAY', 'YAY', 'YAY', 'NAH'])
    channel.onTaps({ memberId: FRIEND, yays: 2, nahs: 0 })
    await vi.advanceTimersByTimeAsync(SOCKET_TAP_MS)
    expect(kinds).toHaveLength(5)
    expect(sync).toHaveBeenCalledTimes(1)
    room.dispose()
  })
})

describe('withBallot', () => {
  const member = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    stance: null,
    yays: 0,
    spectator: false,
    away: false,
    ...extra,
  })
  const voting = {
    status: 'LIVE',
    phase: 'VOTING',
    members: [member(ME, { stance: 'YAY', yays: 2 }), member(FRIEND), member('c'.repeat(24))],
    tally: { voters: 3, yesPeople: 1, voted: 1, again: 0, next: 0 },
  } as unknown as SquadState

  it('moves the tally with a pushed ballot, no room read needed', () => {
    const next = withBallot(voting, { memberId: FRIEND, stance: 'YAY', yays: 7 })
    expect(next.tally).toMatchObject({ yesPeople: 2, voted: 2 })
    expect(next.members[1]).toMatchObject({ stance: 'YAY', yays: 7 })
    expect(voting.tally.yesPeople).toBe(1)
  })

  it('leaves a room that has moved past voting alone', () => {
    const deciding = { ...voting, phase: 'DECIDING' } as SquadState
    expect(withBallot(deciding, { memberId: FRIEND, stance: 'YAY', yays: 1 })).toBe(deciding)
  })
})
