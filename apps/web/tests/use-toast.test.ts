import { mount } from '@vue/test-utils'
import { createToastQueue, provideToastQueue, TOAST_MS } from '@web/modules/map-shell/use-toast'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('toast queue', () => {
  it('shows one toast and replaces it with the next', () => {
    const queue = createToastQueue()
    queue.show('Saved')
    queue.show('Removed from saved')
    expect(queue.current.value?.text).toBe('Removed from saved')
    expect(vi.getTimerCount()).toBe(1)
    queue.dispose()
  })

  it('removes the toast after 4.2 seconds', () => {
    const queue = createToastQueue()
    queue.show('Saved', { tone: 'error' })
    expect(TOAST_MS).toBe(4200)
    vi.advanceTimersByTime(4199)
    expect(queue.current.value?.tone).toBe('error')
    vi.advanceTimersByTime(1)
    expect(queue.current.value).toBeNull()
  })

  it('clears its timer when the providing component unmounts', () => {
    let queue: ReturnType<typeof provideToastQueue> | undefined
    const Host = defineComponent({
      setup() {
        queue = provideToastQueue()
        return () => h('div')
      },
    })
    const wrapper = mount(Host)
    queue?.show('Hello')
    expect(vi.getTimerCount()).toBe(1)
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
