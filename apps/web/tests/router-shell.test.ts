import { flushPromises } from '@vue/test-utils'
import routes from '@web/router/routes'
import {
  DEALS_RESPONSE,
  mountShell,
  SIGNED_IN,
  SIGNED_OUT,
} from '@web-tests/support/shell-fixtures'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const rest = vi.hoisted(() => ({
  list: vi.fn(),
  bookmarks: vi.fn(),
  venue: vi.fn(),
  profile: vi.fn(),
  submissions: vi.fn(),
}))
vi.mock('@web/lib/api-client', () => ({
  ApiClientError: class ApiClientError extends Error {},
  api: {
    deals: { list: rest.list },
    venues: { get: rest.venue },
    account: { bookmarks: rest.bookmarks, profile: rest.profile, submissions: rest.submissions },
  },
}))

const auth = vi.hoisted(() => ({ session: { current: null as unknown } }))
vi.mock('@web/lib/auth-client', () => ({
  authClient: {
    useSession: () => ref(auth.session.current),
    getSession: async () => ({ data: (auth.session.current as { data: unknown }).data }),
    signOut: vi.fn(),
  },
}))

let wrappers: { unmount: () => void }[] = []
const mountAt = async (path: string) => {
  const mounted = await mountShell(path)
  wrappers.push(mounted.wrapper)
  return mounted
}

beforeEach(() => {
  auth.session.current = SIGNED_OUT
  rest.list.mockResolvedValue(DEALS_RESPONSE)
  rest.bookmarks.mockResolvedValue({ items: [], nextCursor: null })
  rest.venue.mockReturnValue(new Promise(() => undefined))
  rest.profile.mockReturnValue(new Promise(() => undefined))
  rest.submissions.mockResolvedValue({ items: [], nextCursor: null })
})
afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount()
  wrappers = []
})

const SHELL = '[data-testid="map-shell"]'

describe('map shell routes', () => {
  it('gives only the shell route the full-bleed canvas, and its children inherit it', () => {
    const canvas = routes.filter((route) => route.meta?.layout === 'canvas')
    expect(canvas.map((route) => route.path)).toEqual(['/browse'])
    expect(canvas[0]?.children?.map((child) => child.name)).toEqual([
      'browse',
      'deal',
      'venue',
      'add-deal',
      'login',
      'register',
      'profile',
      'saved',
      'merchant',
    ])
  })

  it.each([
    ['/browse', '3 deals'],
    [`/deals/${'c'.repeat(24)}`, 'Synthetic iced kopi'],
    [`/venues/${'a'.repeat(24)}`, 'Loading venue'],
    ['/login', 'Welcome back'],
    ['/register', 'Create an account'],
  ])('renders %s as a panel inside the shell', async (path, heading) => {
    const { wrapper } = await mountAt(path)
    expect(wrapper.find(SHELL).exists()).toBe(true)
    expect(wrapper.get('[data-testid="shell-panel"] h1').text()).toContain(heading)
    expect(wrapper.find('[data-testid="deal-map"], deal-map-stub').exists()).toBe(true)
  })

  it.each([
    ['/add', 'Add a deal'],
    ['/me/profile', 'Synthetic Student'],
    ['/saved', 'Synthetic Student'],
  ])('renders the signed-in panel %s inside the shell', async (path, heading) => {
    auth.session.current = SIGNED_IN
    const { wrapper } = await mountAt(path)
    expect(wrapper.find(SHELL).exists()).toBe(true)
    expect(wrapper.get('[data-testid="shell-panel"] h1').text()).toBe(heading)
  })

  it('sends /deals to the list mode of the shell, keeping its query', async () => {
    const { router } = await mountAt('/deals?q=kopi')
    expect(router.currentRoute.value.name).toBe('browse')
    expect(router.currentRoute.value.query).toEqual({ q: 'kopi', view: 'list' })
  })

  it('serves the map at /browse and leaves / to the landing page', async () => {
    const { router } = await mountAt('/browse')
    expect(router.currentRoute.value.name).toBe('browse')
    expect(router.resolve('/').name).toBe('landing')
  })

  it('sends guarded children to log in with a redirect back', async () => {
    const { router, wrapper } = await mountAt('/add')
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/add')
    expect(wrapper.get('[data-testid="shell-panel"] h1').text()).toBe('Log in to add a deal')
  })

  it('keeps visitors without the merchant role out of the merchant panel', async () => {
    auth.session.current = SIGNED_IN
    const { router } = await mountAt('/merchant')
    expect(router.currentRoute.value.fullPath).toBe('/')
  })

  it('keeps admin pages outside the shell', async () => {
    const { wrapper } = await mountAt('/getting-started')
    await flushPromises()
    expect(wrapper.find(SHELL).exists()).toBe(false)
    expect(wrapper.find('[data-testid="primary-nav"]').exists()).toBe(true)
  })

  it('renders a useful 404 outside the shell', async () => {
    const { wrapper } = await mountAt('/not-a-real-page')
    expect(wrapper.find(SHELL).exists()).toBe(false)
    expect(wrapper.get('h1').text()).toBe('Page not found')
  })
})
