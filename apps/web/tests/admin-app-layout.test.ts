import { AppShell } from '@broke-oclock/ui'
import { flushPromises, mount } from '@vue/test-utils'
import App from '@web/App.vue'
import AdminShell from '@web/components/admin/AdminShell.vue'
import NotFoundPage from '@web/pages/NotFoundPage.vue'
import routes from '@web/router/routes'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

// Keep the real AppShell: its main landmark belongs to the public branch, not the 404 page.
vi.mock('@broke-oclock/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@broke-oclock/ui')>()
  const { defineComponent } = await import('vue')
  return { ...actual, BApp: defineComponent({ template: '<div><slot /></div>' }) }
})

// Synthetic absent identity; real route pages and their AdminShell remain mounted.
vi.mock('@web/lib/auth-client', () => ({
  authClient: { getSession: vi.fn(async () => ({ data: null, error: null })) },
}))

const fetch = vi.fn(() => {
  throw new Error('Layout tests must not make network requests')
})
beforeEach(() => {
  fetch.mockClear()
  vi.stubGlobal('fetch', fetch)
})
afterEach(() => {
  vi.unstubAllGlobals()
  expect(fetch).not.toHaveBeenCalled()
})

it('separates the admin root from unchanged public shell, landing and map branches', async () => {
  const admin = defineComponent({
    components: { AdminShell },
    template: '<AdminShell title="Accounts"><p>Admin records</p></AdminShell>',
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/accounts', component: admin },
      { path: '/public', component: { template: '<p>Public page</p>' } },
      { path: '/', meta: { layout: 'landing' }, component: { template: '<p>Landing</p>' } },
      {
        path: '/browse',
        meta: { layout: 'canvas' },
        component: { template: '<main>Map canvas</main>' },
      },
    ],
  })
  await router.push('/admin/accounts')
  const wrapper = mount(App, {
    global: {
      plugins: [router],
      stubs: {
        SiteHeader: { template: '<header data-testid="consumer-header" />' },
        SplashScreen: { template: '<div data-testid="splash" />' },
        AdminSessionControls: true,
      },
    },
  })
  expect(wrapper.find('[data-testid="consumer-header"]').exists()).toBe(false)
  expect(wrapper.findComponent(AppShell).exists()).toBe(false)
  expect(wrapper.findAll('main')).toHaveLength(1)
  expect(wrapper.text()).toContain('Admin records')
  await router.push('/public')
  await flushPromises()
  expect(wrapper.find('[data-testid="consumer-header"]').exists()).toBe(true)
  expect(wrapper.findComponent(AppShell).exists()).toBe(true)
  await router.push('/')
  await flushPromises()
  expect(wrapper.get('main').classes()).toContain('landing-canvas')
  expect(wrapper.find('[data-testid="consumer-header"]').exists()).toBe(false)
  await router.push('/browse')
  await flushPromises()
  expect(wrapper.find('[data-testid="splash"]').exists()).toBe(true)
  expect(wrapper.findAll('main')).toHaveLength(1)
  expect(wrapper.find('[data-testid="consumer-header"]').exists()).toBe(false)
  wrapper.unmount()
})

it.each(['/not-real', '/admin/not-real', '/admin/accounts/not-real'])(
  'keeps the real catchall inside one public main on direct entry and admin roundtrip: %s',
  async (path) => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    await router.push(path)
    const wrapper = mount(App, {
      global: {
        plugins: [router],
        // None of these owns a main or decides which route/page/shell renders.
        stubs: {
          SiteHeader: { template: '<header data-testid="consumer-header" />' },
          AdminSessionControls: true,
          SharedSignIn: true,
        },
      },
    })
    const expectPublic404 = () => {
      expect(router.currentRoute.value.name).toBe('not-found')
      expect(wrapper.findComponent(NotFoundPage).exists()).toBe(true)
      expect(wrapper.get('h1').text()).toBe('Page not found')
      expect(wrapper.findAll('main')).toHaveLength(1)
      expect(wrapper.getComponent(AppShell).get('main').classes()).toContain('container')
      expect(wrapper.get('main').get('#not-found-title').text()).toBe('Page not found')
      expect(wrapper.find('[data-testid="consumer-header"]').exists()).toBe(true)
      expect(wrapper.find('.admin-layout').exists()).toBe(false)
      expect(wrapper.findComponent(AdminShell).exists()).toBe(false)
      expect(wrapper.get('a[href="/"]').text()).toBe('Return home')
    }
    try {
      await flushPromises()
      expectPublic404()
      await router.push('/admin/accounts')
      await flushPromises()
      expect(wrapper.findAll('main')).toHaveLength(1)
      expect(wrapper.findComponent(AdminShell).exists()).toBe(true)
      expect(wrapper.findComponent(AppShell).exists()).toBe(false)
      await router.push(path)
      await flushPromises()
      expectPublic404()
    } finally {
      wrapper.unmount()
    }
  },
)

// Characterization: all seven original admin page components own their real shell/main.
it.each([
  ['/admin', 'Admin overview'],
  ['/admin/deals', 'Deals operations'],
  ['/admin/catalogue', 'Merchants & outlets'],
  ['/admin/moderation', 'Reports & comment moderation'],
  ['/admin/accounts', 'Accounts'],
  ['/admin/ingestion', 'Ingestion admin'],
  ['/admin/audit', 'Audit investigation'],
  ['/admin/accounts/?requestStatus=PENDING#merchant-requests', 'Accounts'],
])('preserves the real admin page shell at %s', async (path, title) => {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  const wrapper = mount(App, {
    global: {
      plugins: [router],
      stubs: {
        SiteHeader: { template: '<header data-testid="consumer-header" />' },
        AdminSessionControls: true,
        SharedSignIn: true,
        AdminSignIn: true,
      },
    },
  })
  try {
    await flushPromises()
    expect(wrapper.findComponent(AdminShell).exists()).toBe(true)
    expect(wrapper.find('.admin-layout').exists()).toBe(true)
    expect(wrapper.findAll('main')).toHaveLength(1)
    expect(wrapper.get('main').get('h1').text()).toBe(title)
    expect(wrapper.findComponent(AppShell).exists()).toBe(false)
    expect(wrapper.find('[data-testid="consumer-header"]').exists()).toBe(false)
    expect(wrapper.findComponent(NotFoundPage).exists()).toBe(false)
  } finally {
    wrapper.unmount()
  }
})
