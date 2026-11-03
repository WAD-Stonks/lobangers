import { flushPromises, mount } from '@vue/test-utils'
import MapNavigation from '@web/modules/map-shell/MapNavigation.vue'
import DealSection from '@web/modules/merchant/DealSection.vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

// Synthetic auth client: these tests check the layout, not real authentication.
const auth = vi.hoisted(() => ({ useSession: vi.fn() }))
vi.mock('@web/lib/auth-client', () => ({ authClient: { useSession: auth.useSession } }))

beforeEach(() => {
  vi.resetAllMocks()
})

describe('DealSection', () => {
  const mountSection = (props: Record<string, unknown> = {}) =>
    mount(DealSection, {
      props: { title: 'Ended deals', count: 3, ...props },
      slots: { default: () => h('p', { class: 'inside' }, 'Synthetic ended deal') },
    })

  it('shows its title and count, and opens and closes its list', async () => {
    const wrapper = mountSection({ defaultOpen: false })
    const toggle = wrapper.get('button')
    expect(wrapper.get('h2').text()).toContain('Ended deals')
    expect(wrapper.get('.deal-section__count').text()).toBe('3')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    const body = () => wrapper.get('.deal-section__body').element as HTMLElement
    expect(body().style.display).toBe('none')

    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(body().style.display).toBe('')
    expect(toggle.attributes('aria-controls')).toBe(
      wrapper.get('.deal-section__body').attributes('id'),
    )
  })

  it('starts open by default and can be a sub-section', () => {
    const wrapper = mountSection({ level: 'h3' })
    expect(wrapper.find('h3').exists()).toBe(true)
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('true')
  })
})

describe('MapNavigation on a phone', () => {
  const mountBar = async (role: string | null) => {
    auth.useSession.mockReturnValue(
      ref({ data: role ? { user: { id: 'u', name: 'Synthetic', role } } : null }),
    )
    const stub = { render: () => h('div') }
    const router = createRouter({
      history: createMemoryHistory(),
      // The bar links to these routes by name.
      routes: [
        ['/', 'home'],
        ['/deals', 'deals'],
        ['/browse', 'browse'],
        ['/saved', 'saved'],
        ['/add', 'submit-deal'],
        ['/merchant', 'merchant'],
        ['/me/profile', 'profile'],
      ].map(([path, name]) => ({ path, name, component: stub })),
    })
    await router.push('/')
    await router.isReady()
    const wrapper = mount(MapNavigation, {
      props: { bottom: true, panelOpen: true },
      global: { plugins: [router], stubs: { BrandMenu: true } },
    })
    await flushPromises()
    return wrapper
  }

  it('gives merchants a Dashboard button in place of Share', async () => {
    const wrapper = await mountBar('MERCHANT')
    const dashboard = wrapper.get('[data-testid="map-merchant-dashboard"]')
    expect(dashboard.text()).toBe('Dashboard')
    expect(dashboard.attributes('href')).toContain('/merchant')
    expect(wrapper.find('[data-testid="map-share"]').exists()).toBe(false)
  })

  it.each([
    ['a regular account', 'USER'],
    ['an admin', 'ADMIN'],
    ['a signed-out visitor', null],
  ])('keeps Share for %s', async (_, role) => {
    const wrapper = await mountBar(role)
    expect(wrapper.get('[data-testid="map-share"]').text()).toBe('Share')
    expect(wrapper.find('[data-testid="map-merchant-dashboard"]').exists()).toBe(false)
  })
})
