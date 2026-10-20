import { mount } from '@vue/test-utils'
import { breakpointFor, useBreakpoint } from '@web/modules/map-shell/use-breakpoint'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'

// A fake matchMedia that answers min-width queries for a given width and records listeners.
const fakeMatchMedia = (width: { value: number }) => {
  const lists: { query: string; listeners: Set<() => void> }[] = []
  const matchMedia = vi.fn((query: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0)
    const entry = { query, listeners: new Set<() => void>() }
    lists.push(entry)
    return {
      get matches() {
        return width.value >= min
      },
      addEventListener: (_: string, fn: () => void) => entry.listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => entry.listeners.delete(fn),
    } as unknown as MediaQueryList
  })
  const resize = (next: number) => {
    width.value = next
    for (const entry of lists) for (const fn of entry.listeners) fn()
  }
  const listenerCount = () => lists.reduce((sum, entry) => sum + entry.listeners.size, 0)
  return { matchMedia, resize, listenerCount }
}

const mountProbe = () => {
  let value: ReturnType<typeof useBreakpoint> | undefined
  const Probe = defineComponent({
    setup() {
      value = useBreakpoint()
      return () => h('div')
    },
  })
  const wrapper = mount(Probe)
  return { wrapper, breakpoint: () => value?.value }
}

afterEach(() => vi.unstubAllGlobals())

describe('breakpoints', () => {
  it.each([
    [320, 'phone'],
    [767, 'phone'],
    [768, 'tablet'],
    [991, 'tablet'],
    [992, 'desktop'],
    [1440, 'desktop'],
  ])('maps %ipx to %s', (width, expected) => {
    expect(breakpointFor(width)).toBe(expected)
  })

  it('follows matchMedia and removes its listeners on unmount', async () => {
    const width = { value: 767 }
    const media = fakeMatchMedia(width)
    vi.stubGlobal('matchMedia', media.matchMedia)

    const { wrapper, breakpoint } = mountProbe()
    expect(breakpoint()).toBe('phone')

    for (const [next, expected] of [
      [768, 'tablet'],
      [991, 'tablet'],
      [992, 'desktop'],
    ] as const) {
      media.resize(next)
      await nextTick()
      expect(breakpoint()).toBe(expected)
    }

    expect(media.listenerCount()).toBeGreaterThan(0)
    wrapper.unmount()
    expect(media.listenerCount()).toBe(0)
  })

  it('assumes desktop when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(mountProbe().breakpoint()).toBe('desktop')
  })
})
