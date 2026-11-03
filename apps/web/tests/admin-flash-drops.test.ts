import type { AdminFlashDrop, AdminFlashDropsResponse } from '@broke-oclock/contracts/flash-drops'
import { flushPromises, mount } from '@vue/test-utils'
import { confirmAdminIdentity } from '@web/lib/admin-recovery'
import { ApiClientError } from '@web/lib/api-client'
import FlashDropsPanel from '@web/modules/admin-flash-drops/FlashDropsPanel.vue'
import {
  checkRows,
  decisionsFor,
  formatPrice,
  offerLine,
  windowLine,
} from '@web/modules/admin-flash-drops/flash-drop-format'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Synthetic, clearly labelled fixtures. They prove the Vue projection only, not server rules.
const drop = (extra: Partial<AdminFlashDrop> = {}): AdminFlashDrop => ({
  id: 'aaaaaaaaaaaaaaaaaaaaaaa1',
  dealId: 'bbbbbbbbbbbbbbbbbbbbbbb1',
  dealTitle: 'Synthetic boba 1-for-1',
  outletId: 'ccccccccccccccccccccccc1',
  outletName: 'Synthetic Bedok outlet',
  offerType: 'FIXED_PRICE',
  discountPercent: null,
  flashPriceCents: 150,
  usualPriceCents: 300,
  startsAt: '2026-10-31T10:00:00.000Z',
  endsAt: '2026-10-31T10:30:00.000Z',
  radiusMetres: 500,
  codeLimit: 40,
  claimedCount: 0,
  status: 'LIVE',
  reviewNote: null,
  version: 3,
  demo: true,
  merchantName: 'Synthetic Boba Lab',
  outletLat: 1.32411,
  outletLng: 103.93012,
  checks: {
    merchantHoldsOutlet: true,
    outletLocated: true,
    priceLower: true,
    manyCodes: false,
    overlaps: [],
  },
  ...extra,
})
const page = (items: AdminFlashDrop[], counts = {}): AdminFlashDropsResponse => ({
  items,
  counts: { scheduled: 1, live: 2, ended: 4, claimedToday: 17, ...counts },
})
const second = drop({ id: 'aaaaaaaaaaaaaaaaaaaaaaa2', dealTitle: 'Synthetic prata', demo: false })
const makeClient = () => ({
  list: vi.fn().mockResolvedValue(page([drop(), second])),
  decide: vi.fn().mockResolvedValue(drop({ status: 'STOPPED', version: 4 })),
})
const open = async (client = makeClient(), props = {}) => {
  const wrapper = mount(FlashDropsPanel, { attachTo: document.body, props: { client, ...props } })
  await flushPromises()
  return { wrapper, client }
}
beforeEach(() => confirmAdminIdentity(null))

describe('flash deal formatting', () => {
  it('formats prices, savings and SGT windows', () => {
    expect(formatPrice(150)).toBe('$1.50')
    expect(offerLine(drop())).toBe('$1.50 (usual $3.00, 50% off)')
    expect(offerLine(drop({ usualPriceCents: null }))).toBe('$1.50 (no usual price recorded)')
    expect(windowLine(drop())).toBe('31 Oct, 6:00 pm – 6:30 pm')
  })
  it('turns server checks into ok, warning and problem rows with overlaps by name', () => {
    const rows = checkRows(
      drop({
        codeLimit: 120,
        checks: {
          merchantHoldsOutlet: false,
          outletLocated: true,
          priceLower: null,
          manyCodes: true,
          overlaps: [
            {
              id: 'ddddddddddddddddddddddd1',
              dealTitle: 'Kopi O',
              outletName: 'Kopi Corner',
              distanceMetres: 1200,
            },
          ],
        },
      }),
    )
    expect(rows.map((row) => row.tone)).toEqual(['bad', 'ok', 'warn', 'bad', 'warn'])
    expect(rows[3]?.details).toEqual(['Kopi O · Kopi Corner · 1.2 km away'])
  })
  it('only offers removal for scheduled and live flash deals', () => {
    expect(decisionsFor('LIVE')).toEqual(['STOP'])
    expect(decisionsFor('SCHEDULED')).toEqual(['STOP'])
    expect(decisionsFor('ENDED')).toEqual([])
    expect(decisionsFor('STOPPED')).toEqual([])
    expect(decisionsFor('DRAFT')).toEqual([])
  })
})

