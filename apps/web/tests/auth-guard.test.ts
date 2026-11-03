import { authGuard, safeRedirect } from '@web/router/guards'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteLocationNormalized } from 'vue-router'

const getSession = vi.hoisted(() => vi.fn())
vi.mock('@web/lib/auth-client', () => ({ authClient: { getSession } }))

const to = (meta: RouteLocationNormalized['meta'], fullPath = '/me/submissions', query = {}) =>
  ({ meta, fullPath, path: fullPath.split('?')[0], query }) as unknown as RouteLocationNormalized

const signedIn = (role = 'USER') => getSession.mockResolvedValue({ data: { user: { role } } })
const signedOut = () => getSession.mockResolvedValue({ data: null })

describe('authGuard', () => {
  beforeEach(() => {
    getSession.mockReset()
  })

  it('lets public routes through without calling the API', async () => {
    expect(await authGuard(to({}))).toBe(true)
    expect(getSession).not.toHaveBeenCalled()
  })

  it('sends signed-out visitors to login and remembers where they were going', async () => {
    signedOut()
    expect(await authGuard(to({ requiresAuth: true }))).toEqual({
      name: 'sign-in',
      query: { redirect: '/me/submissions' },
    })
  })

  it('treats a failed session lookup as signed out', async () => {
    getSession.mockRejectedValue(new Error('offline'))
    expect(await authGuard(to({ requiresAuth: true }))).toMatchObject({ name: 'sign-in' })
  })

  it('allows signed-in users on protected routes', async () => {
    signedIn()
    expect(await authGuard(to({ requiresAuth: true }))).toBe(true)
  })

  it('blocks users whose role is not listed', async () => {
    signedIn('USER')
    expect(await authGuard(to({ requiresAuth: true, roles: ['ADMIN'] }))).toBe('/')
    signedIn('ADMIN')
    expect(await authGuard(to({ requiresAuth: true, roles: ['ADMIN'] }))).toBe(true)
  })

  it('sends merchants who open Add a deal to their dashboard, and lets everyone else in', async () => {
    const addDeal = to({ requiresAuth: true, roleRedirects: { MERCHANT: '/merchant' } }, '/add')
    signedIn('MERCHANT')
    expect(await authGuard(addDeal)).toBe('/merchant')
    for (const role of ['USER', 'ADMIN']) {
      signedIn(role)
      expect(await authGuard(addDeal)).toBe(true)
    }
  })

  it('bounces signed-in users off guest-only pages', async () => {
    signedIn()
    expect(await authGuard(to({ guestOnly: true }, '/login'))).toBe('/deals')
    expect(await authGuard(to({ guestOnly: true }, '/login', { redirect: '/saved' }))).toBe(
      '/deals',
    )
  })

  it('uses deals as the signed-in home and keeps the landing page for guests', async () => {
    signedIn()
    expect(await authGuard(to({}, '/'))).toBe('/deals')
    signedOut()
    expect(await authGuard(to({}, '/'))).toBe(true)
  })
})

describe('safeRedirect', () => {
  it.each([
    '/\t/evil.example',
    '/\n/evil.example',
    '/\r/evil.example',
    '/safe\u0000',
    '/safe\u007f',
  ])('rejects URL parser control characters in %j without changing the fallback', (destination) => {
    expect(safeRedirect(destination)).toBe('/')
    expect(safeRedirect(destination, '/deals')).toBe('/deals')
  })

  it('keeps same-site paths and rejects everything else', () => {
    expect(safeRedirect('/me/submissions?tab=1')).toBe('/me/submissions?tab=1')
    expect(safeRedirect('//evil.example')).toBe('/')
    expect(safeRedirect('https://evil.example')).toBe('/')
    expect(safeRedirect('/\\evil.example')).toBe('/')
    expect(safeRedirect(undefined)).toBe('/')
  })
})
