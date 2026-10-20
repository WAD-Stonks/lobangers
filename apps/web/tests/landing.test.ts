import type { DealPin } from '@broke-oclock/contracts/deals'
import { flushPromises, mount } from '@vue/test-utils'
import CuisineDiscovery from '@web/modules/landing/CuisineDiscovery.vue'
import HeroSection from '@web/modules/landing/HeroSection.vue'
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
}))
vi.mock('@web/lib/auth-client', () => ({
  authClient: {
    useSession: () =>
      ref({ data: mocks.userId ? { user: { id: mocks.userId } } : null, isPending: false }),
  },
}))
vi.mock('@web/lib/api-client', () => ({
  api: { account: { bookmarks: mocks.bookmarks, unsaveDeal: mocks.unsave } },
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

describe('landing hero', () => {
  it('opens public deal discovery from the whole featured card and labels it as illustrative', async () => {
    const r = router()
    const wrapper = keep(mount(HeroSection, { global: { plugins: [r] } }))
    await wrapper.get('.island-marker:nth-child(4)').trigger('click')
    await flushPromises()
    const card = wrapper.get('a.hero-deal')
    expect(card.attributes('href')).toBe('/browse')
    expect(card.attributes('aria-label')).toContain('Sunday Scoops illustrative offer')
    expect(card.text()).toContain('Explore food deals')
    await card.trigger('click')
    await flushPromises()
    expect(r.currentRoute.value.path).toBe('/browse')
  })
  it('rotates five sample regions without dropping inactive markers and can pause', async () => {
    const wrapper = keep(mount(HeroSection, { global: { plugins: [router()] } }))
    expect(wrapper.findAll('.island-marker')).toHaveLength(5)
    expect(wrapper.findAll('.food-map-pin')).toHaveLength(5)
    expect(wrapper.findAll('.island-marker.active')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(5200)
    expect(wrapper.find('.hero-deal').text()).toContain('Sengkang')
    expect(wrapper.findAll('.island-marker')).toHaveLength(5)
    await wrapper.get('.hero-map-area').trigger('focusin')
    await vi.advanceTimersByTimeAsync(10400)
    expect(wrapper.find('.hero-deal').text()).toContain('Sengkang')
    await wrapper.findAll('.island-marker')[3]?.trigger('click')
    expect(wrapper.find('.hero-deal').text()).toContain('Tampines')
  })

  it('replays the selected deal pop without rendering a route overlay', async () => {
    const wrapper = keep(mount(HeroSection, { global: { plugins: [router()] } }))
    const east = wrapper.get('.island-marker:nth-child(4)')
    await east.trigger('click')
    await flushPromises()
    expect(wrapper.find('.hero-discovery').exists()).toBe(false)
    expect(wrapper.get('.hero-deal').text()).toContain('Sunday Scoops')
    const firstPhoto = wrapper.get('.hero-discovered-food').element
    await east.trigger('click')
    expect(wrapper.get('.hero-discovered-food').element).not.toBe(firstPhoto)
    expect(wrapper.findAll('.island-marker.active')).toHaveLength(1)
    expect(wrapper.findAll('.headline-letter')).toHaveLength(18)
  })

  it('responds to landmark taps without pausing ambient motion and clears temporary effects', async () => {
    const wrapper = keep(mount(HeroSection, { global: { plugins: [router()] } }))
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
    const wrapper = keep(mount(HeroSection, { global: { plugins: [router()] } }))
    await wrapper.findAll('.island-marker')[3]?.trigger('click')
    await wrapper.get('.hero-map-area').trigger('focusin')
    await wrapper.get('.hero-map-area').trigger('focusout')
    await vi.advanceTimersByTimeAsync(15600)
    expect(wrapper.get('.hero-deal').text()).toContain('Tampines')
  })

  it('keeps landmarks moving while hover holds the current deal preview', async () => {
    const wrapper = keep(mount(HeroSection, { global: { plugins: [router()] } }))
    await wrapper.get('.hero-map-area').trigger('mouseenter')
    expect(wrapper.classes()).not.toContain('hero-ambient-paused')
    expect(wrapper.get('.hero-waterfront').classes()).not.toContain('waterfront-paused')
    await vi.advanceTimersByTimeAsync(10400)
    expect(wrapper.get('.hero-deal').text()).toContain('Woodlands')
    await wrapper.get('.hero-map-area').trigger('mouseleave')
    await vi.advanceTimersByTimeAsync(5200)
    expect(wrapper.get('.hero-deal').text()).toContain('Sengkang')
  })

  it('keeps the hero still when reduced motion is requested', async () => {
    reduced = true
    const wrapper = keep(mount(HeroSection, { global: { plugins: [router()] } }))
    await flushPromises()
    expect(wrapper.get('.hero-waterfront').classes()).toContain('waterfront-paused')
    await vi.advanceTimersByTimeAsync(15600)
    expect(wrapper.find('.hero-deal').text()).toContain('Woodlands')
  })
})

describe('sample cuisine discovery', () => {
  it('combines cuisine, neighbourhood and price filters and recovers from empty results', async () => {
    const wrapper = keep(
      mount(CuisineDiscovery, {
        props: { live: [], liveState: 'ready' },
        global: { plugins: [router()] },
      }),
    )
    const cuisine = (name: string) =>
      wrapper.findAll('.cuisine-filters button').find((button) => button.text() === name)
    expect(wrapper.findAll('.landing-food-card')).toHaveLength(8)
    await cuisine('Others')?.trigger('click')
    expect(wrapper.findAll('.landing-food-card')).toHaveLength(2)
    await wrapper.get('#sample-area').setValue('3')
    expect(wrapper.findAll('.landing-food-card')).toHaveLength(1)
    expect(wrapper.find('.landing-food-card').text()).toContain('Sunday Scoops')
    await wrapper.get('#sample-budget').setValue('3')
    expect(wrapper.findAll('.landing-food-card')).toHaveLength(0)
    expect(wrapper.get('.cuisine-empty').text()).toContain('No sample deals')
    await wrapper.get('.cuisine-empty button').trigger('click')
    expect(wrapper.findAll('.landing-food-card')).toHaveLength(8)
    expect(wrapper.text()).toContain('not current promotions')
  })
})

describe('live bookmark integration', () => {
  const liveDeal: DealPin = {
    id: '000000000000000000000001',
    title: 'Live lunch deal',
    category: 'FOOD',
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
    expect(wrapper.get('.live-deal-list button').text()).toBe('Saved')
    await wrapper.get('.live-deal-list button').trigger('click')
    await flushPromises()
    expect(mocks.unsave).toHaveBeenCalledWith(liveDeal.id)
    expect(wrapper.get('.live-deal-list button').text()).toBe('Save')
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
    expect(wrapper.find('.live-deal-list button').exists()).toBe(false)
    expect(wrapper.get('.live-deal-list a[href="/saved"]').text()).toBe('Manage saved deals')
  })
})

describe('neighbourhood story', () => {
  const story = () =>
    keep(
      mount(ScrollStory, {
        props: { liveDeals: [] },
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
    await wrapper.get('#story-area').setValue('3')
    const map = wrapper.get('.story-camera .island-art').element
    progress = 0.79
    window.dispatchEvent(new Event('scroll'))
    await vi.advanceTimersByTimeAsync(30)
    const travelling = wrapper.get('.travelling-deal').element
    const photograph = wrapper.get('.community-food-photo').element
    expect(wrapper.get('.travelling-deal').text()).toContain('Sunday Scoops')
    expect(wrapper.get('.travelling-deal').text()).toContain('Tampines')
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
    expect(wrapper.get('#story-area').element).toHaveProperty('value', '3')
  })

  it('requests location only on interaction and explains permission denial', async () => {
    const getCurrentPosition = vi.fn((_ok: PositionCallback, fail: PositionErrorCallback) =>
      fail({ code: 1 } as GeolocationPositionError),
    )
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
    const wrapper = story()
    expect(getCurrentPosition).not.toHaveBeenCalled()
    await wrapper.get('.neighbourhood-controls button').trigger('click')
    await flushPromises()
    expect(getCurrentPosition).toHaveBeenCalledOnce()
    expect(wrapper.get('.location-message').text()).toContain('choose a neighbourhood')
  })

  it('renders a completed, unpinned hawker scene for reduced motion', async () => {
    reduced = true
    const wrapper = story()
    await vi.advanceTimersByTimeAsync(30)
    expect(wrapper.classes()).toContain('story-reduced')
    expect(wrapper.find('.reduced-story-summary').exists()).toBe(true)
    expect(wrapper.get('.travelling-deal').text()).toContain('LOBANGERS · SAMPLE STALL')
  })
  it('offers a still version without changing the chosen deal or adding voting actions', async () => {
    const wrapper = story()
    await wrapper.get('#story-area').setValue('1')
    await wrapper.get('.story-still-toggle').trigger('click')
    await flushPromises()
    expect(wrapper.classes()).toContain('story-reduced')
    expect(wrapper.get('.shared-deal-sign').text()).toContain('Neighbourhood Tea Co.')
    expect(wrapper.get('.community-freshness').classes()).toContain('is-static')
    expect(wrapper.findAll('.voting-preview-options button')).toHaveLength(0)
    await wrapper.get('.story-still-toggle').trigger('click')
    await flushPromises()
    expect(wrapper.classes()).not.toContain('story-reduced')
    expect(wrapper.get('#story-area').element).toHaveProperty('value', '1')
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

  it('lets a visitor interrupt explicitly started story playback', async () => {
    const wrapper = keep(
      mount(ScrollStory, {
        props: { liveDeals: [] },
        global: { plugins: [router()], stubs: { FloatingSocialPost: true } },
      }),
    )
    Object.defineProperty(wrapper.element, 'offsetHeight', { value: 6000 })
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const play = wrapper.findAll('.story-play-controls button')[1]
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
