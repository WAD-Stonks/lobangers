import { mount } from '@vue/test-utils'
import { HOT_INTERVAL_MS, useHotRotation } from '@web/modules/map-shell/use-hot-rotation'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'

const mountRotation = (count = 3, reducedMotion = false) => {
  let api: ReturnType<typeof useHotRotation> | undefined
  const total = ref(count)
  const Probe = defineComponent({
    setup() {
      api = useHotRotation(total, { reducedMotion: ref(reducedMotion) })
      return () => h('div')
    },
  })
  const wrapper = mount(Probe)
  if (!api) throw new Error('rotation not created')
  return { wrapper, rotation: api }
}

const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  setHidden(false)
})

describe('hot card rotation', () => {
  it('moves to the next deal every 4.5 seconds and wraps at the end', async () => {
    const { rotation } = mountRotation(3)
    expect(HOT_INTERVAL_MS).toBe(4500)
    await vi.advanceTimersByTimeAsync(4499)
    expect(rotation.index.value).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(rotation.index.value).toBe(1)
    await vi.advanceTimersByTimeAsync(HOT_INTERVAL_MS * 2)
    expect(rotation.index.value).toBe(0)
  })

  it('pauses on hover and resumes after', async () => {
    const { rotation } = mountRotation()
    rotation.setHover(true)
    await vi.advanceTimersByTimeAsync(HOT_INTERVAL_MS * 2)
    expect(rotation.index.value).toBe(0)
    rotation.setHover(false)
    await vi.advanceTimersByTimeAsync(HOT_INTERVAL_MS)
    expect(rotation.index.value).toBe(1)
  })

  it('pauses while keyboard focus is inside', async () => {
    const { rotation } = mountRotation()
    rotation.setFocus(true)
    await vi.advanceTimersByTimeAsync(HOT_INTERVAL_MS * 2)
    expect(rotation.index.value).toBe(0)
  })

  it('pauses while the tab is hidden', async () => {
    const { rotation } = mountRotation()
    setHidden(true)
    await nextTick()
    await vi.advanceTimersByTimeAsync(HOT_INTERVAL_MS * 2)
    expect(rotation.index.value).toBe(0)
    setHidden(false)
    await nextTick()
    await vi.advanceTimersByTimeAsync(HOT_INTERVAL_MS)
    expect(rotation.index.value).toBe(1)
  })

  it('pauses and plays from the button', async () => {
    const { rotation } = mountRotation()
    rotation.toggle()
    expect(rotation.paused.value).toBe(true)
    await vi.advanceTimersByTimeAsync(HOT_INTERVAL_MS * 2)
    expect(rotation.index.value).toBe(0)
    rotation.toggle()
    await vi.advanceTimersByTimeAsync(HOT_INTERVAL_MS)
    expect(rotation.index.value).toBe(1)
  })

  it('never starts with reduced motion, but still moves by hand', async () => {
    const { rotation } = mountRotation(3, true)
    expect(rotation.running.value).toBe(false)
    await vi.advanceTimersByTimeAsync(HOT_INTERVAL_MS * 3)
    expect(rotation.index.value).toBe(0)
    rotation.pick(2)
    expect(rotation.index.value).toBe(2)
  })

  it('clears its timer on unmount', async () => {
    const { wrapper } = mountRotation()
    expect(vi.getTimerCount()).toBe(1)
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
