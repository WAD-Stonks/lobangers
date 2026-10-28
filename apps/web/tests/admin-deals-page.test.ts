import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

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
  await wrapper.get('.action-picker select').setValue('evidence')
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
  api: { adminDeals: {} },
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
  expect(wrapper.text()).toContain('SGD 12.90')
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
