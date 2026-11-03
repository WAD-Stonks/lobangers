import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { FOCUS_ZOOM, LOCATE_ZOOM } from '@web/modules/browse-map/map-config'
import { MAP_SIDEBAR_STORAGE_KEY } from '@web/modules/map-shell/map-preferences'
import { defined } from '@web-tests/support/defined'
import { chooseOption, selectedValue } from '@web-tests/support/select'
import {
  DEALS_RESPONSE,
  HAWKER_VENUE,
  KOPI,
  KOPI_VENUE,
  mountShell,
  NOODLES,
  SIGNED_IN,
  SIGNED_OUT,
} from '@web-tests/support/shell-fixtures'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const rest = vi.hoisted(() => ({
  list: vi.fn(),
  bookmarks: vi.fn(),
  save: vi.fn(),
  unsave: vi.fn(),
  venue: vi.fn(),
}))
vi.mock('@web/lib/api-client', () => ({
  ApiClientError: class ApiClientError extends Error {},
  api: {
    deals: { list: rest.list },
    venues: { get: rest.venue },
    account: { bookmarks: rest.bookmarks, saveDeal: rest.save, unsaveDeal: rest.unsave },
  },
}))

const auth = vi.hoisted(() => ({ session: { current: null as unknown }, signOut: vi.fn() }))
vi.mock('@web/lib/auth-client', () => ({
  authClient: {
    useSession: () => ref(auth.session.current),
    getSession: async () => ({ data: (auth.session.current as { data: unknown }).data }),
    signOut: auth.signOut,
  },
}))

let mounted: VueWrapper[] = []
const mountAt = async (path: string) => {
  const result = await mountShell(path)
  mounted.push(result.wrapper)
  return result
}
const rowTitles = (wrapper: VueWrapper) =>
  wrapper.findAll('[data-testid="deal-rows"] .deal-rows__title').map((title) => title.text())
const map = (wrapper: VueWrapper) => wrapper.findComponent({ name: 'DealMap' })

beforeEach(() => {
  window.localStorage.removeItem(MAP_SIDEBAR_STORAGE_KEY)
  auth.session.current = SIGNED_OUT
  rest.list.mockReset().mockResolvedValue(DEALS_RESPONSE)
  rest.bookmarks.mockReset().mockResolvedValue({ items: [], nextCursor: null })
  rest.save.mockReset().mockResolvedValue({ saved: true })
  rest.unsave.mockReset().mockResolvedValue({ saved: false })
  rest.venue.mockReset().mockReturnValue(new Promise(() => undefined))
})
afterEach(() => {
  for (const wrapper of mounted) wrapper.unmount()
  mounted = []
  vi.unstubAllGlobals()
  window.localStorage.removeItem(MAP_SIDEBAR_STORAGE_KEY)
})

describe('Become a merchant', () => {
  it.each([
    ['a signed-out visitor', SIGNED_OUT, true, false],
    ['a regular account', SIGNED_IN, true, false],
    [
      'a merchant',
      {
        ...SIGNED_IN,
        data: { ...SIGNED_IN.data, user: { ...SIGNED_IN.data.user, role: 'MERCHANT' } },
      },
      false,
      true,
    ],
    [
      'an admin',
      {
        ...SIGNED_IN,
        data: { ...SIGNED_IN.data, user: { ...SIGNED_IN.data.user, role: 'ADMIN' } },
      },
      false,
      false,
    ],
  ])(
    'is offered on the All Deals header to %s only when they can request it; merchants get their dashboard there instead',
    async (_, session, offered, dashboard) => {
      auth.session.current = session
      const { wrapper } = await mountAt('/browse?view=list')
      expect(wrapper.find('[data-testid="become-merchant"]').exists()).toBe(offered)
      const link = wrapper.find('[data-testid="header-merchant-dashboard"]')
      expect(link.exists()).toBe(dashboard)
      if (dashboard) expect(link.attributes('href')).toBe('/merchant')
    },
  )
})

