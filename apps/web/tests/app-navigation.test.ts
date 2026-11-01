import { flushPromises, mount } from '@vue/test-utils'
import App from '@web/App.vue'
import routes from '@web/router/routes'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const rest = vi.hoisted(() => ({ list: vi.fn().mockResolvedValue({ items: [], categories: [] }) }))
vi.mock('@web/lib/api-client', () => ({ api: { deals: { list: rest.list } } }))

// Synthetic signed-out session: these tests cover the shell, not authentication.
vi.mock('@web/lib/auth-client', () => ({
  authClient: { useSession: () => ref({ data: null, isPending: false }), signOut: vi.fn() },
}))

async function mountAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes,
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(App, {
    global: {
      plugins: [router],
      // Leaflet needs a real layout engine; the map component is covered by the browser suite.
      stubs: { DealMap: true },
    },
  })
  return { router, wrapper }
}

afterEach(() => vi.unstubAllGlobals())

describe('starter navigation', () => {
  it('lands on the food discovery landing page', async () => {
    const { wrapper } = await mountAt('/')

    expect(wrapper.find('.landing-canvas').exists()).toBe(true)
    expect(wrapper.get('h1').text()).toContain('Bang for')
    expect(wrapper.find('a[href="/browse"]').exists()).toBe(true)
  })

  it('opens the full-bleed map shell at /browse', async () => {
    const { wrapper } = await mountAt('/browse')

    expect(wrapper.find('[data-testid="map-shell"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="primary-nav"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="panel-toggle"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="split-toggle"]').exists()).toBe(false)
  })

  it.each([
    ['/', false],
    ['/browse', false],
    ['/browse?view=list&discovery=1', false],
    ['/browse?view=list&split=1', false],
    ['/browse?view=map&split=1', true],
    ['/saved?view=map&split=1', false],
    ['/add?view=map&split=1', false],
  ])('shows the loading screen only for split view: %s', async (path, expected) => {
    const { wrapper } = await mountAt(path)
    expect(wrapper.find('[data-testid="splash-screen"]').exists()).toBe(expected)
    wrapper.unmount()
  })

  it.each([[390, false], [834, true]])('skips the split-view loading screen on phones (%spx)', async (width, expected) => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('min-width: 768px') && Number(width) >= 768,
      media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }))
    const { wrapper } = await mountAt('/browse?view=map&split=1')
    expect(wrapper.find('[data-testid="splash-screen"]').exists()).toBe(expected)
    wrapper.unmount()
  })

  it.each(['/', '/deals'])('shows the loading animation when entering the map from %s', async (origin) => {
    const { wrapper, router } = await mountAt(origin)
    expect(wrapper.find('[data-testid="splash-screen"]').exists()).toBe(false)
    await router.push('/browse')
    await flushPromises()
    expect(wrapper.find('[data-testid="splash-screen"]').exists()).toBe(true)
    await router.push('/deals')
    await flushPromises()
    expect(wrapper.find('[data-testid="splash-screen"]').exists()).toBe(false)
    await router.push('/browse')
    await flushPromises()
    expect(wrapper.find('[data-testid="splash-screen"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('does not show the loading animation when switching from Saved to Deals on the visible map', async () => {
    const { wrapper, router } = await mountAt('/saved?view=map&split=1')
    await router.push('/browse?view=map&split=1')
    await flushPromises()
    expect(wrapper.find('[data-testid="splash-screen"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('navigates to all deals from the header', async () => {
    const { router, wrapper } = await mountAt('/browse')

    await wrapper.get('[data-testid="nav-toggle"]').trigger('click')
    await wrapper.get('[data-testid="nav-menu"] a[href="/deals"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/browse')
    expect(router.currentRoute.value.query.view).toBe('list')
  })

  it('renders a useful 404 page for unknown routes', async () => {
    const { wrapper } = await mountAt('/not-a-real-page')

    expect(wrapper.get('h1').text()).toBe('Page not found')
    expect(wrapper.text()).toContain('The page you requested does not exist.')
    expect(wrapper.get('main a[href="/"]').text()).toContain('Return home')
  })
})
