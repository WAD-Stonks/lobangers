import type { MerchantFlashDrop, MerchantFlashDropBody } from '@broke-oclock/contracts/flash-drops'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import FlashDropsSection from '@web/modules/merchant/FlashDropsSection.vue'
import {
  createFlashDrop,
  endFlashDrop,
  resendFlashDrop,
} from '@web/modules/merchant/flash-drop-api'
import type { MerchantDeal, MerchantOutlet } from '@web/modules/merchant/merchant-api'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const merchant = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  resubmit: vi.fn(),
  end: vi.fn(),
}))

vi.mock('@web/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@web/lib/api-client')>()),
  api: { flashDrops: { merchant } },
}))

enableAutoUnmount(afterEach)

// A labelled synthetic fixture: not a real outlet, deal or drop.
const drop = (overrides: Partial<MerchantFlashDrop> = {}): MerchantFlashDrop => ({
  id: 'a'.repeat(24),
  dealId: 'b'.repeat(24),
  dealTitle: 'Synthetic chicken rice',
  outletId: 'c'.repeat(24),
  outletName: 'Synthetic Stall (Maxwell)',
  flashPriceCents: 150,
  usualPriceCents: 350,
  startsAt: '2026-11-02T12:00:00.000Z',
  endsAt: '2026-11-02T12:30:00.000Z',
  radiusMetres: 500,
  codeLimit: 40,
  claimedCount: 0,
  status: 'IN_REVIEW',
  reviewNote: null,
  version: 3,
  demo: false,
  ...overrides,
})

const body: MerchantFlashDropBody = {
  dealId: 'b'.repeat(24),
  outletId: 'c'.repeat(24),
  flashPriceCents: 150,
  startsAt: '2026-11-02T12:00:00.000Z',
  durationMinutes: 30,
  radiusMetres: 500,
  codeLimit: 40,
}

const outlet: MerchantOutlet = {
  id: 'c'.repeat(24),
  name: 'Synthetic Stall (Maxwell)',
  address: '1 Synthetic Street',
}
const deal: MerchantDeal = {
  id: 'b'.repeat(24),
  title: 'Synthetic chicken rice',
  description: 'Synthetic test fixture',
  category: 'FOOD',
  cuisine: null,
  outletIds: [outlet.id],
  offerType: 'FIXED_PRICE',
  discountPercent: null,
  priceCents: 350,
  startDate: '',
  endDate: '',
  terms: '',
  endedAt: null,
}

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-02T11:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('flash drop requests', () => {
  it('send the drop version with resends and early ends', async () => {
    const sent = drop()
    merchant.create.mockResolvedValue(sent)
    merchant.resubmit.mockResolvedValue(sent)
    merchant.end.mockResolvedValue(sent)

    await createFlashDrop(body)
    await resendFlashDrop(drop({ status: 'SENT_BACK' }), body)
    await endFlashDrop(drop({ status: 'LIVE' }))

    expect(merchant.create).toHaveBeenCalledWith(body)
    expect(merchant.resubmit).toHaveBeenCalledWith('a'.repeat(24), { ...body, version: 3 })
    expect(merchant.end).toHaveBeenCalledWith('a'.repeat(24), 3)
  })
})