describe('browse panel', () => {
  it('keeps every saved deal visible when the map moves and restores area filtering on Deals', async () => {
    auth.session.current = SIGNED_IN
    rest.bookmarks.mockResolvedValue({
      items: [{ dealId: KOPI.id }, { dealId: NOODLES.id }],
      nextCursor: null,
    })
    const { wrapper, router } = await mountAt('/saved')
    const savedTitles = rowTitles(wrapper)
    expect(savedTitles).toHaveLength(2)
    map(wrapper).vm.$emit('moved', { south: 0, north: 0.1, west: 100, east: 100.1 })
    await flushPromises()
    expect(rowTitles(wrapper)).toEqual(savedTitles)
    expect(wrapper.get('[data-testid="shell-panel"] h1').text()).toBe('2 saved deals')
    await router.push('/browse')
    await flushPromises()
    expect(rowTitles(wrapper)).toEqual([])
  })

  it('uses location only on All Deals and remembers it when returning from the map', async () => {
    const { wrapper, router } = await mountAt('/deals')
    await wrapper.get('[data-testid="quick-location"]').trigger('click')
    await wrapper.get('[data-testid="quick-filter-popover"] input').setValue('Bugis')
    await defined(
      wrapper
        .findAll('[data-testid="quick-filter-popover"] button')
        .find((button) => button.text() === 'Bugis'),
    ).trigger('click')
    await wrapper.get('[data-testid="quick-filter-apply"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.location).toBe('town:Bugis')
    expect(wrapper.findAll('.food-deal-card')).toHaveLength(2)
    expect(wrapper.get('[data-testid="filter-badge"]').text()).toContain('1')
    await wrapper.get('[data-testid="show-map"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.location).toBe('town:Bugis')
    expect(map(wrapper).props('pins')).toHaveLength(2)
    expect(wrapper.find('[data-testid="quick-location"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="filter-badge"]').exists()).toBe(false)
    await router.push({ path: '/deals', query: { location: 'town:Bugis' } })
    await flushPromises()
    expect(wrapper.findAll('.food-deal-card')).toHaveLength(2)
    await wrapper.get('[data-testid="quick-location"]').trigger('click')
    await defined(
      wrapper
        .findAll('[data-testid="quick-filter-popover"] button')
        .find((button) => button.text() === 'Clear'),
    ).trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.location).toBeUndefined()
    expect(map(wrapper).props('pins')).toHaveLength(2)
  })

  it('omits Location from the map filter panel and ignores old location query values', async () => {
    const { wrapper } = await mountAt('/browse?location=region:North')
    expect(wrapper.find('[data-testid="quick-location"]').exists()).toBe(false)
    expect(map(wrapper).props('pins')).toHaveLength(2)
    await wrapper.get('[data-testid="all-filters"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="filter-location-section"]').exists()).toBe(false)
  })

  it('clears filters on All Deals without changing the view or sort', async () => {
    auth.session.current = SIGNED_IN
    const { wrapper, router } = await mountAt(
      '/browse?view=list&discovery=1&q=synthetic&cat=drinks&max=5&sort=ending',
    )
    expect(wrapper.find('[data-testid="deals-greeting"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Great food, better prices')
    await wrapper.get('[data-testid="clear-all-filters"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toMatchObject({
      view: 'list',
      discovery: '1',
      sort: 'ending',
    })
    expect(router.currentRoute.value.query.q).toBeUndefined()
    expect(router.currentRoute.value.query.cat).toBeUndefined()
    expect(router.currentRoute.value.query.max).toBeUndefined()
    expect(wrapper.find('[data-testid="filter-badge"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="clear-all-filters"]').exists()).toBe(false)
    expect(wrapper.findAll('.food-deal-card')).toHaveLength(3)
  })

  it('automatically filters to the visible map area and restores deals when the viewport expands', async () => {
    const { wrapper, router } = await mountAt('/browse')
    map(wrapper).vm.$emit('moved', {
      south: KOPI_VENUE.lat - 0.00001,
      north: KOPI_VENUE.lat + 0.00001,
      west: KOPI_VENUE.lng - 0.00001,
      east: KOPI_VENUE.lng + 0.00001,
    })
    await flushPromises()
    expect(rowTitles(wrapper)).toEqual(['Synthetic iced kopi'])
    expect(wrapper.find('[data-testid="search-area"]').exists()).toBe(false)
    map(wrapper).vm.$emit('moved', { south: 0, north: 2, west: 100, east: 105 })
    await flushPromises()
    expect(rowTitles(wrapper)).toHaveLength(3)
    map(wrapper).vm.$emit('moved', { south: 0, north: 0.1, west: 100, east: 100.1 })
    await flushPromises()
    expect(rowTitles(wrapper)).toHaveLength(0)
    await router.push('/browse?view=list&discovery=1')
    await flushPromises()
    expect(wrapper.findAll('.food-deal-card')).toHaveLength(3)
  })

  it('lists every loaded deal with a count, asking the API only for valid deals', async () => {
    const { wrapper } = await mountAt('/browse')
    expect(rest.list).toHaveBeenCalledWith({ validNow: 'true' })
    expect(wrapper.get('[data-testid="shell-panel"] h1').text()).toBe('3 deals')
    expect(rowTitles(wrapper)).toEqual([
      'Synthetic iced kopi',
      'Synthetic noodle set',
      'Synthetic chicken rice',
    ])
    expect(map(wrapper).props('pins')).toHaveLength(2)
  })

  it('says why distances are missing when location is unavailable, and still lists deals', async () => {
    const { wrapper } = await mountAt('/browse')
    expect(wrapper.get('[data-testid="location-status"]').text()).toContain('Location unavailable')
    expect(rowTitles(wrapper)).toHaveLength(3)
  })

  it('applies the quick price filter to the URL, list and pins, and Back undoes it', async () => {
    const { router, wrapper } = await mountAt('/browse')
    await wrapper.get('[data-testid="quick-price"]').trigger('click')
    await wrapper.get('input[type="number"]').setValue('5')
    await wrapper.get('[data-testid="quick-filter-apply"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.max).toBe('5')
    expect(wrapper.get('[data-testid="quick-price"]').text()).toContain('Up to $5')
    // A price cap keeps deals without a fixed price, like the API does.
    expect(rowTitles(wrapper)).toEqual(['Synthetic iced kopi', 'Synthetic chicken rice'])
    expect(wrapper.find('.browse-list__tokens').exists()).toBe(false)
    expect(wrapper.find('.browse-list__toolbar [data-testid="results-list"]').exists()).toBe(true)
    expect(wrapper.find('.browse-list__toolbar [data-testid="sort"]').exists()).toBe(true)

    router.back()
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.query.max).toBeUndefined())
    expect(rowTitles(wrapper)).toHaveLength(3)
  })

  it('searches after Enter and clears from the field', async () => {
    const { router, wrapper } = await mountAt('/browse')
    const input = wrapper.get('input[type="search"]')
    await input.setValue('noodle')
    await wrapper.get('form[role="search"]').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.query.q).toBe('noodle')
    expect(rowTitles(wrapper)).toEqual(['Synthetic noodle set'])

    await wrapper.get('[aria-label="Clear search"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.q).toBeUndefined()
  })

  it('shows an empty state whose button clears the filters', async () => {
    const { router, wrapper } = await mountAt('/browse?q=nothing-matches')
    expect(wrapper.get('[data-testid="deals-status"]').text()).toContain(
      'No deals match all of these',
    )
    await wrapper.get('[data-testid="clear-filters"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({})
    expect(rowTitles(wrapper)).toHaveLength(3)
  })

  it('offers a retry when deals fail to load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    rest.list.mockRejectedValueOnce(new Error('network'))
    const { wrapper } = await mountAt('/browse')
    expect(wrapper.get('[data-testid="deals-status"]').text()).toContain("Deals didn't load")
    await wrapper.get('[data-testid="deals-status"] button').trigger('click')
    await flushPromises()
    expect(rowTitles(wrapper)).toHaveLength(3)
  })

  it('highlights the pin for a hovered row, and the row for a hovered pin', async () => {
    const { wrapper } = await mountAt('/browse')
    await wrapper.get('[data-testid="deal-rows"] > li').trigger('mouseenter')
    expect(map(wrapper).props('hoveredVenueId')).toBe(KOPI_VENUE.id)

    map(wrapper).vm.$emit('hover', HAWKER_VENUE.id)
    await flushPromises()
    const hot = wrapper.findAll('[data-testid="deal-rows"] a.is-hot').map((row) => row.text())
    expect(hot).toHaveLength(2)
    expect(hot[0]).toContain('Synthetic noodle set')
  })
})

