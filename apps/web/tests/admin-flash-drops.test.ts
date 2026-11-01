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
  flashPriceCents: 150,
  usualPriceCents: 300,
  startsAt: '2026-10-31T10:00:00.000Z',
  endsAt: '2026-10-31T10:30:00.000Z',
  radiusMetres: 500,
  codeLimit: 40,
  claimedCount: 0,
  status: 'IN_REVIEW',
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
  counts: { review: 2, scheduled: 1, live: 1, ended: 4, claimedToday: 17, ...counts },
})
const second = drop({ id: 'aaaaaaaaaaaaaaaaaaaaaaa2', dealTitle: 'Synthetic prata', demo: false })
const makeClient = () => ({
  list: vi.fn().mockResolvedValue(page([drop(), second])),
  decide: vi.fn().mockResolvedValue(drop({ status: 'SCHEDULED', version: 4 })),
})
const open = async (client = makeClient(), props = {}) => {
  const wrapper = mount(FlashDropsPanel, { attachTo: document.body, props: { client, ...props } })
  await flushPromises()
  return { wrapper, client }
}
beforeEach(() => confirmAdminIdentity(null))

describe('flash drop formatting', () => {
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
    expect(rows[3]?.details).toEqual(['Kopi O · Kopi Corner · 1.2\u00a0km away'])
  })
  it('offers decisions only for actionable states', () => {
    expect(decisionsFor('IN_REVIEW')).toEqual(['APPROVE', 'SEND_BACK'])
    expect(decisionsFor('LIVE')).toEqual(['STOP'])
    expect(decisionsFor('SCHEDULED')).toEqual(['STOP'])
    expect(decisionsFor('ENDED')).toEqual([])
    expect(decisionsFor('SENT_BACK')).toEqual([])
  })
})

describe('FlashDropsPanel', () => {
  it('lists the review queue with counts, fake tags and the first drop selected', async () => {
    const { wrapper, client } = await open()
    expect(client.list).toHaveBeenCalledWith('review')
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toEqual([
      'Needs review (2)',
      'Scheduled (1)',
      'Live (1)',
      'Ended (4)',
    ])
    expect(wrapper.text()).toContain('17 codes claimed today')
    expect(wrapper.findAll('[data-testid="flash-drop-record"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-testid="flash-drop-record"] .fd-fake')).toHaveLength(1)
    expect(wrapper.get('.fd-detail h3').text()).toContain('Synthetic boba 1-for-1')
    expect(wrapper.get('.fd-detail h3 .fd-fake').text()).toBe('Fake deal')
    expect(wrapper.get('.fd-facts').text()).toContain('$1.50 (usual $3.00, 50% off)')
    wrapper.unmount()
  })
  it('approves with the drop version only after confirmation, then refreshes the list', async () => {
    const { wrapper, client } = await open()
    const submit = wrapper.get('[data-testid="flash-decision-submit"]')
    expect(submit.attributes('disabled')).toBeDefined()
    await wrapper.get('input[name="confirm"]').setValue(true)
    expect(submit.attributes('disabled')).toBeUndefined()
    client.list.mockResolvedValueOnce(page([second], { review: 1, scheduled: 2 }))
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(client.decide).toHaveBeenCalledWith(drop().id, {
      decision: 'APPROVE',
      note: '',
      version: 3,
    })
    expect(client.list).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[role="status"]').text()).toContain('Approved')
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe('Needs review (1)')
    wrapper.unmount()
  })
  it('requires a note to send back and blocks duplicate submits while pending', async () => {
    const { wrapper, client } = await open()
    await wrapper.findAll('.fd-choices button')[1]?.trigger('click')
    await wrapper.get('input[name="confirm"]').setValue(true)
    const submit = wrapper.get('[data-testid="flash-decision-submit"]')
    expect(submit.text()).toBe('Send back')
    expect(submit.attributes('disabled')).toBeDefined()
    await wrapper.get('textarea[name="note"]').setValue('  Use a 300 m radius  ')
    expect(submit.attributes('disabled')).toBeUndefined()
    let release: (value: AdminFlashDrop) => void = () => {}
    client.decide.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')
    expect(client.decide).toHaveBeenCalledTimes(1)
    expect(client.decide).toHaveBeenCalledWith(drop().id, {
      decision: 'SEND_BACK',
      note: 'Use a 300 m radius',
      version: 3,
    })
    expect(wrapper.get('[data-testid="flash-decision-submit"]').text()).toBe('Saving…')
    release(drop({ status: 'SENT_BACK', version: 4 }))
    await flushPromises()
    expect(wrapper.text()).toContain('Sent back.')
    wrapper.unmount()
  })
  it('shows a stale-version alert with a Refresh action and keeps the draft note', async () => {
    const { wrapper, client } = await open()
    await wrapper.get('textarea[name="note"]').setValue('Looks good')
    await wrapper.get('input[name="confirm"]').setValue(true)
    client.decide.mockRejectedValueOnce(new ApiClientError('CONFLICT', 409, 'Stale'))
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const alert = wrapper.get('.fd-decision [role="alert"]')
    expect(alert.text()).toContain('Someone else changed this drop')
    expect((wrapper.get('textarea[name="note"]').element as HTMLTextAreaElement).value).toBe(
      'Looks good',
    )
    await alert.get('button').trigger('click')
    await flushPromises()
    expect(client.list).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.fd-decision [role="alert"]').exists()).toBe(false)
    wrapper.unmount()
  })
  it('shows the server message for a wrong-state decision', async () => {
    const { wrapper, client } = await open()
    await wrapper.get('input[name="confirm"]').setValue(true)
    client.decide.mockRejectedValueOnce(
      new ApiClientError(
        'PRECONDITION_FAILED',
        412,
        'This drop is live and cannot be changed that way',
      ),
    )
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('.fd-decision [role="alert"]').text()).toContain('This drop is live')
    wrapper.unmount()
  })
  it('switches tabs from the summary cards and shows live stats and a stop action', async () => {
    const live = drop({ status: 'LIVE', claimedCount: 31, codeLimit: 80, demo: false })
    const { wrapper, client } = await open()
    client.list.mockResolvedValueOnce(page([live]))
    await wrapper.findAll('.fd-metric')[1]?.trigger('click')
    await flushPromises()
    expect(client.list).toHaveBeenLastCalledWith('live')
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe('Live (1)')
    expect(wrapper.get('.fd-live').text()).toContain('31/80')
    expect(wrapper.get('.fd-record').text()).toContain('31/80 claimed')
    expect(wrapper.findAll('.fd-choices button').map((button) => button.text())).toEqual([
      'Stop drop now',
    ])
    wrapper.unmount()
  })
  it('shows ended outcomes read-only and an empty state', async () => {
    const stopped = drop({ status: 'STOPPED', reviewNote: 'Stall ran out', demo: false })
    const client = makeClient()
    client.list.mockResolvedValueOnce(page([stopped]))
    const { wrapper } = await open(client, { initialView: 'ended' })
    expect(client.list).toHaveBeenCalledWith('ended')
    expect(wrapper.get('.fd-outcome').text()).toBe('Stopped by an admin: “Stall ran out”')
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
    expect(wrapper.get('[role="alert"]').text()).toContain('Unable to load flash drops')
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
