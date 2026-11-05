import { mount } from '@vue/test-utils'
import RouteProgress from '@web/components/RouteProgress.vue'
import { trackPendingNavigation } from '@web/router/pending-navigation'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const BAR = '[data-testid="route-progress"]'
const Page = { template: '<div />' }
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const setup = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Page },
      { path: '/me/merchant-access', component: Page },
      { path: '/browse', component: Page, meta: { layout: 'canvas' } },
    ],
  })
  trackPendingNavigation(router)
  await router.push('/')
  let release = () => {}
  router.beforeEach(
    () =>
      new Promise<void>((resolve) => {
        release = () => resolve()
      }),
  )
  const wrapper = mount(RouteProgress, { global: { plugins: [router] } })
  return { router, wrapper, release: () => release() }
}

describe('route progress bar', () => {
  it('shows while a slow page navigation is pending and hides once it lands', async () => {
    const { router, wrapper, release } = await setup()
    const navigation = router.push('/me/merchant-access')
    await wait(20)
    expect(wrapper.find(BAR).exists()).toBe(false)
    await wait(120)
    expect(wrapper.get(BAR).attributes('role')).toBe('progressbar')
    release()
    await navigation
    await nextTick()
    expect(wrapper.find(BAR).exists()).toBe(false)
  })

  it('leaves map destinations to the map shell loader', async () => {
    const { router, wrapper, release } = await setup()
    const navigation = router.push('/browse')
    await wait(150)
    expect(wrapper.find(BAR).exists()).toBe(false)
    release()
    await navigation
  })
})
