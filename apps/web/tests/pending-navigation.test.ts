import { pendingNavigationFor, trackPendingNavigation } from '@web/router/pending-navigation'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

const Blank = defineComponent({ render: () => null })

const build = (guard: () => Promise<boolean> | boolean) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Blank },
      { path: '/slow', component: Blank },
      { path: '/fast', component: Blank },
    ],
  })
  const pending = trackPendingNavigation(router)
  router.beforeEach((to) => (to.path === '/slow' ? guard() : true))
  return { router, pending }
}

const deferred = () => {
  let resolve: (value: boolean) => void = () => {}
  const promise = new Promise<boolean>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('trackPendingNavigation', () => {
  let router: Router | null = null

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    router = null
  })

  it('holds the target while a slow guard is still deciding', async () => {
    const gate = deferred()
    const built = build(() => gate.promise)
    router = built.router
    await router.push('/')
    expect(built.pending.value).toBeNull()

    const navigation = router.push('/slow')
    await vi.advanceTimersByTimeAsync(0)
    expect(built.pending.value?.path).toBe('/slow')

    gate.resolve(true)
    await navigation
    expect(built.pending.value).toBeNull()
  })

  it('clears once a guard cancels the navigation', async () => {
    const gate = deferred()
    const built = build(() => gate.promise)
    router = built.router
    await router.push('/')

    const navigation = router.push('/slow')
    await vi.advanceTimersByTimeAsync(0)
    gate.resolve(false)
    await navigation
    expect(built.pending.value).toBeNull()
  })

  it('clears when the guard throws', async () => {
    const built = build(() => Promise.reject(new Error('offline')))
    router = built.router
    await router.push('/')

    await router.push('/slow').catch(() => {})
    expect(built.pending.value).toBeNull()
  })

  it('is found again by router, and an untracked router is never pending', () => {
    const built = build(() => true)
    router = built.router
    expect(pendingNavigationFor(router)).toBe(built.pending)
    const other = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: Blank }],
    })
    expect(pendingNavigationFor(other).value).toBeNull()
  })

  it('ends empty after a quick navigation', async () => {
    const built = build(() => true)
    router = built.router
    await router.push('/')
    await router.push('/fast')
    expect(built.pending.value).toBeNull()
  })
})