describe('near me', () => {
  const HERE = { lat: 1.3, lng: 103.85 }
  const stubGeolocation = (position = HERE) =>
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({
            coords: { latitude: position.lat, longitude: position.lng, accuracy: 20 },
          } as GeolocationPosition),
      },
    })
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'geolocation')
  })

  it('defaults the deals grid to nearby and supports newest and ending sorts after locating', async () => {
    stubGeolocation(HAWKER_VENUE)
    const { router, wrapper } = await mountAt('/deals')
    const titles = () => wrapper.findAll('.food-deal-card__description').map((item) => item.text())
    expect(selectedValue(wrapper, '[data-testid="sort"]')).toBe('near')
    expect(titles()).toEqual([
      'Synthetic noodle set',
      'Synthetic chicken rice',
      'Synthetic iced kopi',
    ])
    await chooseOption(wrapper, '[data-testid="sort"]', 'newest')
    await flushPromises()
    expect(router.currentRoute.value.query.sort).toBe('newest')
    expect(titles()).toEqual([
      'Synthetic iced kopi',
      'Synthetic noodle set',
      'Synthetic chicken rice',
    ])
    await chooseOption(wrapper, '[data-testid="sort"]', 'ending')
    await flushPromises()
    expect(titles()).toEqual([
      'Synthetic noodle set',
      'Synthetic chicken rice',
      'Synthetic iced kopi',
    ])
  })

  it('centres a new visitor on themselves on arrival instead of the whole island', async () => {
    stubGeolocation()
    const { wrapper } = await mountAt('/browse')
    await flushPromises()
    expect(map(wrapper).props('userPosition')).toEqual(HERE)
    expect(map(wrapper).props('focus')).toEqual(HERE)
    expect(map(wrapper).props('focusZoom')).toBe(LOCATE_ZOOM)
  })

  it('keeps the Singapore overview when the visitor is outside Singapore', async () => {
    stubGeolocation({ lat: 51.5, lng: -0.12 })
    const { wrapper } = await mountAt('/browse')
    await flushPromises()
    expect(map(wrapper).props('focus')).toBeNull()
  })

  it('does not pull the map away from an open deal on arrival', async () => {
    stubGeolocation()
    const { wrapper } = await mountAt(`/deals/${KOPI.id}?at=${KOPI_VENUE.id}`)
    await flushPromises()
    expect(map(wrapper).props('focus')).toEqual({ lat: KOPI_VENUE.lat, lng: KOPI_VENUE.lng })
  })

  it('centres on the visitor the first time the map is shown after starting in the list', async () => {
    stubGeolocation()
    const { wrapper } = await mountAt('/browse?view=list&discovery=1')
    await flushPromises()
    expect(map(wrapper).props('focus')).toBeNull()
    await wrapper.get('[data-testid="show-map"]').trigger('click')
    await flushPromises()
    expect(map(wrapper).props('focus')).toEqual(HERE)
  })

  it('focuses the visitor much closer in than a selected deal', async () => {
    stubGeolocation()
    const { wrapper } = await mountAt('/browse')
    await flushPromises()
    await wrapper.get('[data-testid="near-me"]').trigger('click')
    await flushPromises()
    expect(map(wrapper).props('focus')).toEqual(HERE)
    expect(map(wrapper).props('focusZoom')).toBe(LOCATE_ZOOM)
    expect(LOCATE_ZOOM).toBeGreaterThan(FOCUS_ZOOM)
  })

  it('moves to the visitor when they ask while a deal is open', async () => {
    stubGeolocation()
    const { wrapper } = await mountAt(`/deals/${KOPI.id}?at=${KOPI_VENUE.id}`)
    await flushPromises()
    expect(map(wrapper).props('focus')).toEqual({ lat: KOPI_VENUE.lat, lng: KOPI_VENUE.lng })
    await wrapper.get('[data-testid="near-me"]').trigger('click')
    await flushPromises()
    expect(map(wrapper).props('focus')).toEqual(HERE)
    expect(map(wrapper).props('focusZoom')).toBe(LOCATE_ZOOM)
  })
})

describe('collapsing the desktop panel', () => {
  const panel = (wrapper: VueWrapper) => wrapper.get('[data-testid="shell-panel"]')
  const tab = (wrapper: VueWrapper) => wrapper.get('[data-testid="panel-collapse"]')

  it('keeps the previous panel hidden until the selected tab finishes navigating', async () => {
    auth.session.current = SIGNED_IN
    const { wrapper, router } = await mountAt('/me/profile')
    await tab(wrapper).trigger('click')
    let finishNavigation: (() => void) | undefined
    router.beforeEach((to) =>
      to.name === 'saved'
        ? new Promise<void>((resolve) => {
            finishNavigation = resolve
          })
        : true,
    )
    await wrapper.get('[data-testid="map-navigation"] a[href^="/saved"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('profile')
    expect(panel(wrapper).classes()).toContain('is-collapsed')
    expect(tab(wrapper).attributes('aria-expanded')).toBe('false')
    finishNavigation?.()
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('saved')
    expect(panel(wrapper).classes()).not.toContain('is-collapsed')
    expect(panel(wrapper).get('h1').text()).toBe('0 saved deals')
  })

  it('persists a hidden rail while keeping a menu available to show it again', async () => {
    const { wrapper } = await mountAt('/browse')
    await wrapper.get('[data-testid="nav-toggle"]').trigger('click')
    await wrapper.get('[data-testid="show-sidebar"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="map-navigation"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="map-shell"]').attributes('style')).toContain(
      '--map-rail-w: 0px',
    )
    expect(window.localStorage.getItem(MAP_SIDEBAR_STORAGE_KEY)).toBe('0')
    const restored = await mountAt('/browse')
    expect(restored.wrapper.find('[data-testid="map-navigation"]').exists()).toBe(false)
    await restored.wrapper.get('[data-testid="nav-toggle"]').trigger('click')
    expect(restored.wrapper.get('[data-testid="show-sidebar"]').attributes('aria-checked')).toBe(
      'false',
    )
    await restored.wrapper.get('[data-testid="show-sidebar"]').trigger('click')
    await flushPromises()
    expect(restored.wrapper.find('[data-testid="map-navigation"]').exists()).toBe(true)
    expect(restored.wrapper.get('[data-testid="shell-panel"]').attributes('inert')).toBeUndefined()
    expect(window.localStorage.getItem(MAP_SIDEBAR_STORAGE_KEY)).toBe('1')
  })

  it('opens a modal navigation drawer from the rail and restores focus on Escape', async () => {
    const { wrapper } = await mountAt('/browse')
    expect(wrapper.find('[data-testid="map-navigation"]').exists()).toBe(true)
    const toggle = wrapper.get('[data-testid="nav-toggle"]')
    await toggle.trigger('click')
    await flushPromises()
    const menu = wrapper.get('[data-testid="nav-menu"]')
    expect(menu.attributes('role')).toBe('dialog')
    expect(menu.attributes('aria-modal')).toBe('true')
    expect(wrapper.get('[data-testid="shell-header"]').attributes('inert')).toBeDefined()
    expect(panel(wrapper).attributes('inert')).toBeDefined()
    const first = menu.get('a, button').element as HTMLElement
    const last = menu.findAll('a, button').at(-1)?.element as HTMLElement
    first.focus()
    await menu.trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
    await menu.trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(wrapper.find('[data-testid="nav-menu"]').exists()).toBe(false)
    expect(document.activeElement).toBe(toggle.element)
    expect(panel(wrapper).attributes('inert')).toBeUndefined()
  })

  it('tucks the panel away, frames the whole map, and brings it back', async () => {
    const { wrapper } = await mountAt('/browse')
    const openOffset = map(wrapper).props('focusOffset')
    expect(openOffset.x).toBeGreaterThan(0)

    await tab(wrapper).trigger('click')
    expect(panel(wrapper).classes()).toContain('is-collapsed')
    expect(panel(wrapper).attributes('inert')).toBeDefined()
    expect(tab(wrapper).attributes('aria-expanded')).toBe('false')
    expect(tab(wrapper).attributes('aria-label')).toBe('Show results panel')
    expect(map(wrapper).props('focusOffset')).toEqual({ x: 36, y: 0 })
    expect(map(wrapper).props('viewPadding').right).toBe(0)
    expect(map(wrapper).props('viewPadding').left).toBe(72)

    await tab(wrapper).trigger('click')
    expect(panel(wrapper).classes()).not.toContain('is-collapsed')
    expect(panel(wrapper).attributes('inert')).toBeUndefined()
    expect(map(wrapper).props('focusOffset')).toEqual(openOffset)
  })

  it('reopens when a pin is picked', async () => {
    const { wrapper } = await mountAt('/browse')
    await tab(wrapper).trigger('click')
    map(wrapper).vm.$emit('select', KOPI_VENUE.id)
    await flushPromises()
    expect(panel(wrapper).classes()).not.toContain('is-collapsed')
    expect(tab(wrapper).attributes('aria-expanded')).toBe('true')
  })

  it('reopens when switching to the list', async () => {
    const { wrapper, router } = await mountAt('/browse')
    await tab(wrapper).trigger('click')
    await router.push('/browse?view=list&discovery=1')
    await flushPromises()
    expect(panel(wrapper).classes()).not.toContain('is-collapsed')
  })
})

