import { confirmAdminIdentity, onAdminIdentityEnd } from '@web/lib/admin-recovery'
import { authClient } from '@web/lib/auth-client'
import { ref, shallowRef } from 'vue'

// Exact SPA destinations only. Query strings, fragments and arbitrary origins are not redirects.
export const safeAuthDestination = (destination: string, origin: string): string => {
  const allowed = [
    '/',
    '/getting-started',
    '/admin',
    '/admin/accounts',
    '/admin/ingestion',
    '/admin/deals',
    '/admin/catalogue',
    '/admin/moderation',
    '/admin/audit',
  ]
  return new URL(allowed.includes(destination) ? destination : '/', origin).href
}

// Account login owns its same-site redirect query; admin callers still strip it by default.
export const consumeOAuthError = (preserveAccountRedirect = false): string => {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('error')
  const known = [
    'access_denied',
    'EMAIL_NOT_VERIFIED',
    'email_not_verified',
    'unable_to_link_account',
    'oauth_callback_error',
    'state_mismatch',
  ]
  const keys = [
    'error',
    'error_description',
    'errorDescription',
    'error_code',
    'code',
    'state',
    'token',
    'access_token',
    'id_token',
    'redirect',
    'callbackURL',
  ]
  const dirty = keys.some((key) => url.searchParams.has(key))
  for (const key of keys) {
    if (key === 'redirect' && preserveAccountRedirect) continue
    url.searchParams.delete(key)
  }
  if (dirty)
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  return code && known.includes(code)
    ? 'Google sign-in could not be completed. Try again or use another sign-in method.'
    : ''
}

// Local native session presentation only, never an authorization or token store.
export const createAdminSession = (
  events: {
    closing: () => void
    signedOut: () => void
    accessReload: () => void
  },
  renew?: () => Promise<void>,
) => {
  const session = shallowRef<typeof authClient.$Infer.Session | null>(null)
  const loading = ref(false)
  const pending = ref(false)
  const uncertain = ref(false)
  const accessRequired = ref(false)
  const notice = ref('')
  let generation = 0
  let alive = true
  let observing = false
  let confirmingAbsence = false
  const unsubscribe = onAdminIdentityEnd(() => {
    if (observing && confirmingAbsence) return
    if (!observing) generation++
    loading.value = false
    pending.value = false
    uncertain.value = false
    session.value = null
    accessRequired.value = true
    events.closing()
  })
  const confirm = (identity: typeof session.value) => {
    observing = true
    confirmingAbsence = identity === null
    try {
      confirmAdminIdentity(identity)
    } finally {
      observing = false
      confirmingAbsence = false
    }
  }
  const refresh = async () => {
    if (!alive || pending.value) return
    const current = ++generation
    loading.value = true
    session.value = null
    try {
      // The native atom handles read-only GET -> trusted POST renewal. Its data
      // never authorizes access; keep renewal inside this same generation fence.
      if (renew) {
        await renew()
        if (!alive || current !== generation) return
      }
      const result = await authClient.getSession({ query: { disableCookieCache: true } })
      if (!alive || current !== generation) return
      if (result.error || !result.data?.user) {
        events.closing()
        if (result.error) accessRequired.value = true
        notice.value = result.error
          ? 'The current session could not be confirmed. Access remains closed.'
          : 'No active session was found.'
        // Confirmed anonymous is distinct from an unknown/failed session probe.
        // Native renewal can finish after the page probe; restore its sign-in UI.
        if (!result.error) {
          confirm(null)
          uncertain.value = false
          accessRequired.value = false
          events.signedOut()
        }
      } else {
        confirm(result.data)
        session.value = result.data
        if (uncertain.value)
          notice.value =
            'Your session is still active. Access remains closed until you deliberately reload access.'
        else
          notice.value = accessRequired.value
            ? 'Session confirmed. Deliberately reload access to check current server permissions. No action was replayed.'
            : ''
      }
    } catch {
      if (alive && current === generation) {
        events.closing()
        accessRequired.value = true
        notice.value = 'The current session could not be confirmed. Access remains closed.'
      }
    } finally {
      if (alive && current === generation) loading.value = false
    }
  }
  const signOut = async () => {
    if (!alive || pending.value) return
    const current = ++generation
    pending.value = true
    loading.value = false
    session.value = null
    notice.value = ''
    uncertain.value = false
    events.closing() // Must clear page evidence synchronously BEFORE invoking the native SDK.
    try {
      const result = await authClient.signOut()
      if (!alive || current !== generation) return
      if (result.error || result.data?.success !== true) throw new Error('Unconfirmed')
      confirm(null)
      accessRequired.value = false
      notice.value = 'Signed out.'
      events.signedOut()
    } catch {
      if (alive && current === generation) {
        uncertain.value = true
        notice.value =
          'Server sign-out could not be confirmed. Access remains closed. Retry sign-out or recheck your session.'
      }
    } finally {
      if (alive && current === generation) pending.value = false
    }
  }
  const requestAccessReload = () => {
    if (
      alive &&
      (uncertain.value || accessRequired.value) &&
      session.value &&
      !pending.value &&
      !loading.value
    )
      events.accessReload()
  }
  const dispose = () => {
    alive = false
    unsubscribe()
    generation++
    session.value = null
  }
  return {
    session,
    loading,
    pending,
    uncertain,
    accessRequired,
    notice,
    refresh,
    signOut,
    requestAccessReload,
    dispose,
  }
}

// D2 may use this fence around protected reads and mutation follow-ups.
export const createAdminReadFence = () => {
  let generation = 0
  let alive = true
  return {
    begin: () => ++generation,
    current: (ticket: number) => alive && ticket === generation,
    invalidate: () => {
      generation++
    },
    dispose: () => {
      alive = false
      generation++
    },
  }
}
