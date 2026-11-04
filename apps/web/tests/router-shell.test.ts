import { flushPromises } from '@vue/test-utils'
import routes from '@web/router/routes'
import { defined } from '@web-tests/support/defined'
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
  it.each([
    [800, true],
    [1400, false],
    [2000, false],
  ])('stacks the hero only when the artwork would overlap at width %s', async (width, stacked) => {
    const size = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.classList.contains('all-deals-hero') ? Number(width) : 600
    })
    try {
      const { wrapper } = await mountAt('/deals')
      await flushPromises()
      expect(
        wrapper.get('[data-testid="all-deals-hero"]').classes().includes('all-deals-hero--stacked'),
      ).toBe(stacked)
    } finally {
      size.mockRestore()
    }
  })

  it.each([false, true])(
    'personalises the All Deals hero for sign-in state %s',
    async (signedIn) => {
      auth.session.current = signedIn ? SIGNED_IN : SIGNED_OUT
      const { wrapper, router } = await mountAt('/deals')
      expect(wrapper.get('[data-testid="all-deals-hero"]').text()).toContain(
        signedIn ? 'Hey Synthetic Student,' : 'Hey food lover,',
      )
      await wrapper.get('[data-testid="show-map"]').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.query.view).toBe('map')
      expect(wrapper.find('[data-testid="all-deals-hero"]').exists()).toBe(false)
    },
  )

  it.each([false, true])(
    'routes the menu logo home based on sign-in state (%s)',
    async (signedIn) => {
      auth.session.current = signedIn ? SIGNED_IN : SIGNED_OUT
      const { wrapper, router } = await mountAt('/browse')
      await wrapper.get('[data-testid="nav-toggle"]').trigger('click')
      await flushPromises()
      await wrapper.get('.brand-menu__drawer-head a').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe(signedIn ? 'browse' : 'landing')
      if (signedIn) expect(router.currentRoute.value.query.view).toBe('list')
      expect(wrapper.find('[data-testid="nav-menu"]').exists()).toBe(false)
    },
  )

  it.each(['/browse', '/deals', '/account-required?tab=saved'])(
    'opens standalone login directly from %s',
    async (origin) => {
      const { router, wrapper } = await mountAt(origin)
      await router.push('/login?redirect=/saved')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('sign-in')
      expect(wrapper.find('[data-testid="standalone-auth"]').exists()).toBe(true)
      expect(wrapper.find('.auth-prompt').exists()).toBe(false)
    },
  )

  it.each([
    ['/saved', 'saved', 'Saved'],
    ['/add', 'submit-deal', 'Share'],
    ['/me/profile', 'profile', 'Account'],
  ])('selects the %s tab and displays its padded account prompt', async (path, tab, label) => {
    const { router, wrapper } = await mountAt('/browse')
    await router.push(path)
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('auth-required')
    expect(router.currentRoute.value.query.tab).toBe(tab)
    expect(wrapper.get('[data-testid="map-navigation"] a[aria-current="page"]').text()).toBe(label)
    expect(wrapper.find('[data-testid="shell-panel"] .auth-prompt').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Maybe later')
    if (tab === 'submit-deal') {
      expect(wrapper.text()).toContain('Share good lobangs')
      expect(wrapper.text()).toContain('Post your finds')
      expect(wrapper.findAll('.saved-prompt__benefit')).toHaveLength(3)
      expect(wrapper.get('.saved-prompt__signup').text()).toBe('Create a free account')
    }
    if (tab === 'saved') {
      expect(wrapper.text()).toContain('Save your favourite deals')
      expect(wrapper.findAll('.saved-prompt__benefit')).toHaveLength(3)
      expect(wrapper.get('.saved-prompt__signup').text()).toBe('Create a free account')
    }
  })

  it.each([
    ['/squad/new', 'Eat together in a Squad'],
    ['/me/profile', 'Make every deal count'],
    ['/me/submissions', 'Make every deal count'],
  ])('shows the illustrated account prompt for %s', async (path, heading) => {
    const { router, wrapper } = await mountAt('/browse')
    await router.push(path)
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('auth-required')
    expect(wrapper.find('.auth-prompt__content--saved').exists()).toBe(true)
    expect(wrapper.find('.saved-prompt__illustration').exists()).toBe(true)
    expect(wrapper.get('#auth-prompt-title').text()).toBe(heading)
    expect(wrapper.findAll('.saved-prompt__benefit')).toHaveLength(3)
    expect(wrapper.get('.saved-prompt__signup').text()).toBe('Create a free account')
    expect(wrapper.find('.auth-prompt__close').exists()).toBe(false)
  })

  it.each([
    '/account-required?view=list&split=1&results=list&discovery=1&tab=squad-new&redirect=/squad/new',
    '/squad/join?view=list&split=1&results=list&discovery=1',
    '/codes?view=list&discovery=1',
  ])('opens %s beside the map, not in the All Deals list layout', async (path) => {
    const { wrapper } = await mountAt(path)
    expect(wrapper.find('.map-shell--map-workspace').exists()).toBe(true)
    expect(wrapper.find('[data-testid="map-navigation"]').exists()).toBe(true)
  })

  it('opens the account prompt beside the map when leaving All Deals for Squad', async () => {
    const { router, wrapper } = await mountAt('/browse?view=list&discovery=1')
    await router.push('/squad/new?view=list&discovery=1')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('auth-required')
    expect(wrapper.find('.map-shell--map-workspace').exists()).toBe(true)
    expect(wrapper.find('[data-testid="map-navigation"]').exists()).toBe(true)
  })

  it('opens standalone sign-up when chosen in the account prompt', async () => {
    const { router, wrapper } = await mountAt('/browse')
    const navigation = router.push('/saved')
    await flushPromises()
    await wrapper.get('.saved-prompt__signup').trigger('click')
    await navigation
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('sign-up')
    expect(wrapper.find('[data-testid="standalone-auth"]').exists()).toBe(true)
  })

  it.each(['/deals', '/'])(
    'opens standalone login for a protected action from %s',
    async (origin) => {
      const { wrapper, router } = await mountAt(origin)
      const navigation = router.push('/saved')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('auth-required')
      await defined(
        wrapper.findAll('.auth-prompt button').find((button) => button.text() === 'Log in'),
      ).trigger('click')
      await navigation
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('sign-in')
      expect(wrapper.find('[data-testid="standalone-auth"]').exists()).toBe(true)
      expect(wrapper.find(SHELL).exists()).toBe(false)
      expect(wrapper.find('[data-testid="splash-screen"]').exists()).toBe(false)
      expect(wrapper.find('#login-email').exists()).toBe(true)
      expect(wrapper.find('#login-password').exists()).toBe(true)
      wrapper.findComponent({ name: 'LoginForm' }).vm.$emit('signedIn')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('browse')
      expect(router.currentRoute.value.query.view).toBe('list')
    },
  )

  it('uses standalone login when saving from All Deals and supports switching to sign-up', async () => {
    const { wrapper, router } = await mountAt('/deals')
    const list = router.currentRoute.value.fullPath
    await wrapper.get('[data-testid="item-save"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('auth-required')
    const state = vi.spyOn(router.options.history, 'state', 'get').mockReturnValue({ back: list })
    await defined(
      wrapper.findAll('.auth-prompt button').find((button) => button.text() === 'Back'),
    ).trigger('click')
    await flushPromises()
    state.mockRestore()
    expect(router.currentRoute.value.fullPath).toBe(list)
    await wrapper.get('[data-testid="item-save"]').trigger('click')
    await flushPromises()
    await defined(
      wrapper.findAll('.auth-prompt button').find((button) => button.text() === 'Log in'),
    ).trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('sign-in')
    await wrapper.get('[data-testid="standalone-auth"] a[href^="/sign-up"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('sign-up')
    expect(wrapper.find('[data-testid="standalone-auth"]').exists()).toBe(true)
    expect(wrapper.find(SHELL).exists()).toBe(false)
  })

  it('opens standalone login for a protected action from the map', async () => {
    const { wrapper, router } = await mountAt('/browse')
    const navigation = router.push('/saved')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('auth-required')
    await defined(
      wrapper.findAll('.auth-prompt button').find((button) => button.text() === 'Log in'),
    ).trigger('click')
    await navigation
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('sign-in')
    expect(wrapper.find(SHELL).exists()).toBe(false)
    expect(wrapper.find('[data-testid="standalone-auth"]').exists()).toBe(true)
  })

  it.each(['/saved', '/me/profile', '/add', '/browse'])(
    'opens All Deals after login instead of returning to %s',
    async (redirect) => {
      const { wrapper, router } = await mountAt(`/login?redirect=${encodeURIComponent(redirect)}`)
      wrapper.findComponent({ name: 'LoginForm' }).vm.$emit('signedIn')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('browse')
      expect(router.currentRoute.value.query).toMatchObject({ view: 'list', discovery: '1' })
      expect(wrapper.get(SHELL).classes()).toContain('map-shell--deals-page')
    },
  )

  it('keeps the landing page accessible at About for signed-in visitors with a profile menu', async () => {
    auth.session.current = SIGNED_IN
    const { wrapper, router } = await mountAt('/about')
    expect(router.currentRoute.value.name).toBe('about')
    const navbar = wrapper.get('.landing-nav')
    expect(navbar.get('.landing-brand').attributes('href')).toBe('/')
    expect(navbar.get('.landing-nav-links').text()).toBe('All dealsMapSaved deals')
    expect(navbar.find('a[href="/login"]').exists()).toBe(false)
    await navbar.get('.profile-menu__avatar').trigger('click')
    expect(navbar.get('.profile-menu__panel').text()).toContain('Account settings')
    expect(navbar.get('.profile-menu__panel').text()).toContain('My deal submissions')
    expect(navbar.get('.profile-menu__panel').text()).toContain('Log out')
  })

  it('offers discovery and authentication in the visitor landing navbar', async () => {
    const { wrapper } = await mountAt('/')
    const navbar = wrapper.get('.landing-nav')
    expect(navbar.get('.landing-nav-links').text()).toBe('All dealsMapHow it works')
    expect(navbar.find('.landing-nav-links a[href="/saved"]').exists()).toBe(false)
    expect(navbar.find('a[href="#cuisines"]').exists()).toBe(false)
    expect(navbar.get('.landing-account a[href="/login"]').text()).toBe('Log in')
    expect(navbar.get('.landing-account a[href="/register"]').text()).toBe('Sign up')
    // The same site menu drawer as every other page.
    await navbar.get('[data-testid="nav-toggle"]').trigger('click')
    expect(navbar.get('[data-testid="nav-menu"]').attributes('role')).toBe('dialog')
    expect(navbar.get('[data-testid="nav-menu"]').text()).toContain('All deals')
  })

  it.each([
    ['login', 'sign-in'],
    ['register', 'sign-up'],
  ])('redirects legacy %s links to standalone auth', async (legacy, destination) => {
    const { wrapper, router } = await mountAt(`/${legacy}?view=map&redirect=/saved`)
    expect(router.currentRoute.value.name).toBe(destination)
    expect(router.currentRoute.value.query.redirect).toBe('/saved')
    expect(wrapper.find('[data-testid="standalone-auth"]').exists()).toBe(true)
    expect(wrapper.find(SHELL).exists()).toBe(false)
    expect(wrapper.find('[data-testid="splash-screen"]').exists()).toBe(false)
  })

  it('keeps poster sizing stable when community feedback changes after a vote', async () => {
    const frames: FrameRequestCallback[] = []
    const animationFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frames.push(callback)
        return frames.length
      })
    const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    try {
      const first = defined(DEALS_RESPONSE.items[0])
      rest.list.mockResolvedValue({
        ...DEALS_RESPONSE,
        items: [
          { ...first, images: [{ url: 'https://example.com/poster.jpg', alt: 'Deal poster' }] },
          ...DEALS_RESPONSE.items.slice(1),
        ],
      })
      const { wrapper } = await mountAt(`/deals/${first.id}?view=list&discovery=1`)
      const popup = wrapper.get('[data-testid="deal-dialog"]')
      const body = popup.get('[data-testid="panel-body"]').element as HTMLElement
      const media = popup.get('.deal-panel__media').element as HTMLElement
      const image = popup.get('.deal-photo__img').element as HTMLImageElement
      Object.defineProperties(image, {
        naturalWidth: { value: 800 },
        naturalHeight: { value: 1000 },
      })
      Object.defineProperty(body, 'clientWidth', { value: 1100 })
      body.style.padding = '20px'
      media.getBoundingClientRect = () => ({ top: 0 }) as DOMRect
      // Community API is unavailable in this route fixture; supply its layout surface.
      const verification = document.createElement('div')
      verification.className = 'deal-community-verification'
      let bottom = 600
      verification.getBoundingClientRect = () => ({ bottom }) as DOMRect
      popup.get('.deal-community-overview').element.append(verification)
      await flushPromises()
      frames.at(-1)?.(0)
      const posterWidth = body.style.getPropertyValue('--poster-width')
      const stacked = popup.classes().includes('deal-dialog--stacked')
      expect(posterWidth).not.toBe('')
      bottom = 900
      verification.textContent = 'Vote updated. Thanks for sharing what you found.'
      await flushPromises()
      frames.at(-1)?.(0)
      expect(body.style.getPropertyValue('--poster-width')).toBe(posterWidth)
      expect(popup.classes().includes('deal-dialog--stacked')).toBe(stacked)
    } finally {
      animationFrame.mockRestore()
      cancelFrame.mockRestore()
    }
  })

  it('scrolls deal details to the top after selecting another participating outlet', async () => {
    const first = defined(DEALS_RESPONSE.items[0])
    const otherOutlet = defined(defined(DEALS_RESPONSE.items[1]).venues[0])
    rest.list.mockResolvedValue({
      ...DEALS_RESPONSE,
      items: [
        { ...first, venues: [...first.venues, otherOutlet] },
        ...DEALS_RESPONSE.items.slice(1),
      ],
    })
    const { wrapper, router } = await mountAt(
      `/deals/${first.id}?view=list&discovery=1&at=${defined(first.venues[0]).id}`,
    )
    const dialog = wrapper.get('[data-testid="deal-dialog"]')
    const body = dialog.get('[data-testid="panel-body"]').element as HTMLElement
    body.scrollTop = 600
    await dialog
      .get(`[data-testid="deal-outlets"] a[href*="at=${otherOutlet.id}"]`)
      .trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.at).toBe(otherOutlet.id)
    expect(body.scrollTop).toBe(0)
    expect(dialog.get('.deal-panel__venue').text()).toBe(otherOutlet.name)
  })

  it('omits the poster placeholder and keeps the details and tags when a deal has no image', async () => {
    const first = defined(DEALS_RESPONSE.items[0])
    rest.list.mockResolvedValue({
      ...DEALS_RESPONSE,
      items: [{ ...first, images: [], imageUrl: null }, ...DEALS_RESPONSE.items.slice(1)],
    })
    const { wrapper } = await mountAt(`/deals/${first.id}?view=list&discovery=1`)
    const dialog = wrapper.get('[data-testid="deal-dialog"]')
    expect(dialog.find('.deal-panel--no-image').exists()).toBe(true)
    expect(dialog.get('.deal-panel__media').isVisible()).toBe(false)
    expect(dialog.find('.deal-panel__hero').exists()).toBe(false)
    expect(dialog.get('.deal-panel__tags').text()).toContain('Drinks')
    expect(dialog.get('.panel-frame__title').text()).toBe(first.title)
    expect(dialog.find('.deal-panel__conditions').exists()).toBe(true)
  })

  it('uses the deal terms in the popup instead of description and highlights sections', async () => {
    const first = defined(DEALS_RESPONSE.items[0])
    rest.list.mockResolvedValue({
      ...DEALS_RESPONSE,
      items: [
        { ...first, terms: 'Valid for dine-in only. Not valid with other offers.' },
        ...DEALS_RESPONSE.items.slice(1),
      ],
    })
    const { wrapper } = await mountAt(`/deals/${first.id}?view=list&discovery=1`)
    const dialog = wrapper.get('[data-testid="deal-dialog"]')
    expect(dialog.get('.deal-panel__validity-field dt').text()).toBe('Valid')
    expect(dialog.get('.deal-panel__validity-field dd').text()).toBeTruthy()
    expect(dialog.get('.deal-panel__conditions h2').text()).toBe('Terms and conditions')
    expect(dialog.get('[data-testid="deal-terms"]').text()).toContain('Valid for dine-in only')
    expect(dialog.get('[data-testid="deal-terms"]').text()).toContain('Not valid with other offers')
    expect(dialog.find('.deal-panel__description').exists()).toBe(false)
    expect(dialog.find('.deal-panel__status').exists()).toBe(true)
    expect(dialog.find('.deal-panel__facts').exists()).toBe(false)
    expect(dialog.find('[data-testid="save-deal"]').exists()).toBe(true)
  })

  it('gives only the shell route the full-bleed canvas, and its children inherit it', () => {
    const canvas = routes.filter((route) => route.meta?.layout === 'canvas')
    expect(canvas.map((route) => route.path)).toEqual(['/browse'])
    expect(canvas[0]?.children?.map((child) => child.name)).toEqual([
      'auth-required',
      'browse',
      'deal',
      'venue',
      'place',
      'lobbie',
      'login',
      'register',
      'profile',
      'saved',
      'codes',
      'squad-new',
      'squad-join',
      'squad-room',
    ])
  })

  it.each([
    ['/browse', '3 deals'],
    [`/deals/${'c'.repeat(24)}`, 'Synthetic iced kopi'],
    [`/venues/${'a'.repeat(24)}`, 'Loading venue'],
    ['/ask-lobbie', 'Ask Lobbie'],
  ])('renders %s as a panel inside the shell', async (path, heading) => {
    const { wrapper } = await mountAt(path)
    expect(wrapper.find(SHELL).exists()).toBe(true)
    expect(wrapper.get('[data-testid="shell-panel"] h1').text()).toContain(heading)
    expect(wrapper.find('[data-testid="deal-map"], deal-map-stub').exists()).toBe(true)
  })

  it.each([
    ['/me/profile', 'Synthetic Student'],
    ['/saved', '0 saved deals'],
  ])('renders the signed-in panel %s inside the shell', async (path, heading) => {
    auth.session.current = SIGNED_IN
    const { wrapper } = await mountAt(path)
    expect(wrapper.find(SHELL).exists()).toBe(true)
    expect(wrapper.get('[data-testid="shell-panel"] h1').text()).toBe(heading)
  })

  it('keeps deal details in their originating view and opens Show map in split mode', async () => {
    const { router, wrapper } = await mountAt('/deals?q=synthetic')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('browse')
    expect(router.currentRoute.value.query).toEqual({
      q: 'synthetic',
      view: 'list',
      discovery: '1',
    })
    expect(wrapper.get(SHELL).classes()).toContain('map-shell--deals-page')
    expect(wrapper.findAll('[data-testid="food-deal-grid"] .food-deal-card')).toHaveLength(3)
    const card = wrapper.get('.food-deal-card')
    expect(card.get('.food-deal-card__description').text()).toBe('Synthetic iced kopi')
    expect(card.get('.food-deal-card__description').classes()).toContain(
      'food-deal-card__description',
    )
    expect(card.get('.food-deal-card__restaurant').text()).toBe('Synthetic Kopi Corner')
    const listBody = wrapper.get('[data-testid="shell-panel"] [data-testid="panel-body"]')
      .element as HTMLElement
    listBody.scrollTop = 180
    ;(card.get('.food-deal-card__link').element as HTMLElement).focus()

    await card.get('.food-deal-card__link').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('deal')
    expect(wrapper.get('[data-testid="deal-dialog"]').attributes('aria-modal')).toBe('true')
    expect(wrapper.get('[data-testid="shell-panel"]').attributes('inert')).toBeDefined()
    expect(wrapper.findAll('[data-testid="food-deal-grid"] .food-deal-card')).toHaveLength(3)
    expect(wrapper.get(SHELL).classes()).toContain('map-shell--deals-page')
    expect(wrapper.get(SHELL).classes()).not.toContain('map-shell--map-only')
    expect(router.currentRoute.value.query).toMatchObject({
      q: 'synthetic',
      view: 'list',
      discovery: '1',
    })
    await wrapper.get('[data-testid="deal-dialog"]').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('browse'))
    expect(wrapper.find('[data-testid="deal-dialog"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="shell-panel"] [data-testid="panel-body"]').element).toBe(
      listBody,
    )
    expect(listBody.scrollTop).toBe(180)
    expect(document.activeElement).toBe(card.get('.food-deal-card__link').element)

    await wrapper.get('[data-testid="show-map"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.split).toBe('1')
    expect(wrapper.get(SHELL).classes()).not.toContain('map-shell--map-only')
    expect(wrapper.get('[data-testid="shell-panel"]').attributes('inert')).toBeUndefined()
    expect(wrapper.findAll('[data-testid="deal-rows"] .deal-rows__row')).toHaveLength(3)
    expect(router.currentRoute.value.query).toMatchObject({
      q: 'synthetic',
      discovery: '1',
    })

    await wrapper.get('.deal-rows__row').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('deal')
    expect(router.currentRoute.value.query).toMatchObject({
      view: 'map',
      split: '1',
      q: 'synthetic',
    })
    expect(wrapper.get(SHELL).classes()).not.toContain('map-shell--deals-page')
    expect(wrapper.find('[data-testid="deal-dialog"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="shell-panel"]').attributes('inert')).toBeUndefined()
  })

  it.each(['[aria-label="Close deal details"]', '[data-testid="deal-dialog-backdrop"]'])(
    'dismisses list deal details with %s',
    async (selector) => {
      const { router, wrapper } = await mountAt('/deals?q=synthetic&sort=ending')
      await wrapper.get('.food-deal-card__link').trigger('click')
      await flushPromises()
      await wrapper.get(selector).trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('browse')
      expect(router.currentRoute.value.query).toMatchObject({
        q: 'synthetic',
        sort: 'ending',
        view: 'list',
      })
      expect(wrapper.find('[data-testid="deal-dialog"]').exists()).toBe(false)
    },
  )

  it('serves the map at /browse and leaves / to the landing page', async () => {
    const { router } = await mountAt('/browse')
    expect(router.currentRoute.value.name).toBe('browse')
    expect(router.resolve('/').name).toBe('landing')
  })

  it('opens deal discovery when a signed-in visitor visits home', async () => {
    auth.session.current = SIGNED_IN
    const { router, wrapper } = await mountAt('/')
    expect(router.currentRoute.value.name).toBe('browse')
    expect(router.currentRoute.value.query).toMatchObject({ view: 'list', discovery: '1' })
    expect(wrapper.find('[data-testid="food-deal-grid"]').exists()).toBe(true)
  })

  it('sends guarded children to log in with a redirect back', async () => {
    const { router, wrapper } = await mountAt('/add')
    expect(router.currentRoute.value.name).toBe('sign-in')
    expect(router.currentRoute.value.query.redirect).toBe('/add')
    expect(wrapper.get('[data-testid="standalone-auth"] h1').text()).toBe('Welcome back!')
  })

  it('keeps visitors without the merchant role out of the merchant dashboard', async () => {
    auth.session.current = SIGNED_IN
    const { router } = await mountAt('/merchant')
    expect(router.currentRoute.value.query).toMatchObject({ view: 'list', discovery: '1' })
  })

  it('keeps standalone pages outside the shell, under the All Deals header', async () => {
    const { wrapper } = await mountAt('/getting-started')
    await flushPromises()
    expect(wrapper.find(SHELL).exists()).toBe(false)
    expect(wrapper.find('[data-testid="page-header"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="primary-nav"]').exists()).toBe(false)
  })

  it('renders a useful 404 outside the shell', async () => {
    const { wrapper } = await mountAt('/not-a-real-page')
    expect(wrapper.find(SHELL).exists()).toBe(false)
    expect(wrapper.get('h1').text()).toBe('Page not found')
  })
})
