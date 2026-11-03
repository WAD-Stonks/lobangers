import { flushPromises, mount } from '@vue/test-utils'
import { confirmAdminIdentity } from '@web/lib/admin-recovery'
import { beforeEach, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

const directory = vi.hoisted(() => ({ merchant: vi.fn(), merchants: vi.fn(), venues: vi.fn() }))
beforeEach(() => {
  confirmAdminIdentity(null)
  directory.merchant.mockReset()
  directory.merchants.mockReset()
  directory.venues.mockReset()
})

const id = '0123456789abcdef01234567'
const detail = (extra = {}) => ({
  id,
  title: 'Synthetic meal',
  origin: 'USER_SUBMITTED',
  reviewStatus: 'PENDING',
  contentVersion: 1,
  operationVersion: 0,
  merchantId: null,
  deletedAt: null,
  publishedAt: null,
  validFrom: null,
  validUntil: null,
  publication: 'UNPUBLISHED',
  description: 'Full safe copy',
  terms: null,
  category: 'FOOD',
  cuisine: null,
  offerType: 'OTHER',
  priceMinor: 1290,
  currency: 'SGD',
  discountPercent: null,
  rawValidityText: null,
  applicability: 'ONLINE',
  submittedById: id,
  reviewedById: null,
  reviewedVersion: null,
  reviewedAt: null,
  reviewNote: null,
  sources: [],
  images: [],
  outlets: [],
  outletCount: 0,
  selectedVenueIds: [],
  nextOutletCursor: null,
  scopeEditable: true,
  scopeConfirmed: false,
  blockers: [],
  approvalReady: true,
  publicationReady: false,
  scopeEvidenceLabel: null,
  ...extra,
})
it('locks old selected evidence when a newer list version arrives and clears protected evidence on denial', async () => {
  const { default: Panel } = await import('@web/modules/admin-deals/DealsPanel.vue')
  const client = methods()
  const wrapper = mount(Panel, { attachTo: document.body, props: { client } })
  await flushPromises()
  await wrapper.get('[data-testid="select-deal"]').trigger('click')
  await flushPromises()
  client.list.mockResolvedValueOnce({ items: [detail({ operationVersion: 2 })], nextCursor: null })
  await wrapper.get('[data-testid="reload-list"]').trigger('click')
  await flushPromises()
  await wrapper.get('[name="note"]').setValue('New note')
  await wrapper.get('[name="confirm"]').setValue(true)
  expect(wrapper.get('[data-testid="save-content"]').attributes('disabled')).toBeDefined()
  const { ApiClientError } = await import('@broke-oclock/api-client')
  client.list.mockRejectedValueOnce(new ApiClientError('FORBIDDEN', 403, 'Denied'))
  await wrapper.get('[data-testid="reload-list"]').trigger('click')
  await flushPromises()
  expect(wrapper.text()).not.toContain('Synthetic meal')
  expect(wrapper.emitted('denied')).toEqual([['FORBIDDEN']])
  wrapper.unmount()
})
it('records submission evidence and reviews using explicit captured operation payloads, without publishing on evidence', async () => {
  const { default: Panel } = await import('@web/modules/admin-deals/DealsPanel.vue')
  const client = methods()
  client.scopeEvidence.mockResolvedValue(
    detail({
      operationVersion: 1,
      scopeConfirmed: true,
      scopeEvidenceLabel: 'Submission evidence',
    }),
  )
  client.review.mockResolvedValue(detail({ operationVersion: 2, reviewStatus: 'APPROVED' }))
  const wrapper = mount(Panel, { attachTo: document.body, props: { client } })
  await flushPromises()
  await wrapper.get('[data-testid="select-deal"]').trigger('click')
  await flushPromises()
  await wrapper.get('#deal-editor-tab-evidence').trigger('click')
  await wrapper.get('[name="reference"]').setValue('https://merchant.example/campaign')
  await wrapper
    .get('[name="statement"]')
    .setValue('I reviewed the merchant campaign for online applicability.')
  const checks = wrapper.findAll('.check input')
  await checks[1]?.setValue(true)
  await wrapper.get('[name="note"]').setValue('Reviewed source')
  await wrapper.get('[name="confirm"]').setValue(true)
  await wrapper.get('[data-testid="save-operation"]').trigger('click')
  await flushPromises()
  expect(client.scopeEvidence).toHaveBeenCalledWith(id, {
    expectedContentVersion: 1,
    expectedOperationVersion: 0,
    note: 'Reviewed source',
    reference: 'https://merchant.example/campaign',
    statement: 'I reviewed the merchant campaign for online applicability.',
    staffConfirmed: true,
  })
  expect(wrapper.text()).toContain('UNPUBLISHED')
  await wrapper.get('#deal-editor-tab-review').trigger('click')
  await wrapper.get('.action-picker select').setValue('APPROVE')
  await wrapper.get('[name="note"]').setValue('Independent review')
  await wrapper.get('[name="confirm"]').setValue(true)
  await wrapper.get('[data-testid="save-operation"]').trigger('click')
  await flushPromises()
  expect(client.review).toHaveBeenCalledWith(id, {
    expectedContentVersion: 1,
    expectedOperationVersion: 1,
    note: 'Independent review',
    decision: 'APPROVE',
  })
  wrapper.unmount()
})
const methods = () => ({
  list: vi.fn().mockResolvedValue({ items: [detail()], nextCursor: null }),
  detail: vi.fn().mockResolvedValue(detail()),
  content: vi.fn().mockResolvedValue(detail({ contentVersion: 2, operationVersion: 1 })),
  scope: vi.fn(),
  review: vi.fn(),
  unpublish: vi.fn(),
  reopen: vi.fn(),
  scopeEvidence: vi.fn(),
})
vi.mock('@web/lib/api-client', async () => ({
  api: { adminDeals: {}, adminCatalogue: directory },
  ApiClientError: (await import('@broke-oclock/api-client')).ApiClientError,
}))
it('mounts an operational directory and edits the captured identity/version with reason and confirmation', async () => {
  const module = await import('@web/modules/admin-deals/DealsPanel.vue')
  const client = methods()
  const wrapper = mount(module?.default ?? defineComponent({ template: '<div />' }), {
    attachTo: document.body,
    props: { client },
  })
  await flushPromises()
  expect(wrapper.text()).toContain('Synthetic meal')
  await wrapper.get('[data-testid="select-deal"]').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('$12.90')
  await wrapper.get('[name="edit-title"]').setValue('Corrected meal')
  await wrapper.get('[name="note"]').setValue('Reviewed correction')
  await wrapper.get('[name="confirm"]').setValue(true)
  await wrapper.get('[data-testid="save-content"]').trigger('click')
  await flushPromises()
  expect(client.content).toHaveBeenCalledWith(id, {
    expectedContentVersion: 1,
    expectedOperationVersion: 0,
    note: 'Reviewed correction',
    changes: { title: 'Corrected meal' },
  })
  wrapper.unmount()
})
it('locks a conflicted identity through list reloads and same-version refresh until fresh evidence arrives', async () => {
  const module = await import('@web/modules/admin-deals/DealsPanel.vue')
  const client = methods()
  const { ApiClientError } = await import('@broke-oclock/api-client')
  client.content.mockRejectedValueOnce(new ApiClientError('CONFLICT', 409, 'Changed'))
  const wrapper = mount(module?.default ?? defineComponent({ template: '<div />' }), {
    attachTo: document.body,
    props: { client },
  })
  await flushPromises()
  expect(wrapper.text()).toContain('Synthetic meal')
  await wrapper.get('[data-testid="select-deal"]').trigger('click')
  await flushPromises()
  await wrapper.get('[name="edit-title"]').setValue('Correction')
  await wrapper.get('[name="note"]').setValue('Reason')
  await wrapper.get('[name="confirm"]').setValue(true)
  await wrapper.get('[data-testid="save-content"]').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('changed or the outcome is unknown')
  await wrapper.get('[data-testid="reload-list"]').trigger('click')
  await flushPromises()
  expect(client.content).toHaveBeenCalledTimes(1)
  await wrapper.get('[data-testid="refresh-deal"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('[data-testid="save-content"]').attributes('disabled')).toBeDefined()
  client.detail.mockResolvedValueOnce(detail({ operationVersion: 1 }))
  await wrapper.get('[data-testid="refresh-deal"]').trigger('click')
  await flushPromises()
  expect((wrapper.get('[name="note"]').element as HTMLTextAreaElement).value).toBe('')
  wrapper.unmount()
})

it('saves decimal prices and Singapore dates in API units without changing untouched timestamp precision', async () => {
  const { default: Panel } = await import('@web/modules/admin-deals/DealsPanel.vue')
  const client = methods()
  client.detail.mockResolvedValue(
    detail({
      validFrom: '2026-11-03T02:30:45.123Z',
      validUntil: '2026-11-04T03:00:00Z',
    }),
  )
  const wrapper = mount(Panel, { attachTo: document.body, props: { client } })
  await flushPromises()
  await wrapper.get('[data-testid="select-deal"]').trigger('click')
  await flushPromises()
  expect(wrapper.get<HTMLInputElement>('[name="edit-priceMinor"]').element.value).toBe('12.90')
  expect(wrapper.get<HTMLInputElement>('[name="edit-validFrom"]').element.value).toBe(
    '2026-11-03T10:30:45.123',
  )
  await wrapper.get('[name="edit-priceMinor"]').setValue('0.29')
  await wrapper.get('[name="edit-validUntil"]').setValue('2026-11-05T11:00:30.456')
  await wrapper.get('[name="note"]').setValue('Corrected offer and end time')
  await wrapper.get('[name="confirm"]').setValue(true)
  await wrapper.get('[data-testid="save-content"]').trigger('click')
  await flushPromises()
  expect(client.content).toHaveBeenCalledWith(id, {
    expectedContentVersion: 1,
    expectedOperationVersion: 0,
    note: 'Corrected offer and end time',
    changes: { priceMinor: 29, validUntil: '2026-11-05T03:00:30.456Z' },
  })
  wrapper.unmount()
})

it('rejects fractional cents before dispatch and preserves the selected record while a write is pending', async () => {
  const { default: Panel } = await import('@web/modules/admin-deals/DealsPanel.vue')
  const client = methods()
  const wrapper = mount(Panel, { attachTo: document.body, props: { client } })
  await flushPromises()
  await wrapper.get('[data-testid="select-deal"]').trigger('click')
  await flushPromises()
  await wrapper.get('[name="edit-priceMinor"]').setValue('1.001')
  await wrapper.get('[name="note"]').setValue('Correct price')
  await wrapper.get('[name="confirm"]').setValue(true)
  await wrapper.get('[data-testid="save-content"]').trigger('click')
  expect(wrapper.get('[role="alert"]').text()).toContain('two decimal places')
  expect(client.content).not.toHaveBeenCalled()

  let finish!: (row: ReturnType<typeof detail>) => void
  client.content.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  await wrapper.get('[name="edit-priceMinor"]').setValue('1.00')
  await wrapper.get('[data-testid="save-content"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('.admin-workspace-back').attributes('disabled')).toBeDefined()
  expect(wrapper.get('#deal-editor-tab-evidence').attributes('disabled')).toBeDefined()
  expect(wrapper.get('[data-testid="select-deal"]').attributes('disabled')).toBeDefined()
  await wrapper.get('.admin-workspace-back').trigger('click')
  expect(wrapper.get('.admin-record-workspace').classes()).toContain('has-selection')
  finish(detail({ priceMinor: 100, contentVersion: 2, operationVersion: 1 }))
  await flushPromises()
  expect(wrapper.get('.admin-workspace-back').attributes('disabled')).toBeUndefined()
  wrapper.unmount()
})

it('keeps the complete outlet selection when directory search only returns a partial page', async () => {
  const { default: Panel } = await import('@web/modules/admin-deals/DealsPanel.vue')
  const client = methods()
  const existingIds = Array.from({ length: 15 }, (_, index) => index.toString(16).padStart(24, '0'))
  const addedId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
  directory.merchant.mockResolvedValue({ id, name: 'Selected merchant' })
  directory.venues.mockResolvedValue({
    items: [{ id: addedId, name: 'New outlet', address: 'Test address', selectable: true }],
    nextCursor: null,
  })
  client.detail.mockResolvedValue(
    detail({
      merchantId: id,
      applicability: 'SELECTED_OUTLETS',
      selectedVenueIds: existingIds,
      outletCount: 15,
    }),
  )
  client.scope.mockResolvedValue(
    detail({
      merchantId: id,
      applicability: 'SELECTED_OUTLETS',
      selectedVenueIds: [...existingIds, addedId],
      outletCount: 16,
      operationVersion: 1,
    }),
  )
  const wrapper = mount(Panel, { attachTo: document.body, props: { client } })
  await flushPromises()
  await wrapper.get('[data-testid="select-deal"]').trigger('click')
  await flushPromises()
  await wrapper.get('#deal-editor-tab-scope').trigger('click')
  await flushPromises()
  await wrapper.get('[data-testid="deal-scope-find-outlets"]').trigger('click')
  await flushPromises()
  await wrapper.get(`[data-testid="deal-scope-outlet-${addedId}"]`).setValue(true)
  await wrapper.get('[name="note"]').setValue('Reviewed the complete outlet selection')
  await wrapper.get('[name="confirm"]').setValue(true)
  await wrapper.get('[data-testid="save-operation"]').trigger('click')
  await flushPromises()
  expect(client.scope).toHaveBeenCalledWith(id, {
    expectedContentVersion: 1,
    expectedOperationVersion: 0,
    note: 'Reviewed the complete outlet selection',
    applicability: 'SELECTED_OUTLETS',
    merchantId: id,
    venueIds: [...existingIds, addedId],
  })
  wrapper.unmount()
})

it('clears protected deal evidence when a merchant lookup loses permission', async () => {
  const { default: Panel } = await import('@web/modules/admin-deals/DealsPanel.vue')
  const { ApiClientError } = await import('@broke-oclock/api-client')
  const client = methods()
  client.detail.mockResolvedValue(detail({ merchantId: id }))
  directory.merchant.mockRejectedValueOnce(new ApiClientError('FORBIDDEN', 403, 'Denied'))
  const wrapper = mount(Panel, { attachTo: document.body, props: { client } })
  await flushPromises()
  await wrapper.get('[data-testid="select-deal"]').trigger('click')
  await flushPromises()
  await wrapper.get('#deal-editor-tab-scope').trigger('click')
  await flushPromises()
  expect(wrapper.text()).not.toContain('Synthetic meal')
  expect(wrapper.emitted('denied')).toEqual([['FORBIDDEN']])
  wrapper.unmount()
})
