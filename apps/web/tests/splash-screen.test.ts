import { mount } from '@vue/test-utils'
import SplashScreen from '@web/components/SplashScreen.vue'
import { SPLASH_DURATION_MS } from '@web/components/splash-config'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const SPLASH = '[data-testid="splash-screen"]'

describe('splash screen', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('covers the page with the logo on load', () => {
    const wrapper = mount(SplashScreen)

    const splash = wrapper.get(SPLASH)
    expect(splash.attributes('role')).toBe('status')
    expect(splash.get('img').attributes('alt')).toBe('Lobangers')
  })

  it('shows the tumbling ticket loader with a loading message under the logo', () => {
    const wrapper = mount(SplashScreen)

    const splash = wrapper.get(SPLASH)
    expect(splash.find('[data-testid="ticket-loader"]').exists()).toBe(true)
    expect(splash.text()).toContain('Loading')
  })

  it('stays for the full duration and then leaves', async () => {
    const wrapper = mount(SplashScreen)

    vi.advanceTimersByTime(SPLASH_DURATION_MS - 1)
    await nextTick()
    expect(wrapper.find(SPLASH).exists()).toBe(true)

    vi.advanceTimersByTime(1)
    await nextTick()
    expect(wrapper.find(SPLASH).exists()).toBe(false)
  })

  it('holds for two seconds', () => {
    expect(SPLASH_DURATION_MS).toBe(2000)
  })

  it('clears its timer when unmounted early', () => {
    const clear = vi.spyOn(globalThis, 'clearTimeout')
    const wrapper = mount(SplashScreen)
    wrapper.unmount()
    expect(clear).toHaveBeenCalled()
  })
})
