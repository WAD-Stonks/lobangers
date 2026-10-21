import { flushPromises, mount } from '@vue/test-utils'
import { communityTimeline } from '@web/modules/landing/community-freshness'
import { samples } from '@web/modules/landing/deals'
import HawkerStallModel from '@web/modules/landing/HawkerStallModel.vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

const engine = vi.hoisted(() => ({
  render: vi.fn(),
  resize: vi.fn(),
  dispose: vi.fn(),
  anchors: vi.fn(() => ({ sign: { x: 0.5, y: 0.2 }, status: { x: 0.7, y: 0.7 } })),
}))
const create = vi.hoisted(() => vi.fn())
vi.mock('@web/modules/landing/hawker-three', () => ({ createHawker: create }))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const props = {
  motion: communityTimeline(1),
  deal: samples[4],
  area: 'Novena',
  active: false,
  reduced: false,
}
const enableWebGL = () => {
  vi.stubGlobal('WebGLRenderingContext', class {})
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    },
  )
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  )
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  create.mockReturnValue(engine)
}
describe('hawker renderer lifecycle', () => {
  it.each([{ deviceMemory: 2 }, { connection: { saveData: true } }])(
    'keeps the light vector fallback for constrained devices: %j',
    async (device) => {
      enableWebGL()
      vi.stubGlobal('navigator', device)
      const wrapper = mount(HawkerStallModel, { props: { ...props, active: true } })
      await flushPromises()
      expect(create).not.toHaveBeenCalled()
      expect(wrapper.attributes('data-renderer')).toBe('vector-fallback')
      wrapper.unmount()
    },
  )
  it('does not initialise WebGL before the offer enters and releases it on unmount', async () => {
    enableWebGL()
    const wrapper = mount(HawkerStallModel, { props })
    expect(create).not.toHaveBeenCalled()
    await wrapper.setProps({ active: true })
    await flushPromises()
    expect(create).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), samples[4], 'Novena')
    expect(wrapper.attributes('data-renderer')).toBe('three')
    wrapper.unmount()
    expect(engine.dispose).toHaveBeenCalledTimes(1)
    expect(cancelAnimationFrame).toHaveBeenCalled()
  })
  it('rebuilds the roof sign from the newly selected deal and location', async () => {
    enableWebGL()
    const wrapper = mount(HawkerStallModel, { props: { ...props, active: true } })
    await flushPromises()
    await wrapper.setProps({ deal: samples[0], area: 'Woodlands' })
    await flushPromises()
    expect(engine.dispose).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenLastCalledWith(expect.any(HTMLCanvasElement), samples[0], 'Woodlands')
    wrapper.unmount()
  })
  it('hides the completed canvas while inactive and reuses it when the scene returns', async () => {
    enableWebGL()
    const wrapper = mount(HawkerStallModel, {
      props: { ...props, active: true },
      attachTo: document.body,
    })
    await flushPromises()
    const canvas = wrapper.get('canvas')
    expect(canvas.isVisible()).toBe(true)
    await wrapper.setProps({ active: false, motion: communityTimeline(0) })
    expect(canvas.isVisible()).toBe(false)
    expect(engine.dispose).not.toHaveBeenCalled()
    await wrapper.setProps({ active: true, motion: communityTimeline(0.5) })
    expect(canvas.isVisible()).toBe(true)
    expect(create).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
  it('restores vector artwork if the WebGL context is lost', async () => {
    enableWebGL()
    const wrapper = mount(HawkerStallModel, { props: { ...props, active: true } })
    await flushPromises()
    await wrapper.get('canvas').trigger('webglcontextlost')
    expect(wrapper.attributes('data-renderer')).toBe('vector-fallback')
    expect(wrapper.findAll('[data-stall-layer]')).toHaveLength(6)
    expect(engine.dispose).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    expect(engine.dispose).toHaveBeenCalledTimes(1)
  })
})