describe('FlashDropsSection', () => {
  const mountSection = () =>
    mount(FlashDropsSection, {
      props: { deals: [deal], outlets: [outlet] },
      global: { stubs: { TicketLoading: true } },
    })

  it('lists the drops from the server with no demo controls', async () => {
    merchant.list.mockResolvedValue({ items: [drop()] })
    const wrapper = mountSection()
    await flushPromises()

    expect(merchant.list).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Synthetic chicken rice')
    expect(wrapper.text()).toContain('Withdraw')
    expect(wrapper.text()).not.toContain('(demo)')
    expect(wrapper.text()).not.toContain('Fake deal')
  })

  it('fetches again every 30 seconds so approvals and claims show up', async () => {
    merchant.list
      .mockResolvedValueOnce({ items: [drop()] })
      .mockResolvedValueOnce({ items: [drop({ status: 'LIVE', claimedCount: 7 })] })
    const wrapper = mountSection()
    await flushPromises()

    await vi.advanceTimersByTimeAsync(30_000)
    await flushPromises()

    expect(merchant.list).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('7 of 40 claimed')
  })

  it('keeps the list when a background refresh fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    merchant.list
      .mockResolvedValueOnce({ items: [drop()] })
      .mockRejectedValueOnce(new Error('offline'))
    const wrapper = mountSection()
    await flushPromises()

    await vi.advanceTimersByTimeAsync(30_000)
    await flushPromises()

    expect(wrapper.text()).toContain('Synthetic chicken rice')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('shows an error when the first load fails', async () => {
    merchant.list.mockRejectedValue(new Error('offline'))
    const wrapper = mountSection()
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe('Could not load your flash drops.')
  })

  it('clears the initial load error when a later refresh succeeds', async () => {
    merchant.list
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ items: [drop()] })
    const wrapper = mountSection()
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Could not load your flash drops.')

    await vi.advanceTimersByTimeAsync(30_000)
    await flushPromises()

    expect(wrapper.text()).toContain('Synthetic chicken rice')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('waits for the initial read and each refresh before starting another read', async () => {
    const first = deferred<{ items: MerchantFlashDrop[] }>()
    const refresh = deferred<{ items: MerchantFlashDrop[] }>()
    merchant.list
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(refresh.promise)
      .mockResolvedValue({ items: [drop()] })
    const wrapper = mountSection()

    await vi.advanceTimersByTimeAsync(60_000)
    expect(merchant.list).toHaveBeenCalledTimes(1)
    first.resolve({ items: [drop()] })
    await flushPromises()

    await vi.advanceTimersByTimeAsync(30_000)
    expect(merchant.list).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(merchant.list).toHaveBeenCalledTimes(2)
    refresh.resolve({ items: [drop({ status: 'LIVE', claimedCount: 7 })] })
    await flushPromises()
    expect(wrapper.text()).toContain('7 of 40 claimed')

    await vi.advanceTimersByTimeAsync(30_000)
    expect(merchant.list).toHaveBeenCalledTimes(3)
  })

  it('keeps a confirmed new drop when the initial read returns an older list', async () => {
    const first = deferred<{ items: MerchantFlashDrop[] }>()
    merchant.list.mockReturnValueOnce(first.promise)
    merchant.create.mockResolvedValue(drop())
    const wrapper = mountSection()

    await wrapper.vm.openForm(deal.id)
    await wrapper.get('#flash-price').setValue('1.50')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(merchant.create).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[role="status"]').text()).toContain('was sent for review')

    first.resolve({ items: [] })
    await flushPromises()

    expect(wrapper.get(`[data-testid="flash-drop-${drop().id}"]`).text()).toContain('In review')
  })

  it('keeps a confirmed early end when an older refresh returns', async () => {
    const refresh = deferred<{ items: MerchantFlashDrop[] }>()
    const live = drop({ status: 'LIVE' })
    merchant.list.mockResolvedValueOnce({ items: [live] }).mockReturnValueOnce(refresh.promise)
    merchant.end.mockResolvedValue(drop({ status: 'ENDED', version: 4 }))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = mountSection()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(30_000)

    await wrapper.get(`[data-testid="flash-drop-${live.id}"] button`).trigger('click')
    await flushPromises()
    expect(merchant.end).toHaveBeenCalledWith(live.id, live.version)
    expect(wrapper.text()).toContain('has ended')

    refresh.resolve({ items: [live] })
    await flushPromises()

    expect(wrapper.get(`[data-testid="flash-drop-${live.id}"]`).text()).toContain('Ended')
    expect(wrapper.text()).not.toContain('End drop early')
  })

  it('keeps a confirmed resubmission when an older refresh returns', async () => {
    const refresh = deferred<{ items: MerchantFlashDrop[] }>()
    const sentBack = drop({ status: 'SENT_BACK', reviewNote: 'Please reduce the radius' })
    merchant.list.mockResolvedValueOnce({ items: [sentBack] }).mockReturnValueOnce(refresh.promise)
    merchant.resubmit.mockResolvedValue(drop({ version: 4 }))
    const wrapper = mountSection()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(30_000)

    await wrapper.get(`[data-testid="flash-drop-${sentBack.id}"] button`).trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(merchant.resubmit).toHaveBeenCalledWith(
      sentBack.id,
      expect.objectContaining({ version: sentBack.version }),
    )

    refresh.resolve({ items: [sentBack] })
    await flushPromises()

    expect(wrapper.get(`[data-testid="flash-drop-${sentBack.id}"]`).text()).toContain('In review')
    expect(wrapper.text()).not.toContain('Edit and resend')
  })

  it('preserves an end error when a later refresh succeeds', async () => {
    merchant.list.mockResolvedValue({ items: [drop({ status: 'LIVE' })] })
    merchant.end.mockRejectedValue(new Error('offline'))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = mountSection()
    await flushPromises()

    await wrapper.get(`[data-testid="flash-drop-${drop().id}"] button`).trigger('click')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(30_000)

    expect(wrapper.get('[role="alert"]').text()).toContain('Could not end the flash drop')
  })

  it('stops polling and ignores a pending refresh failure after unmount', async () => {
    const refresh = deferred<{ items: MerchantFlashDrop[] }>()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    merchant.list.mockResolvedValueOnce({ items: [drop()] }).mockReturnValueOnce(refresh.promise)
    const wrapper = mountSection()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(30_000)

    wrapper.unmount()
    refresh.reject(new Error('offline after leaving'))
    await flushPromises()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(merchant.list).toHaveBeenCalledTimes(2)
    expect(warn).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
