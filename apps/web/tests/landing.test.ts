import type { DealPin } from '@broke-oclock/contracts/deals'
import { flushPromises, mount } from '@vue/test-utils'
import CuisineDiscovery from '@web/modules/landing/CuisineDiscovery.vue'
import { regions } from '@web/modules/landing/deals'
import HeroSection from '@web/modules/landing/HeroSection.vue'
import { randomRegionalDeal } from '@web/modules/landing/live-deals'
import ScrollStory from '@web/modules/landing/ScrollStory.vue'
import { storyChapter, storyTimeline } from '@web/modules/landing/story-timeline'
import VotingPreview from '@web/modules/landing/VotingPreview.vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const mocks = vi.hoisted(() => ({
  userId: null as string | null,
  bookmarks: vi.fn(),
  unsave: vi.fn(),
  venue: vi.fn(),
}))
vi.mock('@web/lib/auth-client', () => ({
  authClient: {
    useSession: () =>
      ref({ data: mocks.userId ? { user: { id: mocks.userId } } : null, isPending: false }),
  },
}))
vi.mock('@web/lib/api-client', () => ({
  api: {
    account: { bookmarks: mocks.bookmarks, unsaveDeal: mocks.unsave },
    venues: { get: mocks.venue },
  },
}))

let reduced = false
const wrappers: { unmount: () => void }[] = []
const router = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
const keep = <T extends { unmount: () => void }>(wrapper: T): T => {
  wrappers.push(wrapper)
  return wrapper
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('innerWidth', 1440)
  vi.stubGlobal('innerHeight', 900)
  mocks.userId = null
  mocks.bookmarks.mockReset()
  mocks.unsave.mockReset()
  mocks.venue.mockReset().mockResolvedValue({ venue: { address: '', area: null } })
  vi.stubGlobal('matchMedia', () => ({
    matches: reduced,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  reduced = false
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const liveDeals: DealPin[] = regions.map((region, index) => ({
  id: String(index + 1).padStart(24, '0'),
  title: `${region.name} lunch`,
  category: 'FOOD',
  cuisine: index === 3 ? 'Japanese' : 'Chinese',
  label: '$5',
  description: 'Current promotion',
  offerType: 'FIXED_PRICE',
  priceMinor: index === 3 ? 320 : 500,
  discountPercent: null,
  terms: null,
  validUntil: null,
  rawValidityText: null,
  votes: { alive: 0, dead: 0 },
  commentCount: 0,
  images: [{ url: `https://example.com/${index}.jpg`, alt: region.area }],
  venues: [
    {
      id: String(index + 10).padStart(24, '0'),
      name: region.area,
      lat: region.lat,
      lng: region.lng,
    },
  ],
}))
const liveDealAt = (index: number): DealPin => {
  const deal = liveDeals[index]
  if (!deal) throw new Error('Missing test deal')
  return deal
}
const heroProps = { live: liveDeals, liveState: 'ready' as const }

describe('landing hero', () => {
  it('opens the specific regional deal with its outlet selected', async () => {
    const r = router()
    const wrapper = keep(mount(HeroSection, { props: heroProps, global: { plugins: [r] } }))
    await wrapper.get('.island-marker:nth-child(4)').trigger('click')
    await flushPromises()
    const card = wrapper.get('.hero-live-card')
    expect(card.get('.hero-deal-action').attributes('href')).toBe(
      `/deals/${liveDealAt(3).id}?at=${liveDealAt(3).venues[0]?.id}`,
    )
    expect(card.attributes('aria-label')).toContain('East lunch at Tampines')
    expect(card.text()).toContain('View deal')
    await card.get('.hero-deal-action').trigger('click')
    await flushPromises()
    expect(r.currentRoute.value.path).toBe(`/deals/${liveDealAt(3).id}`)
    expect(r.currentRoute.value.query.at).toBe(liveDealAt(3).venues[0]?.id)
  })
  it('uses the card hierarchy with the restaurant, offer, dates and outlet location', () => {
    const wrapper = keep(mount(HeroSection, { props: heroProps, global: { plugins: [router()] } }))
    const card = wrapper.get('.hero-live-card')
    expect(card.get('.hero-restaurant-name').text()).toBe('Woodlands')
    expect(card.get('.hero-promotion-title').text()).toBe('North lunch')
    expect(card.get('.hero-promotion-period').text()).toContain('End date not provided')
    expect(card.get('.hero-outlet-location').text()).toBe('Woodlands')
    expect(card.find('.hero-deal-badge, b').exists()).toBe(false)
    expect(card.get('.hero-deal-action').text()).toContain('View deal')
  })
  it('shows the selected outlet address instead of the chain outlet count', async () => {
    mocks.venue.mockResolvedValueOnce({
      venue: { address: '1 Woodlands Square, Singapore 738099', area: 'Woodlands' },
    })
    const wrapper = keep(mount(HeroSection, { props: heroProps, global: { plugins: [router()] } }))
    await flushPromises()
    expect(wrapper.get('.hero-outlet-location').text()).toBe('1 Woodlands Square, Singapore 738099')
    expect(wrapper.get('.hero-live-card').text()).not.toContain('participating outlet')
    await wrapper.get('.island-marker:nth-child(4)').trigger('click')
    expect(wrapper.get('.hero-outlet-location').text()).toContain('Tampines')
  })
  it('starts in a populated region when North has no deals', () => {
    const wrapper = keep(
      mount(HeroSection, {
        props: { live: [liveDealAt(3)], liveState: 'ready' },
        global: { plugins: [router()] },
      }),
    )
    expect(wrapper.get('.hero-card-region').text()).toBe('East')
    expect(wrapper.get('.hero-outlet-location').text()).toBe('Tampines')
  })
  it('falls back gracefully when a featured photo cannot load', async () => {
    const wrapper = keep(mount(HeroSection, { props: heroProps, global: { plugins: [router()] } }))
    await wrapper.get('.hero-discovered-food').trigger('error')
    expect(wrapper.get('.hero-food-placeholder').text()).toContain('No photo yet')
    expect(wrapper.get('.hero-deal-action').text()).toContain('View deal')
    await wrapper.get('.island-marker:nth-child(4)').trigger('click')
    expect(wrapper.find('.hero-discovered-food').exists()).toBe(true)
  })
  it('shows a featured deal immediately and changes region only when selected', async () => {
    const wrapper = keep(mount(HeroSection, { props: heroProps, global: { plugins: [router()] } }))
    expect(wrapper.findAll('.island-marker')).toHaveLength(5)
    expect(wrapper.findAll('.food-map-pin')).toHaveLength(5)
    expect(wrapper.get('.hero-deal').text()).toContain('Woodlands')
    expect(wrapper.find('.hero-deal-initial').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(20000)
    expect(wrapper.get('.hero-deal').text()).toContain('Woodlands')
    await wrapper.findAll('.island-marker')[3]?.trigger('click')
    expect(wrapper.get('.hero-deal').text()).toContain('East')
    expect(wrapper.findAll('.island-marker.active')).toHaveLength(1)
  })

  it('replays the selected deal pop without rendering a route overlay', async () => {
    const wrapper = keep(mount(HeroSection, { props: heroProps, global: { plugins: [router()] } }))
    const east = wrapper.get('.island-marker:nth-child(4)')
    await east.trigger('click')
    await flushPromises()
    expect(wrapper.find('.hero-discovery').exists()).toBe(false)
    expect(wrapper.get('.hero-deal').text()).toContain('Tampines')
    const firstPhoto = wrapper.get('.hero-discovered-food').element
    await east.trigger('click')
    expect(wrapper.get('.hero-discovered-food').element).not.toBe(firstPhoto)
    expect(wrapper.findAll('.island-marker.active')).toHaveLength(1)
    expect(wrapper.findAll('.headline-letter')).toHaveLength(18)
  })

  it('responds to landmark taps without pausing ambient motion and clears temporary effects', async () => {
    const wrapper = keep(mount(HeroSection, { props: heroProps, global: { plugins: [router()] } }))
    await wrapper.get('.hero-flyer').trigger('click')
    expect(wrapper.get('.hero-waterfront').classes()).toContain('flyer-spinning')
    await wrapper.get('.hero-merlion').trigger('click')
    await vi.advanceTimersByTimeAsync(30)
    expect(wrapper.get('.hero-waterfront').classes()).toContain('merlion-splashing')
    expect(wrapper.findAll('.merlion-spray-drop')).toHaveLength(14)
    expect(wrapper.findAll('.merlion-burst-ring')).toHaveLength(2)
    await wrapper.get('.hero-map-area').trigger('focusin')
    expect(wrapper.get('.hero-waterfront').classes()).not.toContain('waterfront-paused')
    await vi.advanceTimersByTimeAsync(3200)
    expect(wrapper.get('.hero-waterfront').classes()).not.toContain('flyer-spinning')
    expect(wrapper.get('.hero-waterfront').classes()).not.toContain('merlion-splashing')
    expect(wrapper.find('.merlion-burst').exists()).toBe(false)
    expect(wrapper.get('.hero-deal').text()).toContain('Woodlands')
  })

  it('keeps a selected preview after focus leaves the map', async () => {
    const wrapper = keep(mount(HeroSection, { props: heroProps, global: { plugins: [router()] } }))
    await wrapper.findAll('.island-marker')[3]?.trigger('click')
    await wrapper.get('.hero-map-area').trigger('focusin')
    await wrapper.get('.hero-map-area').trigger('focusout')
    await vi.advanceTimersByTimeAsync(15600)
    expect(wrapper.get('.hero-deal').text()).toContain('East')
  })

  it('keeps decorative motion independent of manual deal selection', async () => {
    const wrapper = keep(mount(HeroSection, { props: heroProps, global: { plugins: [router()] } }))
    await wrapper.get('.hero-map-area').trigger('mouseenter')
    expect(wrapper.classes()).not.toContain('hero-ambient-paused')
    expect(wrapper.get('.hero-waterfront').classes()).not.toContain('waterfront-paused')
    await vi.advanceTimersByTimeAsync(10400)
    expect(wrapper.get('.hero-deal').text()).toContain('Woodlands')
    await wrapper.get('.hero-map-area').trigger('mouseleave')
    await vi.advanceTimersByTimeAsync(5200)
    expect(wrapper.get('.hero-deal').text()).toContain('Woodlands')
  })

  it('keeps the hero still when reduced motion is requested', async () => {
    reduced = true
    const wrapper = keep(mount(HeroSection, { props: heroProps, global: { plugins: [router()] } }))
    await flushPromises()
    expect(wrapper.get('.hero-waterfront').classes()).toContain('waterfront-paused')
    await vi.advanceTimersByTimeAsync(15600)
    expect(wrapper.find('.hero-deal').text()).toContain('Woodlands')
  })
})

describe('live cuisine discovery', () => {
  it('uses the displayed outlet address and retains it through login', async () => {
    mocks.venue.mockImplementation(async (id: string) => ({
      venue: { address: `Address for ${id}` },
    }))
    const r = router()
    const wrapper = keep(mount(CuisineDiscovery, { props: heroProps, global: { plugins: [r] } }))
    await flushPromises()
    const card = wrapper.get('.landing-food-card')
    expect(card.get('.landing-card-location').text()).toBe(
      `Address for ${liveDealAt(0).venues[0]?.id}`,
    )
    expect(card.find('.landing-card-location svg').exists()).toBe(true)
    await card.get('img').trigger('error')
    expect(card.text()).toContain('Photo unavailable')
    const login = card.findAll('a').find((link) => link.text().includes('Log in to save'))
    expect(login).toBeDefined()
    await login?.trigger('click')
    await flushPromises()
    expect(r.currentRoute.value.path).toBe('/login')
    expect(r.currentRoute.value.query.redirect).toBe(
      `/deals/${liveDealAt(0).id}?at=${liveDealAt(0).venues[0]?.id}`,
    )
    expect(wrapper.get('.landing-view-all').attributes('href')).toBe('/browse?cat=food')
  })
  it('keeps the filtered outlet location when an earlier address request finishes late', async () => {
    const north = liveDealAt(0).venues[0]
    const east = liveDealAt(3).venues[0]
    if (!north || !east) throw new Error('Missing test outlets')
    let resolveNorth!: (value: unknown) => void
    mocks.venue.mockImplementation((id: string) =>
      id === north.id
        ? new Promise((resolve) => {
            resolveNorth = resolve
          })
        : Promise.resolve({ venue: { address: '4 Tampines Central 5, Singapore 529510' } }),
    )
    const wrapper = keep(
      mount(CuisineDiscovery, {
        props: { live: [{ ...liveDealAt(0), venues: [north, east] }], liveState: 'ready' },
        global: { plugins: [router()] },
      }),
    )
    await wrapper.get('#deal-area').setValue('3')
    await flushPromises()
    expect(wrapper.get('.landing-card-location').text()).toBe(
      '4 Tampines Central 5, Singapore 529510',
    )
    resolveNorth({ venue: { address: '1 Woodlands Square, Singapore 738099' } })
    await flushPromises()
    expect(wrapper.get('.landing-card-location').text()).toBe(
      '4 Tampines Central 5, Singapore 529510',
    )
    expect(wrapper.get('.landing-card-primary').attributes('href')).toContain(`at=${east.id}`)
  })
  it('shows skeletons while loading and exposes an explicit retry on failure', async () => {
    const wrapper = keep(
      mount(CuisineDiscovery, {
        props: { live: [], liveState: 'loading' },
        global: { plugins: [router()] },
      }),
    )
    expect(wrapper.findAll('.landing-skeleton-card')).toHaveLength(4)
    await wrapper.setProps({ liveState: 'error' })
    await wrapper.get('.landing-deals-error button').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
    expect(wrapper.findAll('.landing-skeleton-card')).toHaveLength(0)
  })

  it('combines live cuisine and region dropdown filters and resets empty results', async () => {
    const wrapper = keep(
      mount(CuisineDiscovery, {
        props: { live: liveDeals, liveState: 'ready' },
        global: { plugins: [router()] },
      }),
    )
    expect(wrapper.findAll('.landing-food-card')).toHaveLength(4)
    await wrapper.get('#deal-cuisine').setValue('Japanese')
    expect(wrapper.findAll('.landing-food-card')).toHaveLength(1)
    await wrapper.get('#deal-area').setValue('3')
    expect(wrapper.get('.landing-food-card').text()).toContain('East lunch')
    expect(wrapper.get('.landing-card-primary').attributes('href')).toBe(
      `/deals/${liveDealAt(3).id}?at=${liveDealAt(3).venues[0]?.id}`,
    )
    expect(wrapper.find('#deal-budget').exists()).toBe(false)
    expect(wrapper.get('.landing-restaurant-name').text()).toBe('Tampines')
    expect(wrapper.get('.landing-deal-title').text()).toBe('East lunch')
    await wrapper.get('#deal-area').setValue('0')
    expect(wrapper.findAll('.landing-food-card')).toHaveLength(0)
    expect(wrapper.get('.cuisine-empty').text()).toContain('No deals match')
    await wrapper.get('.cuisine-empty button').trigger('click')
    expect(wrapper.findAll('.landing-food-card')).toHaveLength(4)
    expect(wrapper.find('.live-deal-preview').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('SAMPLE')
  })
  it('shows supplied promotion periods, Singapore end dates and missing-date fallbacks', () => {
    const deals = [
      { ...liveDealAt(0), rawValidityText: '1 Oct – 30 Nov 2026, weekdays only' },
      { ...liveDealAt(1), validUntil: '2026-11-01T16:00:00.000Z' },
      {
        ...liveDealAt(2),
        rawValidityText: 'Explicit source calendar: start unspecified; end unspecified.',
      },
    ]
    const wrapper = keep(
      mount(CuisineDiscovery, {
        props: { live: deals, liveState: 'ready' },
        global: { plugins: [router()] },
      }),
    )
    const dates = wrapper.findAll('.landing-promotion-dates')
    expect(dates[0]?.text()).toContain('1 Oct – 30 Nov 2026, weekdays only')
    expect(dates[1]?.text()).toContain('Until 1 Nov 2026')
    expect(dates[2]?.text()).toContain('End date not provided')
  })
  it('pages through sets of four and resets to the first set after filtering', async () => {
    const wrapper = keep(
      mount(CuisineDiscovery, {
        props: { live: liveDeals, liveState: 'ready' },
        global: { plugins: [router()] },
      }),
    )
    const previous = () => wrapper.get('[aria-label="Previous deals"]')
    const next = () => wrapper.get('[aria-label="Next deals"]')
    expect(previous().attributes('disabled')).toBeDefined()
    expect(wrapper.findAll('.landing-food-card')).toHaveLength(4)
    await next().trigger('click')
    expect(wrapper.findAll('.landing-food-card')).toHaveLength(1)
    expect(wrapper.get('.landing-deal-title').text()).toBe('Central lunch')
    expect(next().attributes('disabled')).toBeDefined()
    expect(wrapper.get('.landing-carousel-status').text()).toContain('Showing 5–5 of 5 deals')
    await previous().trigger('click')
    expect(wrapper.findAll('.landing-food-card')).toHaveLength(4)
    await next().trigger('click')
    await wrapper.get('#deal-cuisine').setValue('Japanese')
    expect(wrapper.get('.landing-deal-title').text()).toBe('East lunch')
    expect(previous().attributes('disabled')).toBeDefined()
    expect(next().attributes('disabled')).toBeDefined()
    expect(wrapper.get('.landing-carousel-status').text()).toContain('Showing 1–1 of 1 deals')
  })
  it('shows one card on mobile, two on tablet and four on desktop', async () => {
    vi.stubGlobal('innerWidth', 390)
    const wrapper = keep(
      mount(CuisineDiscovery, {
        props: { live: liveDeals, liveState: 'ready' },
        global: { plugins: [router()] },
      }),
    )
    await flushPromises()
    expect(wrapper.findAll('.landing-food-card')).toHaveLength(1)
    await wrapper.get('[aria-label="Next deals"]').trigger('click')
    expect(wrapper.get('.landing-deal-title').text()).toBe('North-East lunch')
    vi.stubGlobal('innerWidth', 900)
    window.dispatchEvent(new Event('resize'))
    await flushPromises()
    expect(wrapper.findAll('.landing-food-card')).toHaveLength(2)
    expect(wrapper.get('.landing-carousel-status').text()).toContain('Showing 1–2')
    vi.stubGlobal('innerWidth', 1440)
    window.dispatchEvent(new Event('resize'))
    await flushPromises()
    expect(wrapper.findAll('.landing-food-card')).toHaveLength(4)
  })
  it('supports horizontal swipes while preserving vertical scrolling and filter resets', async () => {
    vi.stubGlobal('innerWidth', 390)
    const wrapper = keep(
      mount(CuisineDiscovery, {
        props: { live: liveDeals, liveState: 'ready' },
        global: { plugins: [router()] },
      }),
    )
    await flushPromises()
    const track = wrapper.get('#landing-deal-carousel')
    await track.trigger('touchstart', { touches: [{ clientX: 280, clientY: 100 }] })
    await track.trigger('touchend', { changedTouches: [{ clientX: 80, clientY: 105 }] })
    expect(wrapper.get('.landing-deal-title').text()).toBe('North-East lunch')
    await track.trigger('touchstart', { touches: [{ clientX: 280, clientY: 100 }] })
    await track.trigger('touchend', { changedTouches: [{ clientX: 250, clientY: 350 }] })
    expect(wrapper.get('.landing-deal-title').text()).toBe('North-East lunch')
    await track.trigger('touchstart', { touches: [{ clientX: 80, clientY: 100 }] })
    await track.trigger('touchend', { changedTouches: [{ clientX: 280, clientY: 105 }] })
    expect(wrapper.get('.landing-deal-title').text()).toBe('North lunch')
    await wrapper.get('#deal-cuisine').setValue('Japanese')
    expect(wrapper.get('.landing-deal-title').text()).toBe('East lunch')
    expect(wrapper.get('.landing-carousel-status').text()).toContain('Showing 1–1')
  })
  it('keeps long outlet lists out of cards and opens a searchable outlet picker', async () => {
    const chain = { ...liveDealAt(0), venues: liveDeals.flatMap((deal) => deal.venues) }
    const wrapper = keep(
      mount(CuisineDiscovery, {
        props: { live: [chain], liveState: 'ready' },
        global: { plugins: [router()] },
      }),
    )
    // jsdom does not implement the native dialog lifecycle.
    const dialog = wrapper.get('dialog').element
    const show = vi.fn(() => dialog.setAttribute('open', ''))
    const close = vi.fn(() => dialog.removeAttribute('open'))
    Object.defineProperties(dialog, { showModal: { value: show }, close: { value: close } })
    expect(wrapper.get('#cuisine-heading').text()).toContain("We've got some lobangs for you.")
    expect(wrapper.get('.landing-food-card').text()).toContain('+4 more outlets')
    expect(wrapper.get('.landing-food-card').text()).not.toContain('Tampines')
    await wrapper.get('.landing-outlet-button').trigger('click')
    expect(show).toHaveBeenCalledOnce()
    expect(wrapper.findAll('.landing-outlet-list li')).toHaveLength(5)
    await wrapper.get('#landing-outlet-search').setValue('tampines')
    expect(wrapper.findAll('.landing-outlet-list li')).toHaveLength(1)
    expect(wrapper.get('.landing-outlet-list a').attributes('href')).toBe(
      `/deals/${liveDealAt(0).id}?at=${liveDealAt(3).venues[0]?.id}`,
    )
    await wrapper.get('#landing-outlet-search').setValue('no such outlet')
    expect(wrapper.text()).toContain('No outlets match your search')
    await wrapper.get('[aria-label="Close outlets"]').trigger('click')
    expect(close).toHaveBeenCalledOnce()
  })
  it('shows loading, error and empty states without sample deals', async () => {
    const wrapper = keep(
      mount(CuisineDiscovery, {
        props: { live: [], liveState: 'loading' },
        global: { plugins: [router()] },
      }),
    )
    expect(wrapper.text()).toContain('Loading current food deals')
    await wrapper.setProps({ liveState: 'error' })
    expect(wrapper.text()).toContain("Deals couldn't load")
    await wrapper.setProps({ liveState: 'ready' })
    expect(wrapper.text()).toContain('No current food deals yet')
    expect(wrapper.findAll('.landing-food-card')).toHaveLength(0)
  })
})

describe('regional hero selection', () => {
  it('chooses only deals and outlets in the requested region', () => {
    const chain = {
      ...liveDealAt(0),
      id: '000000000000000000000099',
      venues: [...liveDealAt(4).venues, ...liveDealAt(0).venues],
    }
    const pool = [...liveDeals, chain]
    expect(randomRegionalDeal(pool, 'North', () => 0)?.deal.id).toBe(liveDealAt(0).id)
    expect(randomRegionalDeal(pool, 'North', () => 0.99)?.venue.name).toBe('Woodlands')
    expect(randomRegionalDeal([liveDealAt(3)], 'North')).toBeNull()
  })
  it('renders an honest empty state when a region has no deals', () => {
    const wrapper = keep(
      mount(HeroSection, {
        props: { live: [], liveState: 'ready' },
        global: { plugins: [router()] },
      }),
    )
    expect(wrapper.text()).toContain('No current deals in this region yet')
    expect(wrapper.find('a.hero-deal').exists()).toBe(false)
  })
})

describe('live bookmark integration', () => {
  const liveDeal: DealPin = {
    id: '000000000000000000000001',
    title: 'Live lunch deal',
    category: 'FOOD',
    cuisine: null,
    label: '$5',
    description: 'A real API-shaped promotion.',
    offerType: 'FIXED_PRICE',
    priceMinor: 500,
    discountPercent: null,
    terms: null,
    validUntil: null,
    rawValidityText: null,
    votes: { alive: 0, dead: 0 },
    commentCount: 0,
    images: [],
    venues: [],
  }
  it('reads saved state across pages and reuses the existing unsave action', async () => {
    mocks.userId = 'signed-in-user'
    mocks.bookmarks
      .mockResolvedValueOnce({ items: [], nextCursor: 'older-page' })
      .mockResolvedValueOnce({ items: [{ dealId: liveDeal.id }], nextCursor: null })
    mocks.unsave.mockResolvedValue({ saved: false })
    const wrapper = keep(
      mount(CuisineDiscovery, {
        props: { live: [liveDeal], liveState: 'ready' },
        global: { plugins: [router()] },
      }),
    )
    await flushPromises()
    expect(mocks.bookmarks).toHaveBeenLastCalledWith({ limit: 50, cursor: 'older-page' })
    expect(wrapper.get('.landing-deal-grid button').text()).toBe('Saved')
    await wrapper.get('.landing-deal-grid button').trigger('click')
    await flushPromises()
    expect(mocks.unsave).toHaveBeenCalledWith(liveDeal.id)
    expect(wrapper.get('.landing-deal-grid button').text()).toBe('Save')
  })

  it('offers the saved-deals page if existing bookmark state cannot load', async () => {
    mocks.userId = 'signed-in-user'
    mocks.bookmarks.mockRejectedValue(new Error('offline'))
    const wrapper = keep(
      mount(CuisineDiscovery, {
        props: { live: [liveDeal], liveState: 'ready' },
        global: { plugins: [router()] },
      }),
    )
    await flushPromises()
    expect(wrapper.find('.landing-deal-grid button').exists()).toBe(false)
    expect(wrapper.get('.landing-deal-grid a[href="/saved"]').text()).toBe('Manage saved deals')
  })
})

describe('neighbourhood story', () => {
  const story = () =>
    keep(
      mount(ScrollStory, {
        global: { plugins: [router()], stubs: { FloatingSocialPost: true } },
      }),
    )
  it('keeps the same selected card and photograph throughout the reversible stall handoff', async () => {
    const wrapper = story()
    let progress = 0.43
    vi.spyOn(wrapper.element, 'getBoundingClientRect').mockImplementation(
      () => ({ top: -progress * (6000 - window.innerHeight), height: 6000 }) as DOMRect,
    )
    window.dispatchEvent(new Event('scroll'))
    await vi.advanceTimersByTimeAsync(30)
    await flushPromises()
    const map = wrapper.get('.story-camera .island-art').element
    progress = 0.79
    window.dispatchEvent(new Event('scroll'))
    await vi.advanceTimersByTimeAsync(30)
    const travelling = wrapper.get('.travelling-deal').element
    const photograph = wrapper.get('.community-food-photo').element
    expect(wrapper.get('.travelling-deal').text()).toContain('Everyday Chicken Rice')
    expect(wrapper.get('.travelling-deal').text()).toContain('Novena')
    for (progress of [0.8, 0.835, 0.875, 0.96]) {
      window.dispatchEvent(new Event('scroll'))
      await vi.advanceTimersByTimeAsync(30)
      expect(wrapper.get('.travelling-deal').element).toBe(travelling)
      expect(wrapper.get('.community-food-photo').element).toBe(photograph)
      expect(wrapper.get('.story-camera .island-art').element).toBe(map)
      expect(Number((travelling as HTMLElement).style.opacity)).toBeGreaterThan(0.9)
    }
    expect(wrapper.get('.travelling-deal').classes()).toContain('shared-deal-sign')
    expect(wrapper.get('.travelling-deal').text()).toContain('LOBANGERS · SAMPLE STALL')
    progress = 0.4
    window.dispatchEvent(new Event('scroll'))
    await vi.advanceTimersByTimeAsync(30)
    expect(wrapper.get('.story-camera .island-marker.active').text()).toContain('Central')
  })

  it('removes the location panel, hints, tagline and manual still button', () => {
    const wrapper = story()
    expect(wrapper.find('.neighbourhood-controls').exists()).toBe(false)
    expect(wrapper.find('.story-hint').exists()).toBe(false)
    expect(wrapper.find('.story-still-toggle').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('A GOOD LOBANG IS WORTH FINDING.')
    expect(wrapper.text()).not.toContain('Nearest listed deal:')
  })
  it('always uses Central without reading location or permissions', async () => {
    const query = vi.fn().mockResolvedValue({ state: 'granted' })
    const getCurrentPosition = vi.fn()
    vi.stubGlobal('navigator', { permissions: { query }, geolocation: { getCurrentPosition } })
    const wrapper = story()
    await flushPromises()
    expect(wrapper.get('.story-camera .island-marker.active').text()).toContain('Central')
    expect(query).not.toHaveBeenCalled()
    expect(getCurrentPosition).not.toHaveBeenCalled()
    expect(wrapper.find('#story-area, .location-message').exists()).toBe(false)
  })
  it('renders a completed, unpinned hawker scene for reduced motion', async () => {
    reduced = true
    const wrapper = story()
    await vi.advanceTimersByTimeAsync(30)
    expect(wrapper.classes()).toContain('story-reduced')
    expect(wrapper.find('.reduced-story-summary').exists()).toBe(true)
    expect(wrapper.get('.travelling-deal').text()).toContain('LOBANGERS · SAMPLE STALL')
  })
  it('uses the complete still layout on compact screens', async () => {
    vi.stubGlobal('innerWidth', 320)
    vi.stubGlobal('innerHeight', 740)
    const wrapper = story()
    await vi.advanceTimersByTimeAsync(30)
    expect(wrapper.classes()).toContain('story-reduced')
    expect(wrapper.get('.community-freshness').classes()).toContain('is-static')
    expect(wrapper.findAll('.community-report')).toHaveLength(5)
    expect(wrapper.get('.community-signup').attributes('href')).toBe('/register')
  })
})

describe('prototype motion choreography', () => {
  it('runs all prototype stages in order and reverses deterministically', () => {
    expect([0.02, 0.17, 0.3, 0.42, 0.49, 0.6, 0.77, 0.86, 0.98].map(storyChapter)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ])
    expect(storyTimeline(0.3).handoff).toBeGreaterThan(0)
    expect(storyTimeline(0.42).handoff).toBe(1)
    expect(storyTimeline(0.49).scanner).toBeGreaterThan(0.9)
    expect(storyTimeline(0.6).zoom).toBeGreaterThan(0)
    expect(storyTimeline(0.6).route).toBeGreaterThan(0)
    expect(storyTimeline(0.67).portalPin).toBeGreaterThan(0.9)
    expect(storyTimeline(0.7).portal).toBeGreaterThan(0)
    const forward = storyTimeline(0.86)
    expect(forward.offer).toBe(1)
    expect(forward.transfer).toBeGreaterThan(0.9)
    expect(forward.transfer).toBe(1)
    expect(storyTimeline(0.86)).toEqual(forward)
    expect(storyTimeline(0.42).zoom).toBe(0)
  })

  it('keeps one consistently styled toggle throughout playback and pause', async () => {
    const wrapper = keep(
      mount(ScrollStory, {
        global: { plugins: [router()], stubs: { FloatingSocialPost: true } },
      }),
    )
    Object.defineProperty(wrapper.element, 'offsetHeight', { value: 6000 })
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    let progress = 0
    vi.spyOn(wrapper.element, 'getBoundingClientRect').mockImplementation(
      () => ({ top: -progress * (6000 - window.innerHeight), height: 6000 }) as DOMRect,
    )
    const toggle = wrapper.get('.story-playback-toggle')
    const element = toggle.element
    expect(toggle.text()).toContain('Auto-play story')
    await toggle.trigger('click')
    for (progress of [0.1, 0.49, 0.8]) {
      window.dispatchEvent(new Event('scroll'))
      await vi.advanceTimersByTimeAsync(30)
      expect(wrapper.findAll('.story-playback-toggle')).toHaveLength(1)
      expect(wrapper.get('.story-playback-toggle').element).toBe(element)
      expect(toggle.text()).toContain('Pause story')
      expect(
        wrapper.findAll('.story-pause, .story-playback-stop, .story-play-controls'),
      ).toHaveLength(0)
    }
    await toggle.trigger('click')
    expect(toggle.attributes('aria-pressed')).toBe('false')
    expect(toggle.text()).toContain('Auto-play story')
    expect(wrapper.findAll('.story-playback-toggle')).toHaveLength(1)
    scroll.mockRestore()
  })

  it('lets a visitor interrupt explicitly started story playback', async () => {
    const wrapper = keep(
      mount(ScrollStory, {
        global: { plugins: [router()], stubs: { FloatingSocialPost: true } },
      }),
    )
    Object.defineProperty(wrapper.element, 'offsetHeight', { value: 6000 })
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const play = wrapper.get('.story-playback-toggle')
    await play?.trigger('click')
    await vi.advanceTimersByTimeAsync(60)
    expect(scroll).toHaveBeenCalled()
    window.dispatchEvent(new Event('wheel'))
    const calls = scroll.mock.calls.length
    await vi.advanceTimersByTimeAsync(200)
    expect(scroll).toHaveBeenCalledTimes(calls)
    expect(play?.attributes('aria-pressed')).toBe('false')
    scroll.mockRestore()
  })
})

describe('public voting preview', () => {
  it('has no actionable controls, no changing totals and no network submission', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const send = vi.spyOn(XMLHttpRequest.prototype, 'send')
    const wrapper = keep(mount(VotingPreview))
    const before = wrapper.html()
    expect(wrapper.findAll('button, input, [role="button"], [tabindex]')).toHaveLength(0)
    await wrapper.get('.preview-still-on').trigger('click')
    await wrapper.get('.preview-gone').trigger('click')
    expect(wrapper.html()).toBe(before)
    expect(wrapper.text()).toContain('Members can vote')
    expect(fetch).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    send.mockRestore()
  })
})