describe('FlashDropsPanel', () => {
  it('does not present unknown counts as zero or allow switching queues before the first read', async () => {
    let release!: (value: AdminFlashDropsResponse) => void
    const client = makeClient()
    client.list.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    const wrapper = mount(FlashDropsPanel, { props: { client } })
    await flushPromises()
    expect(wrapper.get('.fd-metrics').attributes('aria-busy')).toBe('true')
    expect(wrapper.findAll('.fd-metric strong').map((count) => count.text())).toEqual([
      '—',
      '—',
      '—',
    ])
    await wrapper.findAll('.fd-metric')[1]?.trigger('click')
    expect(client.list).toHaveBeenCalledTimes(1)
    release(page([]))
    await flushPromises()
    expect(wrapper.findAll('.fd-metric strong').map((count) => count.text())).toEqual([
      '2',
      '1',
      '4',
    ])
    wrapper.unmount()
  })
  it('opens on live flash deals with counts, fake tags and the first one selected', async () => {
    const { wrapper, client } = await open()
    expect(client.list).toHaveBeenCalledWith('live')
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toEqual([
      'Live (2)',
      'Scheduled (1)',
      'Ended (4)',
    ])
    expect(wrapper.text()).toContain('17 codes claimed today')
    expect(wrapper.findAll('[data-testid="flash-drop-record"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-testid="flash-drop-record"] .fd-fake')).toHaveLength(1)
    expect(wrapper.get('.fd-detail h3').text()).toContain('Synthetic boba 1-for-1')
    expect(wrapper.get('.fd-detail h3 .fd-fake').text()).toBe('Fake deal')
    expect(wrapper.get('.fd-facts').text()).toContain('$1.50 (usual $3.00, 50% off)')
    expect(wrapper.findAll('.fd-choices button').map((button) => button.text())).toEqual([
      'Remove flash deal',
    ])
    wrapper.unmount()
  })
  it('removes with a note and the version only after confirmation, then refreshes', async () => {
    const { wrapper, client } = await open()
    const submit = wrapper.get('[data-testid="flash-decision-submit"]')
    expect(submit.text()).toBe('Remove flash deal')
    await wrapper.get('input[name="confirm"]').setValue(true)
    // A note is required.
    expect(submit.attributes('disabled')).toBeDefined()
    await wrapper.get('textarea[name="note"]').setValue('  Misleading price  ')
    expect(submit.attributes('disabled')).toBeUndefined()
    let release: (value: AdminFlashDrop) => void = () => {}
    client.decide.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    client.list.mockResolvedValueOnce(page([second], { live: 1, ended: 5 }))
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')
    expect(client.decide).toHaveBeenCalledTimes(1)
    expect(client.decide).toHaveBeenCalledWith(drop().id, {
      decision: 'STOP',
      note: 'Misleading price',
      version: 3,
    })
    expect(wrapper.get('[data-testid="flash-decision-submit"]').text()).toBe('Saving…')
    release(drop({ status: 'STOPPED', version: 4 }))
    await flushPromises()
    expect(client.list).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[role="status"]').text()).toContain('Removed.')
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe('Live (1)')
    wrapper.unmount()
  })
  it('shows a stale-version alert with a Refresh action and keeps the note', async () => {
    const { wrapper, client } = await open()
    await wrapper.get('textarea[name="note"]').setValue('Misleading price')
    await wrapper.get('input[name="confirm"]').setValue(true)
    client.decide.mockRejectedValueOnce(new ApiClientError('CONFLICT', 409, 'Stale'))
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const alert = wrapper.get('.fd-decision [role="alert"]')
    expect(alert.text()).toContain('Someone else changed this flash deal')
    expect((wrapper.get('textarea[name="note"]').element as HTMLTextAreaElement).value).toBe(
      'Misleading price',
    )
    await alert.get('button').trigger('click')
    await flushPromises()
    expect(client.list).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.fd-decision [role="alert"]').exists()).toBe(false)
    wrapper.unmount()
  })
  it('shows the server message for a flash deal that already ended', async () => {
    const { wrapper, client } = await open()
    await wrapper.get('textarea[name="note"]').setValue('Misleading price')
    await wrapper.get('input[name="confirm"]').setValue(true)
    client.decide.mockRejectedValueOnce(
      new ApiClientError(
        'PRECONDITION_FAILED',
        412,
        'This flash deal is ended and cannot be removed',
      ),
    )
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('.fd-decision [role="alert"]').text()).toContain('This flash deal is ended')
    wrapper.unmount()
  })
  it('switches tabs from the summary cards and shows live stats', async () => {
    const live = drop({ status: 'LIVE', claimedCount: 31, codeLimit: 80, demo: false })
    const client = makeClient()
    client.list.mockResolvedValue(page([live]))
    const { wrapper } = await open(client)
    expect(wrapper.get('.fd-live').text()).toContain('31/80')
    expect(wrapper.get('.fd-record').text()).toContain('31/80 claimed')
    client.list.mockResolvedValueOnce(page([drop({ status: 'SCHEDULED', demo: false })]))
    await wrapper.findAll('.fd-metric')[1]?.trigger('click')
    await flushPromises()
    expect(client.list).toHaveBeenLastCalledWith('scheduled')
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe('Scheduled (1)')
    wrapper.unmount()
  })
  it('shows ended outcomes read-only and an empty state', async () => {
    const removed = drop({ status: 'STOPPED', reviewNote: 'Misleading price', demo: false })
    const client = makeClient()
    client.list.mockResolvedValueOnce(page([removed]))
    const { wrapper } = await open(client, { initialView: 'ended' })
    expect(client.list).toHaveBeenCalledWith('ended')
    expect(wrapper.get('.fd-outcome').text()).toBe('Removed by an admin: “Misleading price”')
    expect(wrapper.find('form').exists()).toBe(false)
    client.list.mockResolvedValueOnce(page([]))
    await wrapper.get('[data-testid="flash-refresh"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Nothing here right now.')
    wrapper.unmount()
  })
  it('shows a load error with retry and reports denied access', async () => {
    const client = makeClient()
    client.list.mockRejectedValueOnce(new Error('private diagnostic'))
    const { wrapper } = await open(client)
    expect(wrapper.get('[role="alert"]').text()).toContain('Unable to load flash deals')
    expect(wrapper.text()).not.toContain('private diagnostic')
    client.list.mockRejectedValueOnce(new ApiClientError('FORBIDDEN', 403, 'Forbidden'))
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('denied')).toEqual([['FORBIDDEN']])
    expect(wrapper.find('.fd-record').exists()).toBe(false)
    wrapper.unmount()
  })
  it('moves between tabs with arrow keys', async () => {
    const { wrapper, client } = await open()
    await wrapper
      .get('[role="tab"][aria-selected="true"]')
      .trigger('keydown', { key: 'ArrowRight' })
    await flushPromises()
    expect(client.list).toHaveBeenLastCalledWith('scheduled')
    wrapper.unmount()
  })
})
