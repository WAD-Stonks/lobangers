import { vi } from 'vitest'

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