describe('map tutorial', () => {
  const start = async (wrapper: VueWrapper) => {
    await wrapper.get('[data-testid="nav-toggle"]').trigger('click')
    await wrapper.get('[data-testid="start-map-tutorial"]').trigger('click')
    await flushPromises()
  }
  const next = async (wrapper: VueWrapper) => {
    await wrapper.get('[data-testid="tutorial-next"]').trigger('click')
    await flushPromises()
  }

  it('walks through real views and restores the original filters, sort and scroll on finish', async () => {
    const { wrapper, router } = await mountAt('/browse?q=synthetic&sort=ending')
    const path = router.currentRoute.value.fullPath
    ;(wrapper.get('[data-testid="panel-body"]').element as HTMLElement).scrollTop = 140
    await start(wrapper)
    expect(wrapper.get('[data-testid="map-tutorial"]').text()).toContain('Find a deal that fits')
    expect(wrapper.get('[data-testid="filter-sheet"]').attributes('inert')).toBeDefined()
    await next(wrapper)
    expect(router.currentRoute.value.name).toBe('deal')
    expect(wrapper.get('[data-testid="map-tutorial"]').text()).toContain('Open a deal')
    await next(wrapper)
    expect(wrapper.get('[data-testid="map-tutorial"]').text()).toContain(
      'Check community verification',
    )
    await next(wrapper)
    expect(wrapper.get('[data-testid="map-tutorial"]').text()).toContain('Read the conversation')
    await next(wrapper)
    expect(wrapper.get('[data-testid="map-tutorial"]').text()).toContain('Where to add a deal')
    await next(wrapper)
    expect(wrapper.find('[data-testid="map-tutorial"]').exists()).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe(path)
    expect((wrapper.get('[data-testid="panel-body"]').element as HTMLElement).scrollTop).toBe(140)
    expect(rest.save).not.toHaveBeenCalled()
  })

  it('can be dismissed and replayed when no matching deals are available', async () => {
    rest.list.mockResolvedValue({ items: [], categories: [] })
    const { wrapper, router } = await mountAt('/browse?q=empty')
    await start(wrapper)
    await next(wrapper)
    expect(wrapper.get('[data-testid="map-tutorial"]').text()).toContain(
      'no current matching deals',
    )
    await wrapper
      .get('[data-testid="map-tutorial"] [role="dialog"]')
      .trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/browse?q=empty')
    expect(wrapper.find('[data-testid="map-tutorial"]').exists()).toBe(false)
    await start(wrapper)
    expect(wrapper.get('[data-testid="map-tutorial"]').text()).toContain('1 of 5')
  })
})

