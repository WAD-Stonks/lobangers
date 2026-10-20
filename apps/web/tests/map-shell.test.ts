import { flushPromises, type VueWrapper } from '@vue/test-utils'
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
  wrapper.findAll('[data-testid="nearby-list"] .deal-rows__title').map((title) => title.text())
const chip = (wrapper: VueWrapper, label: string) =>
  wrapper
    .findAll('[data-testid="quick-chips"] button')
    .find((button) => button.text().includes(label))
const map = (wrapper: VueWrapper) => wrapper.findComponent({ name: 'DealMap' })

beforeEach(() => {
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
})

describe('browse panel', () => {
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

  it('applies the Under $5 chip to the URL, the list and the pins, and Back undoes it', async () => {
    const { router, wrapper } = await mountAt('/browse')
    await chip(wrapper, 'Under $5')?.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.max).toBe('5')
    expect(chip(wrapper, 'Under $5')?.attributes('aria-pressed')).toBe('true')
    // A price cap keeps deals without a fixed price, like the API does.
    expect(rowTitles(wrapper)).toEqual(['Synthetic iced kopi', 'Synthetic chicken rice'])
    expect(wrapper.text()).toContain('Up to $5.00')

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

  it('switches to the list view and back from the toggle', async () => {
    const { router, wrapper } = await mountAt('/browse')
    const toggle = () => wrapper.get('[data-testid="panel-toggle"]')
    expect(toggle().attributes('aria-label')).toBe('Show list')
    await toggle().trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.view).toBe('list')
    expect(toggle().attributes('aria-label')).toBe('Show map')
    expect(wrapper.findAll('[data-testid="deal-cards"] li')).toHaveLength(3)
  })

  it('highlights the pin for a hovered row, and the row for a hovered pin', async () => {
    const { wrapper } = await mountAt('/browse')
    await wrapper.get('[data-testid="nearby-list"] a').trigger('mouseenter')
    expect(map(wrapper).props('hoveredVenueId')).toBe(KOPI_VENUE.id)

    map(wrapper).vm.$emit('hover', HAWKER_VENUE.id)
    await flushPromises()
    const hot = wrapper.findAll('[data-testid="nearby-list"] a.is-hot').map((row) => row.text())
    expect(hot).toHaveLength(2)
    expect(hot[0]).toContain('Synthetic noodle set')
  })
})

describe('opening deals and venues', () => {
  it('opens a deal from a row, focuses the map on it and links back with the filters', async () => {
    const { router, wrapper } = await mountAt('/browse?cat=drinks')
    await wrapper.get('[data-testid="nearby-list"] a').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('deal')
    expect(router.currentRoute.value.params.dealId).toBe(KOPI.id)
    await vi.waitFor(() =>
      expect(wrapper.get('[data-testid="shell-panel"] h1').text()).toBe('Synthetic iced kopi'),
    )
    expect(map(wrapper).props('selectedVenueId')).toBe(KOPI_VENUE.id)
    expect(map(wrapper).props('focus')).toEqual({ lat: KOPI_VENUE.lat, lng: KOPI_VENUE.lng })
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

  it('opens the ending-soon card deal in the same deal panel', async () => {
    const { router, wrapper } = await mountAt('/browse')
    expect(wrapper.get('[data-testid="hot-card"]').text()).toContain('Synthetic noodle set')
    await wrapper.get('[data-testid="hot-open"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('deal')
    expect(router.currentRoute.value.params.dealId).toBe(NOODLES.id)
  })
})

describe('saving from the deal panel', () => {
  it('sends a signed-out visitor to log in and back', async () => {
    const { router, wrapper } = await mountAt(`/deals/${KOPI.id}`)
    await wrapper.get('[data-testid="save-deal"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('login')
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

describe('brand menu', () => {
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
    await wrapper.get('[data-testid="nav-menu"] a[href="/getting-started"]').trigger('click')
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
    expect(router.currentRoute.value.query.cat).toBe('food')
    expect(wrapper.get('[data-testid="filter-show"]').text()).toBe('Show 2 deals')
    expect(wrapper.get('[data-testid="filter-badge"]').text()).toContain('1')

    await wrapper.get('[data-testid="filter-clear"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({})

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
    expect(router.currentRoute.value.name).toBe('browse')
    // Only shell keys travel to browse; the outlet picker stays behind.
    expect(router.currentRoute.value.query).toEqual({ cat: 'food' })
    expect(wrapper.find('[data-testid="filter-sheet"]').exists()).toBe(true)

    router.back()
    await flushPromises()
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('deal'))
  })

  it('closes the sheet when a panel opens and moves focus to its heading', async () => {
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

  it('names the merchant panel, not the account, when bounced to log in', async () => {
    const { wrapper } = await mountAt('/login?redirect=/merchant')
    expect(wrapper.get('[data-panel-heading]').text()).toBe('Log in to manage your stall')
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
