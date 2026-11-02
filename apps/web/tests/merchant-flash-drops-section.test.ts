import type { MerchantFlashDrop, MerchantFlashDropBody } from '@broke-oclock/contracts/flash-drops'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import FlashDropsSection from '@web/modules/merchant/FlashDropsSection.vue'
import {
  createFlashDrop,
  endFlashDrop,
  resendFlashDrop,
} from '@web/modules/merchant/flash-drop-api'
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

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
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
      props: { deals: [], outlets: [] },
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
})