describe('results display toggle', () => {
  it('opens the Map tab in List view even after choosing Cards', async () => {
    const { wrapper, router } = await mountAt('/browse?results=cards&cat=drinks')
    await defined(
      wrapper
        .get('[data-testid="map-navigation"]')
        .findAll('a')
        .find((link) => link.text() === 'Map'),
    ).trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toMatchObject({ results: 'list', cat: 'drinks' })
    expect(wrapper.get('[data-testid="results-list"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('[data-testid="deal-rows"]').exists()).toBe(true)
  })

  it('expands the shared panel/search width for cards and contracts it for rows even on split entry', async () => {
    vi.stubGlobal('innerWidth', 1440)
    const { wrapper } = await mountAt('/browse?view=map&discovery=1&split=1&results=cards')
    const width = () =>
      (wrapper.get('[data-testid="map-shell"]').element as HTMLElement).style.getPropertyValue(
        '--panel-w',
      )
    const cardWidth = parseFloat(width())
    expect(cardWidth).toBe(Math.round(1440 * 0.42))
    await wrapper.get('[data-testid="results-list"]').trigger('click')
    await flushPromises()
    expect(parseFloat(width())).toBe(400)
    const listPadding = map(wrapper).props('viewPadding').left
    await wrapper.get('[data-testid="results-cards"]').trigger('click')
    await flushPromises()
    expect(parseFloat(width())).toBe(cardWidth)
    expect(map(wrapper).props('viewPadding').left).toBeGreaterThan(listPadding)
  })

  it('switches layouts without changing filters or sort and preserves the choice through deal navigation', async () => {
    const { wrapper, router } = await mountAt('/browse?cat=drinks&sort=ending')
    expect(wrapper.get('[data-testid="results-list"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('[data-testid="deal-rows"]').exists()).toBe(true)
    await wrapper.get('[data-testid="results-cards"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toMatchObject({
      cat: 'drinks',
      sort: 'ending',
      results: 'cards',
    })
    expect(wrapper.get('[data-testid="results-cards"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('[data-testid="food-deal-grid"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="deal-rows"]').exists()).toBe(false)
    await wrapper.get('[data-testid="food-deal-grid"] a').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.results).toBe('cards')
    await wrapper.get('.panel-frame__back').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="food-deal-grid"]').exists()).toBe(true)
    await wrapper.get('[data-testid="results-list"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="deal-rows"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="food-deal-grid"]').exists()).toBe(false)
  })

  it('always shows cards on All Deals without a layout toggle, even with an old list preference', async () => {
    const { wrapper } = await mountAt('/browse?view=list&results=list')
    expect(wrapper.get('[data-testid="shell-panel"] h1').text()).toBe('3 deals to explore')
    expect(wrapper.find('.panel-frame__heading [data-testid="sort"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="show-map"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="food-deal-grid"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="deal-rows"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="results-list"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="results-cards"]').exists()).toBe(false)
  })
})

describe('opening deals and venues', () => {
  it('opens a deal from a row, focuses the map on it and links back with the filters', async () => {
    const { router, wrapper } = await mountAt('/browse?cat=drinks')
    await wrapper.get('[data-testid="deal-rows"] a').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('deal')
    expect(router.currentRoute.value.params.dealId).toBe(KOPI.id)
    await vi.waitFor(() =>
      expect(wrapper.get('[data-testid="shell-panel"] h1').text()).toBe('Synthetic iced kopi'),
    )
    expect(map(wrapper).props('selectedVenueId')).toBe(KOPI_VENUE.id)
    expect(map(wrapper).props('focus')).toEqual({ lat: KOPI_VENUE.lat, lng: KOPI_VENUE.lng })
    const detail = wrapper.get('[data-testid="shell-panel"]')
    expect(detail.find('.deal-panel__status').exists()).toBe(true)
    expect(detail.find('.deal-panel__validity-field').exists()).toBe(true)
    expect(detail.get('.deal-panel__conditions h2').text()).toBe('Terms and conditions')
    expect(detail.find('.deal-panel__facts').exists()).toBe(false)
    expect(detail.find('.deal-panel__description').exists()).toBe(false)
    const elements = [...detail.get('[data-testid="panel-body"]').element.children]
    expect(elements.indexOf(detail.get('.deal-panel__media').element)).toBeLessThan(
      elements.indexOf(detail.get('.panel-frame__heading').element),
    )
    expect(elements.indexOf(detail.get('.deal-panel__status').element)).toBeLessThan(
      elements.indexOf(detail.get('.panel-frame__heading').element),
    )
    expect(wrapper.find('[data-testid="deal-dialog"]').exists()).toBe(false)
    expect(wrapper.get('.panel-frame__back').attributes('href')).toBe('/browse?cat=drinks')
  })

  it('opens the deal straight from a pin with one deal, and the venue for a pin with several', async () => {
    const { router, wrapper } = await mountAt('/browse')
    map(wrapper).vm.$emit('select', KOPI_VENUE.id)
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe(`/deals/${KOPI.id}?at=${KOPI_VENUE.id}`)

    map(wrapper).vm.$emit('select', HAWKER_VENUE.id)
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe(`/venues/${HAWKER_VENUE.id}`)
  })

  it('re-flies to the same outlet when a new panel opens on it', async () => {
    const { router, wrapper } = await mountAt(`/venues/${HAWKER_VENUE.id}`)
    await flushPromises()
    const venueFocus = map(wrapper).props('focus')
    expect(venueFocus).toEqual({ lat: HAWKER_VENUE.lat, lng: HAWKER_VENUE.lng })

    await router.push(`/deals/${NOODLES.id}?at=${HAWKER_VENUE.id}`)
    await flushPromises()
    const dealFocus = map(wrapper).props('focus')
    expect(dealFocus).toEqual({ lat: HAWKER_VENUE.lat, lng: HAWKER_VENUE.lng })
    expect(dealFocus).not.toBe(venueFocus)
  })

  it('resets the panel to the top when the deal changes', async () => {
    const { router, wrapper } = await mountAt(`/deals/${NOODLES.id}`)
    const body = wrapper.get('[data-testid="panel-body"]').element as HTMLElement
    body.scrollTop = 400
    await router.push(`/deals/${KOPI.id}`)
    await flushPromises()
    await vi.waitFor(() =>
      expect(wrapper.get('[data-testid="shell-panel"] h1').text()).toBe('Synthetic iced kopi'),
    )
    expect((wrapper.get('[data-testid="panel-body"]').element as HTMLElement).scrollTop).toBe(0)
  })

  it('says when a deal is no longer listed', async () => {
    const { wrapper } = await mountAt(`/deals/${'9'.repeat(24)}`)
    expect(wrapper.get('[data-testid="shell-panel"] h1').text()).toBe('Deal not found')
  })

  it('keeps the map free of floating promotions and opens deals from the results drawer', async () => {
    const { router, wrapper } = await mountAt('/browse')
    expect(wrapper.find('[data-testid="hot-card"]').exists()).toBe(false)
    await wrapper.get(`[data-testid="deal-rows"] a[href*="${NOODLES.id}"]`).trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('deal')
    expect(router.currentRoute.value.params.dealId).toBe(NOODLES.id)
  })
})

describe('saved results panel', () => {
  it('shows only bookmarks with Deals controls and preserves Saved through sorting, layouts and deal navigation', async () => {
    auth.session.current = SIGNED_IN
    rest.bookmarks.mockResolvedValue({ items: [{ dealId: KOPI.id }], nextCursor: null })
    const { wrapper, router } = await mountAt('/saved?tab=settings')
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false)
    expect(rowTitles(wrapper)).toEqual([KOPI.title])
    expect(wrapper.get('[data-testid="shell-panel"] h1').text()).toBe('1 saved deal')
    await chooseOption(wrapper, '[data-testid="sort"]', 'ending')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('saved')
    await wrapper.get('[data-testid="results-cards"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.food-deal-card')).toHaveLength(1)
    await wrapper.get('.food-deal-card__link').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.collection).toBe('saved')
    expect(wrapper.find('[data-testid="deal-dialog"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="shell-panel"] .deal-panel__fine-print').exists()).toBe(true)
    await wrapper.get('.panel-frame__back').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('saved')
    expect(wrapper.findAll('.food-deal-card')).toHaveLength(1)
    await wrapper.get('[data-testid="panel-collapse"]').trigger('click')
    await wrapper.get('[data-testid="map-navigation"] a[href^="/saved"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="panel-collapse"]').attributes('aria-expanded')).toBe('true')
    await wrapper.get('[data-testid="item-save"]').trigger('click')
    await flushPromises()
    expect(rest.unsave).toHaveBeenCalledWith(KOPI.id)
    expect(wrapper.findAll('.food-deal-card')).toHaveLength(0)
  })

  it('hides expired saved deals until Show expired deals is ticked', async () => {
    auth.session.current = SIGNED_IN
    rest.bookmarks.mockResolvedValue({ items: [{ dealId: KOPI.id }], nextCursor: null })
    const { wrapper, router } = await mountAt('/saved')
    const toggle = wrapper.get<HTMLInputElement>('[data-testid="saved-show-expired"]')
    expect(toggle.element.checked).toBe(false)
    expect(rest.list).toHaveBeenLastCalledWith({ validNow: 'true' })
    await toggle.setValue(true)
    await flushPromises()
    expect(router.currentRoute.value.query.now).toBe('0')
    expect(rest.list).toHaveBeenLastCalledWith({ validNow: 'false' })
    await wrapper.get('[data-testid="saved-show-expired"]').setValue(false)
    await flushPromises()
    expect(router.currentRoute.value.query.now).toBeUndefined()
    expect(rest.list).toHaveBeenLastCalledWith({ validNow: 'true' })
  })

  it('offers Show expired deals only on Saved', async () => {
    const { wrapper } = await mountAt('/browse')
    expect(wrapper.find('[data-testid="saved-show-expired"]').exists()).toBe(false)
  })
})

