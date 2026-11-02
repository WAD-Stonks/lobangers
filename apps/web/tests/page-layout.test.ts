import { flushPromises, mount } from '@vue/test-utils'
import App from '@web/App.vue'
import routes from '@web/router/routes'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const rest = vi.hoisted(() => ({ list: vi.fn().mockResolvedValue({ items: [], categories: [] }) }))
vi.mock('@web/lib/api-client', () => ({ api: { deals: { list: rest.list } } }))

// Synthetic signed-out session: these tests cover the layout, not authentication.
vi.mock('@web/lib/auth-client', () => ({
  authClient: {
    useSession: () => ref({ data: null, isPending: false }),
    getSession: async () => ({ data: null }),
    signOut: vi.fn(),
  },
}))

let unmount: (() => void) | null = null
const mountAt = async (path: string) => {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(App, { global: { plugins: [router], stubs: { DealMap: true } } })
  unmount = () => wrapper.unmount()
  return { router, wrapper }
}

afterEach(() => {
  unmount?.()
  unmount = null
})

describe('standalone page layout', () => {
  it.each(['/getting-started', '/not-a-real-page'])(
    'puts %s under the All Deals header, not the floating pill',
    async (path) => {
      const { wrapper } = await mountAt(path)
      expect(wrapper.find('[data-testid="page-header"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="primary-nav"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="squad-header-button"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="page-header"] a[href="/"]').exists()).toBe(true)
    },
  )

  it('searches All Deals from the header', async () => {
    const { router, wrapper } = await mountAt('/getting-started')
    await wrapper.get('[data-testid="page-header"] input[type="search"]').setValue('laksa')
    await wrapper.get('[data-testid="page-header"] form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('browse')
    expect(router.currentRoute.value.query).toMatchObject({
      q: 'laksa',
      view: 'list',
      discovery: '1',
    })
  })

  it.each([
    ['/forgot-password', 'Reset your password'],
    ['/reset-password', 'Choose a new password'],
  ])('shows %s in the sign-in layout', async (path, heading) => {
    const { wrapper } = await mountAt(path)
    expect(wrapper.find('[data-testid="standalone-auth"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="page-header"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="primary-nav"]').exists()).toBe(false)
    expect(wrapper.get('h1').text()).toBe(heading)
  })
})
