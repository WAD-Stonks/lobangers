import { vi } from 'vitest'

// Tests swap the mocked session freely, without the sign-in events that clear the router's
// session cache, so here the router asks every time. session-cache.test.ts covers the cache.
vi.mock('@web/lib/session-cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@web/lib/session-cache')>()
  const { authClient } = await import('@web/lib/auth-client')
  return {
    ...actual,
    routerSession: {
      get: async () => (await authClient.getSession()).data ?? null,
      clear: () => {},
    },
  }
})
