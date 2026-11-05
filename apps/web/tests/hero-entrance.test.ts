import { flushPromises, mount } from '@vue/test-utils'
import { useHeroEntrance } from '@web/modules/browse-map/use-hero-entrance'
import { defined } from '@web-tests/support/defined'
import { gsap } from 'gsap'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'

let intersection: IntersectionObserverCallback
const disconnect = vi.fn()
let preference: {
  matches: boolean
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
}
const wrappers: ReturnType<typeof mount>[] = []
const Harness = defineComponent({
  props: { initiallyReady: { type: Boolean, default: true } },
  setup(props) {
    const root = ref<HTMLElement | null>(null)
    const greeting = ref('Hey food lover,')
    const ready = ref(props.initiallyReady)
    useHeroEntrance(root, greeting, ready)
    return { root, greeting, ready }
  },
  template: `<section ref="root"><h2><span class="all-deals-hero__greeting"><span data-hero-word>Hey</span><span data-hero-word>{{ greeting }}</span></span><span class="all-deals-hero__headline"><span data-hero-word>ready</span><span data-hero-word>lobang?</span></span></h2><svg class="all-deals-hero__accent--coral"><path d="M0 0L5 5" /></svg><svg class="all-deals-hero__accent--yellow"><path d="M0 0L5 5" /></svg><svg><path data-hero-underline d="M0 0L5 5" /></svg><p data-hero-subtitle>Explore deals</p><button data-testid="show-map">Show map</button><img alt="Map" /></section>`,
})
const mountHero = (initiallyReady = true) => {
  const wrapper = mount(Harness, { props: { initiallyReady } })
  wrappers.push(wrapper)
  return wrapper
}
const enter = () =>
  intersection([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
const firstFrame = () => gsap.ticker.tick()

beforeEach(() => {
  preference = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }
  vi.stubGlobal('matchMedia', () => preference)
  disconnect.mockClear()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersection = callback
      }
      observe = vi.fn()
      disconnect = disconnect
    },
  )
})
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('mini-hero entrance', () => {
  it('waits for visibility, runs once, and leaves the image untouched', () => {
    const spy = vi.spyOn(gsap, 'timeline')
    const wrapper = mountHero()
    const timeline = defined(spy.mock.results[0]).value as gsap.core.Timeline
    expect(timeline.paused()).toBe(true)
    firstFrame()
    expect(timeline.paused()).toBe(true)
    expect(wrapper.get('[data-hero-word]').attributes('style')).toContain('opacity: 0')
    const play = vi.spyOn(timeline, 'play')
    enter()
    enter()
    expect(play).toHaveBeenCalledTimes(1)
    expect(disconnect).toHaveBeenCalled()
    timeline.pause().progress(1)
    expect((wrapper.get('[data-testid="show-map"]').element as HTMLElement).style.transform).toBe(
      '',
    )
    expect(wrapper.get('img').attributes('style')).toBeUndefined()
  })

  it('renders immediately for reduced motion without constructing a timeline', () => {
    preference.matches = true
    const spy = vi.spyOn(gsap, 'timeline')
    const wrapper = mountHero()
    expect(spy).not.toHaveBeenCalled()
    expect(wrapper.get('[data-hero-word]').attributes('style')).toBeUndefined()
  })

  it('reveals content when motion is disabled during the entrance and cleans up', () => {
    const wrapper = mountHero()
    const changed = defined(preference.addEventListener.mock.calls[0])[1] as () => void
    preference.matches = true
    changed()
    expect((wrapper.get('[data-hero-word]').element as HTMLElement).style.opacity).toBe('')
    wrapper.unmount()
    expect(preference.removeEventListener).toHaveBeenCalledWith('change', changed)
  })

  it('shows the complete CTA immediately when keyboard focus enters the hero', async () => {
    const wrapper = mountHero()
    await wrapper.get('[data-testid="show-map"]').trigger('focusin')
    expect((wrapper.get('[data-testid="show-map"]').element as HTMLElement).style.opacity).toBe('')
    expect((wrapper.get('[data-hero-word]').element as HTMLElement).style.opacity).toBe('')
  })

  it('waits for the session and animates the signed-in greeting once', async () => {
    const spy = vi.spyOn(gsap, 'timeline')
    const wrapper = mountHero(false)
    expect(spy).not.toHaveBeenCalled()
    wrapper.vm.greeting = 'Hey Damien,'
    wrapper.vm.ready = true
    await flushPromises()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Hey Damien,')
    firstFrame()
    expect(wrapper.get('[data-hero-word]').attributes('style')).toContain('opacity: 0')
    const timeline = defined(spy.mock.results[0]).value as gsap.core.Timeline
    const play = vi.spyOn(timeline, 'play')
    enter()
    enter()
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('does not restart when a late username becomes available', async () => {
    const spy = vi.spyOn(gsap, 'timeline')
    const wrapper = mountHero()
    wrapper.vm.greeting = 'Hey Damien,'
    await flushPromises()
    expect(spy).toHaveBeenCalledTimes(1)
    expect((wrapper.get('[data-hero-word]').element as HTMLElement).style.opacity).toBe('')
    expect(wrapper.text()).toContain('Hey Damien,')
  })
})
