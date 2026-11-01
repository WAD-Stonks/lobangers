import { authClient } from '@web/lib/auth-client'
import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    /** Visitor must be signed in. */
    requiresAuth?: boolean
    /** Signed-in users are bounced away (e.g. the login page). */
    guestOnly?: boolean
    /** If set, the signed-in user's role must be one of these. */
    roles?: readonly string[]
  }
}

// Only same-site paths: blocks https://evil.example and //evil.example open redirects.
export const safeRedirect = (value: unknown, fallback = '/'): string =>
  typeof value === 'string' &&
  value.startsWith('/') &&
  !value.startsWith('//') &&
  !value.includes('\\')
    ? value
    : fallback

// UX ONLY. The browser can be tampered with; the API (protectedProcedure and the
// database-backed role checks) is what actually enforces access.
export const authGuard = async (
  to: RouteLocationNormalized,
  from?: RouteLocationNormalized,
): Promise<boolean | RouteLocationRaw> => {
  const { requiresAuth, guestOnly, roles } = to.meta
  const isHome = to.name === 'landing' || to.path === '/'
  if (!requiresAuth && !guestOnly && !roles && !isHome) return true

  let session: Awaited<ReturnType<typeof authClient.getSession>>['data'] = null
  try {
    session = (await authClient.getSession()).data
  } catch {
    // Network failure: treat as signed out; the API will still reject real calls.
  }

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
  return true
}
