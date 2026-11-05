import { authClient } from '@web/lib/auth-client'

export type CachedSession = NonNullable<Awaited<ReturnType<typeof authClient.getSession>>['data']>

export const SESSION_CACHE_MS = 60_000

type Entry = { readonly promise: Promise<CachedSession | null>; readonly until: number }

type Options = {
  readonly fetchSession: () => Promise<CachedSession | null>
  readonly onInvalidate: (clear: () => void) => void
  readonly now?: () => number
  readonly ttlMs?: number
}

const expiryOf = (session: CachedSession | null): number => {
  const raw = session?.session.expiresAt
  const at = raw === undefined ? Number.NaN : new Date(raw).getTime()
  return Number.isNaN(at) ? Number.POSITIVE_INFINITY : at
}

export const createSessionCache = ({
  fetchSession,
  onInvalidate,
  now = Date.now,
  ttlMs = SESSION_CACHE_MS,
}: Options) => {
  let entry: Entry | null = null
  let listening = false
  const clear = () => {
    entry = null
  }

  const get = (): Promise<CachedSession | null> => {
    if (!listening) {
      listening = true
      onInvalidate(clear)
    }
    if (entry && now() < entry.until) return entry.promise

    const promise = fetchSession()
    const pending: Entry = { promise, until: now() + ttlMs }
    entry = pending
    promise.then(
      (session) => {
        if (entry === pending)
          entry = { promise, until: Math.min(pending.until, expiryOf(session)) }
      },
      () => {
        if (entry === pending) entry = null
      },
    )
    return promise
  }

  return { get, clear }
}

export const routerSession = createSessionCache({
  fetchSession: async () => {
    const result = await authClient.getSession()
    if (result.error) throw new Error(result.error.message ?? 'Session lookup failed')
    return result.data
  },
  onInvalidate: (clear) => authClient.$store.listen('$sessionSignal', clear),
})
