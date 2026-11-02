import { type CachedSession, createSessionCache } from '@web/lib/session-cache'
import { describe, expect, it, vi } from 'vitest'

const MINUTE = 60_000

const sessionUntil = (expiresAt: number | string): CachedSession =>
  ({ user: { role: 'USER' }, session: { expiresAt } }) as unknown as CachedSession

const setup = (fetchSession: () => Promise<CachedSession | null>, ttlMs = MINUTE) => {
  let clock = 0
  let invalidate = () => {}
  const fetch = vi.fn(fetchSession)
  const cache = createSessionCache({
    fetchSession: fetch,
    onInvalidate: (clear) => {
      invalidate = clear
    },
    now: () => clock,
    ttlMs,
  })
  return {
    cache,
    fetch,
    tick: (ms: number) => {
      clock += ms
    },
    signal: () => invalidate(),
  }
}

describe('createSessionCache', () => {
  it('asks the server once and answers repeat checks from memory', async () => {
    const { cache, fetch } = setup(async () => sessionUntil(10 * MINUTE))
    await cache.get()
    await cache.get()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('shares one request between checks made at the same time', async () => {
    const { cache, fetch } = setup(async () => sessionUntil(10 * MINUTE))
    await Promise.all([cache.get(), cache.get()])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('asks again once the cache window passes', async () => {
    const { cache, fetch, tick } = setup(async () => sessionUntil(10 * MINUTE))
    await cache.get()
    tick(MINUTE)
    await cache.get()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('never trusts a session past its own expiry', async () => {
    const { cache, fetch, tick } = setup(async () => sessionUntil(5_000))
    await cache.get()
    tick(5_000)
    await cache.get()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('reads an expiry sent as an ISO string', async () => {
    const { cache, fetch, tick } = setup(async () => sessionUntil(new Date(5_000).toISOString()))
    await cache.get()
    tick(5_000)
    await cache.get()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('forgets the session when auth signals a change (sign in, sign out)', async () => {
    const { cache, fetch, signal } = setup(async () => sessionUntil(10 * MINUTE))
    await cache.get()
    signal()
    await cache.get()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does not keep an answer that arrives after a change signal', async () => {
    let finish: (value: CachedSession | null) => void = () => {}
    const { cache, fetch, signal } = setup(
      () =>
        new Promise((done) => {
          finish = done
        }),
    )
    const first = cache.get()
    signal()
    finish(sessionUntil(10 * MINUTE))
    await first
    void cache.get()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('remembers a signed-out answer for the window too', async () => {
    const { cache, fetch } = setup(async () => null)
    expect(await cache.get()).toBeNull()
    expect(await cache.get()).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failed lookup', async () => {
    const { cache, fetch } = setup(async () => {
      throw new Error('offline')
    })
    await expect(cache.get()).rejects.toThrow('offline')
    await expect(cache.get()).rejects.toThrow('offline')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
