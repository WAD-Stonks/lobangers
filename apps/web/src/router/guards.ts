import { type CachedSession, routerSession } from '@web/lib/session-cache'
import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    guestOnly?: boolean
    roles?: readonly string[]
    roleRedirects?: Readonly<Record<string, string>>
  }
}

export const safeRedirect = (value: unknown, fallback = '/'): string =>
  typeof value === 'string' &&
  value.startsWith('/') &&
  !value.startsWith('//') &&
  !value.includes('\\') &&
  ![...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    ? value
    : fallback

export const afterLoginPath = (redirect: unknown): string => {
  const destination = safeRedirect(redirect, '/deals')
  return destination.startsWith('/squad/') ? destination : '/deals'
}

export const authGuard = async (
  to: RouteLocationNormalized,
  from?: RouteLocationNormalized,
): Promise<boolean | RouteLocationRaw> => {
  const { requiresAuth, guestOnly, roles } = to.meta
  const isHome = to.name === 'landing' || to.path === '/'
  if (!requiresAuth && !guestOnly && !roles && !isHome) return true

  let session: CachedSession | null = null
  try {
    session = await routerSession.get()
  } catch {}

  if (isHome) return session ? '/deals' : true
  const needsPrompt =
    !session &&
    (to.name === 'saved' ||
      (from?.matched?.length && from.meta.layout !== 'auth' && (requiresAuth || roles)))
  if (needsPrompt) {
    return {
      name: 'auth-required',
      query: {
        ...from?.query,
        ...to.query,
        tab: requiresAuth || roles ? String(to.name) : 'profile',
        redirect: requiresAuth || roles ? to.fullPath : to.query.redirect,
      },
    }
  }
  if (guestOnly) {
    if (session)
      return to.path === '/login' || to.path === '/register' || to.meta.layout === 'auth'
        ? '/deals'
        : safeRedirect(to.query.redirect, '/deals')
    if (to.name === 'login' || to.name === 'register') {
      return { name: to.name === 'login' ? 'sign-in' : 'sign-up', query: to.query, replace: true }
    }
    return true
  }
  if (!session) return { name: 'sign-in', query: { redirect: to.fullPath } }
  if (roles && !roles.includes(session.user.role)) return '/'
  const elsewhere = to.meta.roleRedirects?.[session.user.role]
  if (elsewhere) return elsewhere
  return true
}
