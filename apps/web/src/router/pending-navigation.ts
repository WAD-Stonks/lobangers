import { type Ref, readonly, shallowRef } from 'vue'
import type { RouteLocationNormalized, Router } from 'vue-router'

type PendingNavigation = Readonly<Ref<RouteLocationNormalized | null>>

const tracked = new WeakMap<Router, PendingNavigation>()
const NEVER_PENDING: PendingNavigation = readonly(shallowRef(null))

// Where the visitor is headed while a guard (the session check) is still deciding, so the
// shell can show a loader at once instead of sitting still. Register before any slow guard:
// guards run in order, and this one must see the navigation before the wait starts.
export const trackPendingNavigation = (router: Router): PendingNavigation => {
  const pending = shallowRef<RouteLocationNormalized | null>(null)
  router.beforeEach((to) => {
    pending.value = to
  })
  router.afterEach(() => {
    pending.value = null
  })
  router.onError(() => {
    pending.value = null
  })
  const view = readonly(pending) as PendingNavigation
  tracked.set(router, view)
  return view
}

// A router nobody tracked (a test router, say) never reports a pending navigation.
export const pendingNavigationFor = (router: Router): PendingNavigation =>
  tracked.get(router) ?? NEVER_PENDING
