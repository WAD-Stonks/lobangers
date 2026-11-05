import { type Ref, readonly, shallowRef } from 'vue'
import type { RouteLocationNormalized, Router } from 'vue-router'

type PendingNavigation = Readonly<Ref<RouteLocationNormalized | null>>

const tracked = new WeakMap<Router, PendingNavigation>()
const NEVER_PENDING: PendingNavigation = readonly(shallowRef(null))

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

export const pendingNavigationFor = (router: Router): PendingNavigation =>
  tracked.get(router) ?? NEVER_PENDING
