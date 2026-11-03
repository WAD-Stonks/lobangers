import { parseConfig } from '@api/config'
import { publishEvents, type SquadPublisher, setSquadPublisher } from '@api/modules/squad/realtime'
import type { SquadEvent } from '@broke-oclock/contracts/squad'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The live channel boundary: Pusher settings are all-or-nothing, and a committed write pushes
// its events per room without ever failing the write. Keys are SYNTHETIC.

const environment = {
  BETTER_AUTH_SECRET: 'unit-test-only-secret-not-a-real-credential',
  DATABASE_URL: 'mongodb://127.0.0.1:27017/unit_test?replicaSet=rs0',
}
const pusherEnvironment = {
  PUSHER_APP_ID: '1234567',
  PUSHER_KEY: 'syntheticpublickey01',
  PUSHER_SECRET: 'syntheticsecret0001',
  PUSHER_CLUSTER: 'ap1',
}

const event = (seq: number, kind: SquadEvent['kind'] = 'YAY'): SquadEvent => ({
  seq,
  kind,
  memberId: null,
  dealIndex: 0,
  at: new Date(0).toISOString(),
})

const recorder = (trigger: SquadPublisher['trigger'] = async () => undefined) => {
  const calls: Parameters<SquadPublisher['trigger']>[] = []
  const publisher: SquadPublisher = {
    trigger: (...args) => {
      calls.push(args)
      return trigger(...args)
    },
    authorizeChannel: () => ({ auth: 'synthetic' }),
  }
  setSquadPublisher(publisher)
  return calls
}

afterEach(() => {
  setSquadPublisher(null)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('squad realtime configuration', () => {
  it('stays off without Pusher settings and on with all four', () => {
    expect(parseConfig(environment).pusher).toBeUndefined()
    expect(parseConfig({ ...environment, ...pusherEnvironment }).pusher).toEqual({
      appId: '1234567',
      key: 'syntheticpublickey01',
      secret: 'syntheticsecret0001',
      cluster: 'ap1',
    })
  })

  it('refuses a partial or malformed Pusher setup', () => {
    expect(() => parseConfig({ ...environment, PUSHER_KEY: 'syntheticpublickey01' })).toThrow(
      /Set all of PUSHER_APP_ID/,
    )
    expect(() =>
      parseConfig({ ...environment, ...pusherEnvironment, PUSHER_APP_ID: 'not-a-number' }),
    ).toThrow('PUSHER_APP_ID must be numeric')
  })
})

describe('publishing room events', () => {
  it('does nothing when no channel is configured', async () => {
    await expect(publishEvents([{ code: 'KOPI', event: event(1) }])).resolves.toBeUndefined()
  })

  it('pushes each room its own events, in order', async () => {
    const calls = recorder()
    await publishEvents([
      { code: 'KOPI', event: event(1) },
      { code: 'MILO', event: event(7, 'NAH') },
      { code: 'KOPI', event: event(2, 'MATCH') },
    ])
    expect(calls).toEqual([
      ['private-squad-KOPI', 'events', { events: [event(1), event(2, 'MATCH')] }],
      ['private-squad-MILO', 'events', { events: [event(7, 'NAH')] }],
    ])
  })

  it('splits a long burst so no push passes the size limit', async () => {
    const calls = recorder()
    await publishEvents(
      Array.from({ length: 120 }, (_, index) => ({ code: 'KOPI', event: event(index + 1) })),
    )
    expect(calls.map(([, , data]) => data.events.length)).toEqual([50, 50, 20])
  })

  it('logs and swallows a failed or hung push', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    recorder(async () => {
      throw new Error('synthetic outage')
    })
    await expect(publishEvents([{ code: 'KOPI', event: event(1) }])).resolves.toBeUndefined()
    vi.useFakeTimers()
    recorder(() => new Promise(() => undefined))
    const pending = publishEvents([{ code: 'KOPI', event: event(2) }])
    await vi.advanceTimersByTimeAsync(2_000)
    await expect(pending).resolves.toBeUndefined()
    expect(logged).toHaveBeenCalledTimes(2)
  })
})
