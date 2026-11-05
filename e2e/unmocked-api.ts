import type { Page } from '@playwright/test'

const QUIET: Record<string, () => unknown> = {
  '/api/auth/get-session': () => null,
  '/api/flash-drops/realtime': () => ({ pusher: null }),
  '/api/flash-drops/active': () => ({ serverTime: new Date().toISOString(), items: [] }),
  '/api/flash-drops/codes': () => ({ items: [] }),
  '/api/squad/realtime': () => ({ pusher: null }),
  '/api/presence': () => ({ serverTime: new Date().toISOString(), items: [], me: null }),
}

export const failUnmockedApi = (page: Page) =>
  page.route('**/api/**', (route) => {
    const request = route.request()
    const quiet = request.method() === 'GET' && QUIET[new URL(request.url()).pathname]
    if (quiet) return route.fulfill({ json: quiet() })
    return route.fulfill({
      status: 503,
      json: { error: { code: 'SERVICE_UNAVAILABLE', message: 'Not mocked in this spec' } },
    })
  })
