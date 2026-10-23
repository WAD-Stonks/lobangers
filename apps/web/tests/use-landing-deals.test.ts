import { flushPromises, mount } from '@vue/test-utils'
import { useLandingDeals } from '@web/modules/landing/use-landing-deals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

const list = vi.hoisted(() => vi.fn())
vi.mock('@web/lib/api-client', () => ({ api: { deals: { list } } }))
const wrappers: { unmount: () => void }[] = []
function setup() {
  let state!: ReturnType<typeof useLandingDeals>
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useLandingDeals()
        return () => h('div')
      },
    }),
  )
  wrappers.push(wrapper)
  return { state, wrapper }
}
beforeEach(() => list.mockReset())
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
})

describe('landing deal requests', () => {
  it('recovers from failure through the same public request', async () => {
    list.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ items: [] })
    const { state } = setup()
    await flushPromises()
    expect(state.status.value).toBe('error')
    const retry = state.retry()
    expect(state.status.value).toBe('loading')
    await retry
    expect(state.status.value).toBe('ready')
    expect(list).toHaveBeenNthCalledWith(2, { validNow: 'true' })
  })
  it('ignores an older response after a successful retry', async () => {
    let rejectOld!: (error: Error) => void
    list
      .mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectOld = reject
        }),
      )
      .mockResolvedValueOnce({ items: [] })
    const { state } = setup()
    await state.retry()
    rejectOld(new Error('late failure'))
    await flushPromises()
    expect(state.status.value).toBe('ready')
  })
  it('does not update state when a response arrives after leaving the page', async () => {
    let resolve!: (value: unknown) => void
    list.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const { state, wrapper } = setup()
    wrapper.unmount()
    wrappers.splice(0)
    resolve({ items: [] })
    await flushPromises()
    expect(state.status.value).toBe('loading')
  })
})
