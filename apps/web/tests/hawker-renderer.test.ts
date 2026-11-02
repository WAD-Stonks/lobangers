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
const renderer = vi.hoisted(() => ({
  setSize: vi.fn(),
  setPixelRatio: vi.fn(),
  shadowMap: { enabled: false, type: 0 },
  capabilities: { getMaxAnisotropy: () => 1 },
  dispose: vi.fn(),
}))
vi.mock('three', async (importOriginal) => ({
  ...(await importOriginal<typeof import('three')>()),
  WebGLRenderer: class {
    constructor() {
      Object.assign(this, renderer)
    }
  },
}))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

const props = {
  motion: communityTimeline(1),
  deal: samples[4],
  area: 'Novena',
  active: false,
  reduced: false,
}
const notifyResize = vi.fn<ResizeObserverCallback>()
const resizeCanvas = (width: number, height: number) => {
  notifyResize([{ contentRect: { width, height } } as ResizeObserverEntry], {} as ResizeObserver)
}
const invalidSizes = [
  [0, 0],
  [0, 420],
  [440, 0],
  [-1, 420],
  [440, -1],
  [Number.NaN, 420],
  [440, Number.NaN],
  [Number.POSITIVE_INFINITY, 420],
  [440, Number.POSITIVE_INFINITY],
  [Number.NEGATIVE_INFINITY, 420],
  [440, Number.NEGATIVE_INFINITY],
] as const
const enableWebGL = () => {
  vi.stubGlobal('WebGLRenderingContext', class {})
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        notifyResize.mockImplementation(callback)
      }
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
  it.each(invalidSizes)(
    'preserves valid anchors for an invalid observer size (%s, %s)',
    async (width, height) => {
      enableWebGL()
      const wrapper = mount(HawkerStallModel, { props: { ...props, active: true } })
      try {
        await flushPromises()
        resizeCanvas(440, 420)
        const anchors = wrapper.emitted('anchors')?.[0]
        expect(anchors).toEqual([engine.anchors()])
        engine.anchors.mockClear()

        await wrapper.setProps({ active: false })
        resizeCanvas(width, height)
        expect(engine.resize).toHaveBeenCalledTimes(1)
        expect(engine.anchors).not.toHaveBeenCalled()
        expect(wrapper.emitted('anchors')).toEqual([anchors])
        expect(wrapper.attributes('data-renderer')).toBe('three')

        await wrapper.setProps({ active: true })
        resizeCanvas(640, 480)
        expect(engine.resize).toHaveBeenLastCalledWith(640, 480)
        expect(engine.resize).toHaveBeenCalledTimes(2)
        expect(engine.anchors).toHaveBeenCalledTimes(1)
        expect(wrapper.emitted('anchors')).toHaveLength(2)
        expect(wrapper.emitted('anchors')?.[1]).toEqual(anchors)
        expect(create).toHaveBeenCalledTimes(1)
        expect(wrapper.attributes('data-renderer')).toBe('three')
      } finally {
        wrapper.unmount()
      }
    },
  )
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

describe('hawker engine projection', () => {
  it('retains the last valid size and finite anchors until a positive resize recovers', async () => {
    // Keep real Three.js scene/camera/projection math; stub only unavailable drawing APIs.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: vi.fn(),
      fillText: vi.fn(),
      createRadialGradient: () => ({ addColorStop: vi.fn() }),
    } as unknown as CanvasRenderingContext2D)
    const { createHawker } = await vi.importActual<
      typeof import('@web/modules/landing/hawker-three')
    >('@web/modules/landing/hawker-three')
    const hawker = createHawker(document.createElement('canvas'), samples[4], 'Novena')
    try {
      hawker.resize(440, 420)
      const valid = hawker.anchors()
      expect(
        Object.values(valid).every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)),
      ).toBe(true)
      renderer.setSize.mockClear()

      for (const [width, height] of invalidSizes) {
        hawker.resize(width, height)
        expect(renderer.setSize).not.toHaveBeenCalled()
        expect(hawker.anchors()).toEqual(valid)
      }

      hawker.resize(640, 480)
      expect(renderer.setSize).toHaveBeenCalledExactlyOnceWith(640, 480, false)
      const recovered = hawker.anchors()
      expect(
        Object.values(recovered).every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)),
      ).toBe(true)
      expect(recovered).not.toEqual(valid)
    } finally {
      hawker.dispose()
    }
  })
})