describe('account tabs', () => {
  it('has no Saved tab on desktop, since Saved has its own place in the navigation', async () => {
    auth.session.current = SIGNED_IN
    const { wrapper } = await mountAt('/me/profile')
    const tabs = wrapper
      .findAll('[aria-label="Account sections"] [role="tab"]')
      .map((tab) => tab.text())
    expect(tabs).toEqual(['Submitted', 'Settings'])
  })
})

describe('saving from result items', () => {
  it('saves from a list row without opening it, shares state with cards, and can unsave', async () => {
    auth.session.current = SIGNED_IN
    const { wrapper, router } = await mountAt('/browse')
    const button = () => wrapper.get(`[data-testid="item-save"][aria-label$="${KOPI.title}"]`)
    expect(wrapper.findAll('[data-testid="item-save"]')).toHaveLength(3)
    await button().trigger('click')
    await flushPromises()
    expect(rest.save).toHaveBeenCalledWith(KOPI.id)
    expect(router.currentRoute.value.name).toBe('browse')
    expect(button().attributes('aria-pressed')).toBe('true')
    await wrapper.get('[data-testid="results-cards"]').trigger('click')
    await flushPromises()
    expect(button().attributes('aria-pressed')).toBe('true')
    await button().trigger('click')
    await flushPromises()
    expect(rest.unsave).toHaveBeenCalledWith(KOPI.id)
    expect(button().attributes('aria-pressed')).toBe('false')
  })

  it('sends signed-out visitors to login with their current results as the return destination', async () => {
    const { wrapper, router } = await mountAt('/browse?results=cards')
    await wrapper.get('[data-testid="item-save"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="shell-panel"] .auth-prompt').exists()).toBe(true)
    expect(wrapper.find('dialog.auth-prompt').exists()).toBe(false)
    await wrapper.get('.auth-prompt__secondary').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('sign-in')
    expect(router.currentRoute.value.query.redirect).toBe('/browse?results=cards')
  })
})

describe('saving from the deal panel', () => {
  it('sends a signed-out visitor to log in and back', async () => {
    const { router, wrapper } = await mountAt(`/deals/${KOPI.id}`)
    await wrapper.get('[data-testid="save-deal"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="shell-panel"] .auth-prompt').exists()).toBe(true)
    expect(wrapper.find('dialog.auth-prompt').exists()).toBe(false)
    await wrapper.get('.auth-prompt__secondary').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('sign-in')
    expect(router.currentRoute.value.query.redirect).toBe(`/deals/${KOPI.id}`)
  })

  it('saves, updates the menu count and buzzes only where vibration exists', async () => {
    auth.session.current = SIGNED_IN
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { ...navigator, vibrate })
    const { wrapper } = await mountAt(`/deals/${KOPI.id}`)
    await wrapper.get('[data-testid="save-deal"]').trigger('click')
    await flushPromises()
    expect(rest.save).toHaveBeenCalledWith(KOPI.id)
    expect(vibrate).toHaveBeenCalledWith(10)
    expect(wrapper.get('[data-testid="save-deal"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="toast"]').text()).toBe('Saved')
    expect(wrapper.get('.brand-menu__count').text()).toBe('1')
  })

  it('rolls the save back with an error toast when the API refuses', async () => {
    auth.session.current = SIGNED_IN
    vi.stubGlobal('navigator', { ...navigator, vibrate: undefined })
    rest.save.mockRejectedValueOnce(new Error('network'))
    const { wrapper } = await mountAt(`/deals/${KOPI.id}`)
    await wrapper.get('[data-testid="save-deal"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="save-deal"]').attributes('aria-pressed')).toBe('false')
    expect(wrapper.get('[data-testid="toast"]').attributes('role')).toBe('alert')
  })
})

