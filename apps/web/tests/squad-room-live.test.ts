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
const { createSquadRoom, HEARTBEAT_MS, POLL_MS, REFRESH_AFTER_PUSH_MS } = await import(
  '@web/modules/squad/use-squad-room'
)

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
  const room = createSquadRoom((_code, next) => {
    handlers = next
    return { close }
  })
  const played: number[] = []
  room.onEffect((event) => played.push(event.seq))
  room.open('KOPI')
  await vi.advanceTimersByTimeAsync(0)
  if (!handlers) throw new Error('channel was not opened')
  return { room, played, close, channel: handlers as ChannelHandlers }
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
      await vi.advanceTimersByTimeAsync(0)
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
})
