import { authGuard } from '@web/router/guards'
import routes from '@web/router/routes'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

// Synthetic identity boundary; the actual route assembly and guard run unchanged.
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@web/lib/auth-client', () => ({ authClient: { getSession } }))

beforeEach(() => getSession.mockReset())

function createSubmissionRouter() {
  const router = createRouter({ history: createMemoryHistory(), routes })
  router.beforeEach(authGuard)
  return router
}

describe('protected local submission route', () => {
  it('keeps the landing page and browse map alongside protected submission', () => {
    const router = createSubmissionRouter()
    expect(router.resolve('/').name).toBe('landing')
    expect(router.resolve('/').meta.layout).toBe('landing')
    expect(router.resolve('/browse').name).toBe('browse')
    expect(router.resolve('/browse').meta.layout).toBe('canvas')
    expect(router.resolve('/add').name).toBe('submit-deal')
    expect(router.resolve('/add').meta.requiresAuth).toBe(true)
    expect(router.resolve('/submissionform').name).toBe('not-found')
  })

  it('redirects a signed-out submit visitor to login with the exact destination', async () => {
    getSession.mockResolvedValue({ data: null })
    const router = createSubmissionRouter()
    await router.push('/add')
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/add')
  })

  it('lets a signed-in visitor reach the same protected prototype', async () => {
    getSession.mockResolvedValue({ data: { user: { role: 'USER' } } })
    const router = createSubmissionRouter()
    await router.push('/add')
    expect(router.currentRoute.value.name).toBe('submit-deal')
    expect(router.currentRoute.value.meta.requiresAuth).toBe(true)
  })

  it('sends the old /submit-deal address to the same form', async () => {
    getSession.mockResolvedValue({ data: { user: { role: 'USER' } } })
    const router = createSubmissionRouter()
    await router.push('/submit-deal')
    expect(router.currentRoute.value.path).toBe('/add')
    expect(router.currentRoute.value.name).toBe('submit-deal')
  })
})