describe('map navigation rail', () => {
  it.each([390, 834])(
    'keeps map search bounds and results stable when the sheet expands at %spx',
    async (width) => {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query.includes('min-width: 768px') && width >= 768,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
      vi.stubGlobal('innerWidth', width)
      const { wrapper } = await mountAt('/browse?view=map&split=1')
      map(wrapper).vm.$emit('moved', { south: 0, north: 2, west: 100, east: 105 })
      await flushPromises()
      const searchPadding = map(wrapper).props('searchPadding')
      const coveredBefore = map(wrapper).props('viewPadding').bottom
      expect(rowTitles(wrapper)).toHaveLength(3)
      await wrapper.get('[data-testid="sheet-handle"]').trigger('keydown', { key: 'ArrowUp' })
      await flushPromises()
      expect(map(wrapper).props('viewPadding').bottom).toBeGreaterThan(coveredBefore)
      expect(map(wrapper).props('searchPadding')).toEqual(searchPadding)
      expect(rowTitles(wrapper)).toHaveLength(3)
      map(wrapper).vm.$emit('moved', {
        south: KOPI_VENUE.lat - 0.00001,
        north: KOPI_VENUE.lat + 0.00001,
        west: KOPI_VENUE.lng - 0.00001,
        east: KOPI_VENUE.lng + 0.00001,
      })
      await flushPromises()
      expect(rowTitles(wrapper)).toEqual([KOPI.title])
    },
  )

  it.each([false, true])(
    'opens All Deals from its navigation link, preserving filters (mobile: %s)',
    async (mobile) => {
      if (mobile)
        vi.stubGlobal('matchMedia', (query: string) => ({
          matches: false,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }))
      const { wrapper, router } = await mountAt('/browse?cat=drinks&view=map&split=1')
      await wrapper.get('[data-testid="nav-home"]').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.query).toMatchObject({
        cat: 'drinks',
        view: 'list',
        discovery: '1',
      })
      expect(wrapper.find('[data-testid="food-deal-grid"]').exists()).toBe(true)
      // Desktop's All Deals page has no rail; the phone's bottom bar highlights the tab.
      if (mobile)
        expect(wrapper.get('[data-testid="map-navigation"] a[aria-current="page"]').text()).toBe(
          'All deals',
        )
      else expect(wrapper.find('[data-testid="map-navigation"]').exists()).toBe(false)
    },
  )

  it('uses bottom navigation on phones and hides the unavailable sidebar switch', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    vi.stubGlobal('innerWidth', 390)
    auth.session.current = SIGNED_IN
    const { wrapper, router } = await mountAt('/browse?view=map&split=1')
    expect(wrapper.get('[data-testid="map-navigation"]').classes()).toContain(
      'map-navigation--bottom',
    )
    expect(wrapper.get('[data-testid="map-navigation"] a[aria-current="page"]').text()).toBe('Map')
    // The account slot is a More menu on phones, not the avatar.
    expect(wrapper.get('.map-navigation__account').text()).toBe('More')
    expect(wrapper.find('.map-navigation__avatar').exists()).toBe(false)
    expect(
      (wrapper.get('[data-testid="map-shell"]').element as HTMLElement).style.getPropertyValue(
        '--bottom-nav-h',
      ),
    ).toContain('68px')
    // The bottom nav replaces the menu button: Squad takes its slot in the header.
    expect(wrapper.find('[data-testid="nav-toggle"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="squad-header-button"]').classes()).toContain(
      'squad-nav--compact',
    )
    expect(wrapper.find('[data-testid="show-sidebar"]').exists()).toBe(false)
    await wrapper.get('[data-testid="map-navigation"] a[href^="/saved"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('saved')
    expect(wrapper.get('[data-testid="map-navigation"] a[aria-current="page"]').text()).toBe(
      'Saved',
    )
    expect(wrapper.get('[data-testid="shell-panel"]').classes()).toContain('shell-panel--sheet')
    // Saved is its own tab in the bottom nav, so the page has no account tabs.
    expect(wrapper.find('[role="tablist"][aria-label="Account sections"]').exists()).toBe(false)
  })

  it('opens Account on the menu rows, without a Saved tab, when there is a bottom nav', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    vi.stubGlobal('innerWidth', 390)
    auth.session.current = SIGNED_IN
    const { wrapper } = await mountAt('/me/profile')
    const tabs = wrapper
      .findAll('[aria-label="Account sections"] [role="tab"]')
      .map((tab) => tab.text())
    expect(tabs).toEqual(['More', 'Submitted', 'Settings'])
    expect(wrapper.get('[data-testid="account-more"]').text()).toContain('Log out')
    expect(wrapper.find('[data-testid="account-codes-link"]').exists()).toBe(true)
  })

  it('keeps filters and result preferences when navigating through account, share, saved and deals', async () => {
    auth.session.current = SIGNED_IN
    const choices = {
      q: 'synthetic',
      cat: 'drinks',
      max: '5',
      when: 'week',
      sort: 'ending',
      results: 'list',
    }
    const { wrapper, router } = await mountAt(
      '/browse?q=synthetic&cat=drinks&max=5&when=week&sort=ending&results=list',
    )
    const rail = () => wrapper.get('[data-testid="map-navigation"]')
    for (const path of ['/me/profile', '/saved', '/browse']) {
      await rail().get(`a[href^="${path}"]`).trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.path).toBe(path)
      expect(router.currentRoute.value.query).toMatchObject(choices)
    }
    await wrapper.get('[data-testid="nav-toggle"]').trigger('click')
    await wrapper.get('[data-testid="nav-menu"] a[href^="/me/submissions"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toMatchObject(choices)
  })

  it('opens the full add-deal page from the Share tab', async () => {
    auth.session.current = SIGNED_IN
    const { wrapper, router } = await mountAt('/browse')
    await wrapper.get('[data-testid="map-share"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('submit-deal')
    expect(wrapper.find('[data-testid="map-navigation"]').exists()).toBe(false)
  })

  it('reopens the collapsed deals panel on a same-route click and highlights only the open tab', async () => {
    auth.session.current = SIGNED_IN
    const { wrapper, router } = await mountAt('/browse?view=map&split=1')
    const rail = () => wrapper.get('[data-testid="map-navigation"]')
    const active = () =>
      rail()
        .findAll('a[aria-current="page"]')
        .map((link) => link.get('span:last-child').text())
    expect(active()).toEqual(['Map'])
    await wrapper.get('[data-testid="panel-collapse"]').trigger('click')
    expect(active()).toEqual([])
    await defined(
      rail()
        .findAll('a')
        .find((link) => link.text() === 'Map'),
    ).trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="panel-collapse"]').attributes('aria-expanded')).toBe('true')
    expect(active()).toEqual(['Map'])
    for (const [path, label] of [
      ['/saved', 'Saved'],
      ['/me/profile', 'Account'],
    ]) {
      await router.push(defined(path))
      await flushPromises()
      expect(active()).toEqual([label])
    }
  })
})

