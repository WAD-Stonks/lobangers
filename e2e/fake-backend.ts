import type { Page, Route } from '@playwright/test'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { DEALS } from './community-fixtures'

export type Role = 'USER' | 'MERCHANT' | 'MODERATOR' | 'ADMIN'

export const hex = (n: number) => n.toString(16).padStart(24, '0')

const created = new Date(Date.now() - 30 * 86_400_000).toISOString()

export const account = (role: Role, overrides: Record<string, unknown> = {}) => ({
  id: { USER: 'f1', MERCHANT: 'f2', MODERATOR: 'f3', ADMIN: 'f4' }[role].repeat(12),
  name: `Synthetic ${role.toLowerCase()}`,
  email: `synthetic-${role.toLowerCase()}@example.test`,
  emailVerified: true,
  role,
  createdAt: created,
  updatedAt: created,
  ...overrides,
})

export type Account = ReturnType<typeof account>

export type Call = {
  method: string
  path: string
  query: URLSearchParams
  // biome-ignore lint/suspicious/noExplicitAny: fakes read request bodies loosely; the app's own contracts build them.
  body: any
}

export type Reply = { status?: number; json?: unknown; headers?: Record<string, string> }

type Handler = (call: Call) => Reply | undefined | Promise<Reply | undefined>
type Matcher = string | RegExp

export type Backend = {
  user: Account | null
  calls: Call[]
  on: (method: string, path: Matcher, handler: Handler) => void
  callsTo: (method: string, path: Matcher) => Call[]
  signIn: (user: Account) => void
  signOut: () => void
}

const matches = (matcher: Matcher, path: string) =>
  typeof matcher === 'string' ? matcher === path : matcher.test(path)

const sessionFor = (user: Account) => ({
  user,
  session: {
    id: `session-${user.id}`,
    userId: user.id,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  },
})

export const notFound: Reply = {
  status: 404,
  json: { error: { code: 'NOT_FOUND', message: 'Not found' } },
}

export const fakeBackend = async (
  page: Page,
  options: { user?: Account | null; deals?: readonly unknown[] } = {},
): Promise<Backend> => {
  const handlers: { method: string; path: Matcher; handler: Handler }[] = []
  const backend: Backend = {
    user: options.user ?? null,
    calls: [],
    on: (method, path, handler) => {
      handlers.unshift({ method, path, handler })
    },
    callsTo: (method, path) =>
      backend.calls.filter((call) => call.method === method && matches(path, call.path)),
    signIn: (user) => {
      backend.user = user
    },
    signOut: () => {
      backend.user = null
    },
  }
  const signedIn = (): Reply | undefined =>
    backend.user
      ? undefined
      : { status: 401, json: { error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } } }

  backend.on('GET', '/api/auth/get-session', () => ({
    json: backend.user ? sessionFor(backend.user) : null,
  }))
  backend.on('GET', '/api/me', () => {
    const user = backend.user
    return user
      ? { json: { user, session: { expiresAt: sessionFor(user).session.expiresAt } } }
      : signedIn()
  })
  backend.on('GET', '/api/auth-methods', () => ({
    json: { password: true, google: true, emailOtp: true, passwordRecovery: true },
  }))
  backend.on('POST', '/api/auth/sign-out', () => {
    backend.signOut()
    return { json: { success: true } }
  })
  backend.on('GET', '/api/deals', () => ({
    json: { items: options.deals ?? DEALS, categories: ['FOOD', 'DRINKS', 'BAKERY'] },
  }))
  backend.on('GET', /^\/api\/deals\/[0-9a-f]{24}\/community$/, () => ({
    json: {
      alive: 2,
      dead: 0,
      status: 'UNCERTAIN',
      myVote: null,
      myVoteIsRecent: false,
      lastReportedAt: null,
      asOf: new Date().toISOString(),
      commentCount: 0,
      policy: { minAlive: 3, positivePercent: 80, windowHours: 24 },
    },
  }))
  backend.on('GET', /^\/api\/deals\/[0-9a-f]{24}\/comments$/, () => ({
    json: { items: [], nextCursor: null },
  }))
  backend.on(
    'GET',
    '/api/account/bookmarks',
    () => signedIn() ?? { json: { items: [], nextCursor: null } },
  )
  backend.on('GET', '/api/flash-drops/realtime', () => ({ json: { pusher: null } }))
  backend.on('GET', '/api/flash-drops/active', () => ({
    json: { serverTime: new Date().toISOString(), items: [] },
  }))
  backend.on('GET', '/api/flash-drops/codes', () => signedIn() ?? { json: { items: [] } })
  backend.on('GET', '/api/presence', () => ({
    json: { serverTime: new Date().toISOString(), items: [], me: null },
  }))

  await page.route(/basemaps\.cartocdn\.com|onemap\.gov\.sg/, (route) => route.abort())
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    let body: unknown
    try {
      body = request.postDataJSON()
    } catch {
      body = request.postData()
    }
    const call: Call = {
      method: request.method(),
      path: url.pathname,
      query: url.searchParams,
      body,
    }
    backend.calls.push(call)
    for (const { method, path, handler } of handlers) {
      if (method !== call.method || !matches(path, call.path)) continue
      const reply = await handler(call)
      if (!reply) continue
      if (reply.status === 204) return route.fulfill({ status: 204, body: '' })
      return route.fulfill({
        status: reply.status ?? 200,
        json: reply.json,
        headers: reply.headers,
      })
    }
    return route.fulfill({ status: notFound.status, json: notFound.json })
  })
  return backend
}