describe('brand menu', () => {
  it('keeps the open desktop drawer interactive while disabling only the background', async () => {
    auth.session.current = SIGNED_IN
    const { wrapper, router } = await mountAt('/browse?view=map&split=1')
    await wrapper.get('[data-testid="nav-toggle"]').trigger('click')
    const menu = wrapper.get('[data-testid="nav-menu"]')
    expect(menu.element.closest('[inert]')).toBeNull()
    expect(wrapper.get('.map-shell__map').attributes('inert')).toBeDefined()
    await menu.get('a[href^="/saved"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('saved')
    expect(wrapper.find('[data-testid="nav-menu"]').exists()).toBe(false)
    await wrapper.get('[data-testid="nav-toggle"]').trigger('click')
    await wrapper.get('[data-testid="nav-menu"] a[href^="/browse"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="nav-toggle"]').trigger('click')
    await wrapper.get('[data-testid="nav-menu"] a[href^="/browse"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="nav-menu"]').exists()).toBe(false)
  })

  it('opens the map from the All Deals menu while keeping filters', async () => {
    const { wrapper, router } = await mountAt('/browse?view=list&discovery=1&cat=drinks')
    await wrapper.get('[data-testid="nav-toggle"]').trigger('click')
    await wrapper.get('[data-testid="nav-menu"] a[href^="/browse"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toMatchObject({
      view: 'map',
      split: '1',
      cat: 'drinks',
    })
    expect(wrapper.find('[data-testid="nav-menu"]').exists()).toBe(false)
  })

  it('returns to the landing page after logout', async () => {
    auth.session.current = SIGNED_IN
    auth.signOut.mockImplementationOnce(async () => {
      auth.session.current = SIGNED_OUT
      return { data: { success: true }, error: null }
    })
    const { wrapper, router } = await mountAt('/browse')
    await wrapper.get('[data-testid="nav-toggle"]').trigger('click')
    await wrapper.get('[data-testid="log-out"]').trigger('click')
    await flushPromises()
    expect(auth.signOut).toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('landing')
    expect(router.currentRoute.value.fullPath).toBe('/')
  })

  it('offers Log in and Sign up when signed out, and closes on Escape back to the button', async () => {
    const { wrapper } = await mountAt('/browse')
    const toggle = wrapper.get('[data-testid="nav-toggle"]')
    expect(toggle.attributes('aria-controls')).toBe('site-menu')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    const menu = wrapper.get('[data-testid="nav-menu"]')
    expect(menu.text()).toContain('Log in')
    expect(menu.text()).toContain('Sign up')
    expect(menu.text()).toContain('Add a deal')
    expect(menu.find('[data-testid="log-out"]').exists()).toBe(false)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.find('[data-testid="nav-menu"]').exists()).toBe(false)
    expect(document.activeElement).toBe(toggle.element)
  })

  it('shows the name, saved count and Log out when signed in, and closes on a click outside', async () => {
    auth.session.current = SIGNED_IN
    rest.bookmarks.mockResolvedValue({
      items: [
        { id: '1'.repeat(24), dealId: KOPI.id, savedAt: '2026-10-01T00:00:00.000Z', deal: null },
      ],
      nextCursor: null,
    })
    const { wrapper } = await mountAt('/browse')
    await wrapper.get('[data-testid="nav-toggle"]').trigger('click')
    expect(wrapper.get('[data-testid="signed-in-name"]').text()).toContain('Synthetic Student')
    expect(wrapper.get('[data-testid="saved-count"]').text()).toBe('1 saved deal')
    expect(wrapper.find('[data-testid="log-out"]').exists()).toBe(true)

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(wrapper.find('[data-testid="nav-menu"]').exists()).toBe(false)
  })

  it('closes when the route changes', async () => {
    const { wrapper } = await mountAt('/browse')
    await wrapper.get('[data-testid="nav-toggle"]').trigger('click')
    await wrapper.get('[data-testid="nav-menu"] a[href="/deals"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="nav-menu"]').exists()).toBe(false)
  })
})

describe('filter sheet', () => {
  it('counts matches live, badges the chip, clears, and returns focus on Escape', async () => {
    const { router, wrapper } = await mountAt('/browse')
    const allFilters = wrapper.get('[data-testid="all-filters"]')
    await allFilters.trigger('click')
    await flushPromises()
    const sheet = wrapper.get('[data-testid="filter-sheet"]')
    expect(sheet.attributes('role')).toBe('dialog')
    expect(wrapper.get('[data-testid="filter-show"]').text()).toBe('Show 3 deals')

    const food = sheet.findAll('button').find((button) => button.text().startsWith('Food'))
    expect(food?.text()).toContain('(2)')
    await food?.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.cat).toBeUndefined()
    expect(wrapper.get('[data-testid="filter-show"]').text()).toBe('Show 2 deals')
    await wrapper.get('[data-testid="filter-show"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.cat).toBe('food')
    expect(wrapper.get('[data-testid="filter-badge"]').text()).toContain('1')

    await wrapper.get('[data-testid="all-filters"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="filter-clear"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({})
    expect(wrapper.find('[data-testid="filter-sheet"]').exists()).toBe(false)

    await wrapper.get('[data-testid="all-filters"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="filter-sheet"]').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(wrapper.find('[data-testid="filter-sheet"]').exists()).toBe(false)
    expect(document.activeElement).toBe(allFilters.element)
  })
})

describe('review regressions', () => {
  it('keeps the filter sheet open when its first change leaves a deal panel', async () => {
    const { router, wrapper } = await mountAt(`/deals/${KOPI.id}?at=${KOPI_VENUE.id}`)
    await wrapper.get('[data-testid="all-filters"]').trigger('click')
    await flushPromises()
    const food = wrapper
      .get('[data-testid="filter-sheet"]')
      .findAll('button')
      .find((b) => b.text().startsWith('Food'))
    await food?.trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="filter-show"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('browse')
    // Only shell keys travel to browse; the outlet picker stays behind.
    expect(router.currentRoute.value.query).toEqual({ cat: 'food' })
    expect(wrapper.find('[data-testid="filter-sheet"]').exists()).toBe(false)

    router.back()
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('deal'))
  })

  it('closes the filter sheet when map deal details open and focuses the panel heading', async () => {
    const { router, wrapper } = await mountAt('/browse')
    await wrapper.get('[data-testid="all-filters"]').trigger('click')
    await flushPromises()
    await router.push(`/deals/${KOPI.id}`)
    await flushPromises()
    expect(wrapper.find('[data-testid="filter-sheet"]').exists()).toBe(false)
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(wrapper.get('[data-panel-heading]').element),
    )
  })

  it('uses the standalone login page for legacy merchant login links', async () => {
    const { wrapper } = await mountAt('/login?redirect=/merchant')
    expect(wrapper.get('[data-testid="standalone-auth"] h1').text()).toBe('Welcome back!')
  })

  it('drops a pending search when a panel opens before it fires', async () => {
    vi.useFakeTimers()
    try {
      const { router, wrapper } = await mountAt('/browse')
      await wrapper.get('input[type="search"]').setValue('noodle')
      await router.push(`/deals/${KOPI.id}`)
      await vi.advanceTimersByTimeAsync(500)
      expect(router.currentRoute.value.name).toBe('deal')
    } finally {
      vi.useRealTimers()
    }
  })
})
