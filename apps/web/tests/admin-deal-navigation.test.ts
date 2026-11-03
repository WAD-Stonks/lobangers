import type { AdminDealDetail } from '@broke-oclock/contracts/admin-deals'
import { flushPromises, mount } from '@vue/test-utils'
import { confirmAdminIdentity } from '@web/lib/admin-recovery'
import DealsPanel from '@web/modules/admin-deals/DealsPanel.vue'
import { beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

const directory = vi.hoisted(() => ({ merchant: vi.fn(), merchants: vi.fn(), venues: vi.fn() }))
vi.mock('@web/lib/api-client', async () => ({
  api: { adminDeals: {}, adminCatalogue: directory },
  ApiClientError: (await import('@broke-oclock/api-client')).ApiClientError,
}))

const firstId = '111111111111111111111111'
const linkedId = '222222222222222222222222'
const merchantId = '333333333333333333333333'
const outletId = '444444444444444444444444'
const detail = (extra: Partial<AdminDealDetail> = {}): AdminDealDetail => ({
  id: firstId,
  title: 'Synthetic first deal',
  origin: 'USER_SUBMITTED',
  reviewStatus: 'PENDING',
  contentVersion: 3,
  operationVersion: 2,
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
  submittedById: firstId,
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
const linked = (extra: Partial<AdminDealDetail> = {}) =>
  detail({ id: linkedId, title: 'Synthetic linked deal', ...extra })
const methods = () => ({
  list: vi.fn().mockResolvedValue({ items: [detail()], nextCursor: null }),
  detail: vi.fn().mockImplementation(async (id) => (id === linkedId ? linked() : detail())),
  content: vi.fn().mockResolvedValue(detail({ contentVersion: 4, operationVersion: 3 })),
  scope: vi.fn(),
  review: vi.fn(),
  unpublish: vi.fn(),
  reopen: vi.fn(),
  scopeEvidence: vi.fn(),
})
const routed = async (path: string, client = methods()) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/deals', component: DealsPanel, props: { client } },
      { path: '/admin/catalogue', component: { template: '<h1>Catalogue task</h1>' } },
      { path: '/admin/ingestion', component: { template: '<h1>Previous ingestion task</h1>' } },
    ],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(RouterView, {
    attachTo: document.body,
    global: { plugins: [router], stubs: { DraftEvidence: true } },
  })
  await flushPromises()
  return { wrapper, router, client }
}
beforeEach(() => {
  confirmAdminIdentity(null)
  vi.clearAllMocks()
  directory.merchant.mockResolvedValue({ id: merchantId, name: 'Synthetic merchant' })
})

it('opens a linked deal outside the first queue on its evidence tab and returns to the previous task', async () => {
  const client = methods()
  client.detail.mockResolvedValue(linked({ origin: 'IMPORTED', contentVersion: 7 }))
  const returnTo = '/admin/ingestion?draftId=555555555555555555555555#drafts'
  const { wrapper, router } = await routed(
    `/admin/deals?dealId=${linkedId}&tab=evidence&returnTo=${encodeURIComponent(returnTo)}`,
    client,
  )
  try {
    expect(client.detail).toHaveBeenCalledWith(linkedId, { limit: 20 })
    expect(wrapper.findAll('[data-testid="select-deal"]')).toHaveLength(1)
    expect(wrapper.get('[data-testid="select-deal"]').attributes('data-deal-id')).toBe(firstId)
    expect(wrapper.get('.deal-heading h2').text()).toBe('Synthetic linked deal')
    expect(wrapper.get('#deal-editor-tab-evidence').attributes('aria-selected')).toBe('true')
    expect(wrapper.findComponent({ name: 'DraftEvidence' }).props()).toMatchObject({
      dealId: linkedId,
      contentVersion: 7,
    })
    const back = wrapper.get('.task-return')
    expect(back.attributes('href')).toBe(returnTo)
    await back.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe(returnTo)
    expect(wrapper.text()).toContain('Previous ingestion task')
  } finally {
    wrapper.unmount()
  }
})

it('validates the linked tab and return destination before opening supporting evidence', async () => {
  const client = methods()
  client.detail.mockResolvedValue(linked({ origin: 'IMPORTED' }))
  const { wrapper } = await routed(
    `/admin/deals?dealId=${linkedId}&tab=unsupported&returnTo=https%3A%2F%2Fexample.test`,
    client,
  )
  try {
    expect(wrapper.get('#deal-editor-tab-content').attributes('aria-selected')).toBe('true')
    expect(wrapper.find('draft-evidence-stub').exists()).toBe(false)
    expect(wrapper.find('.task-return').exists()).toBe(false)
    expect(client.scopeEvidence).not.toHaveBeenCalled()
    expect(client.review).not.toHaveBeenCalled()
  } finally {
    wrapper.unmount()
  }
})

it('links the current merchant and exact outlet to Catalogue with the selected deal and scope return context', async () => {
  const client = methods()
  client.detail.mockResolvedValue(
    linked({
      merchantId,
      applicability: 'SELECTED_OUTLETS',
      selectedVenueIds: [outletId],
      outletCount: 1,
      outlets: [
        {
          id: outletId,
          merchantId,
          name: 'Synthetic selected outlet',
          address: 'Synthetic address',
          deletedAt: null,
          geographyReady: true,
          occupancyReady: true,
        },
      ],
    }),
  )
  const { wrapper, router } = await routed(
    `/admin/deals?dealId=${linkedId}&tab=scope&search=Synthetic&origin=USER_SUBMITTED`,
    client,
  )
  try {
    const links = wrapper.findAll('a[href^="/admin/catalogue?"]')
    expect(links).toHaveLength(2)
    const merchant = new URL(links[0]?.attributes('href') ?? '', 'http://admin.local')
    const outlet = new URL(links[1]?.attributes('href') ?? '', 'http://admin.local')
    expect(Object.fromEntries(merchant.searchParams)).toMatchObject({ kind: 'venues', merchantId })
    expect(merchant.searchParams.has('recordId')).toBe(false)
    expect(Object.fromEntries(outlet.searchParams)).toMatchObject({
      kind: 'venues',
      merchantId,
      recordId: outletId,
    })
    const returnUrl = new URL(outlet.searchParams.get('returnTo') ?? '', 'http://admin.local')
    expect(returnUrl.pathname).toBe('/admin/deals')
    expect(Object.fromEntries(returnUrl.searchParams)).toMatchObject({
      dealId: linkedId,
      tab: 'scope',
      search: 'Synthetic',
      origin: 'USER_SUBMITTED',
    })
    await links[1]?.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/admin/catalogue')
    expect(router.currentRoute.value.query.recordId).toBe(outletId)
    expect(wrapper.text()).toContain('Catalogue task')
  } finally {
    wrapper.unmount()
  }
})

it('queues a new route selection during a write, then reads its exact target and clears old consent', async () => {
  const client = methods()
  let finish!: (row: AdminDealDetail) => void
  client.content.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const { wrapper, router } = await routed(`/admin/deals?dealId=${firstId}`, client)
  try {
    await wrapper.get('[name="edit-title"]').setValue('Synthetic corrected offer')
    await wrapper.get('[name="note"]').setValue('Reviewed captured first target')
    await wrapper.get('[name="confirm"]').setValue(true)
    await wrapper.get('[data-testid="save-content"]').trigger('click')
    await flushPromises()
    await router.push(`/admin/deals?dealId=${linkedId}&tab=review`)
    await flushPromises()
    expect(client.detail).not.toHaveBeenCalledWith(linkedId, expect.anything())
    expect(wrapper.get('.deal-heading h2').text()).toBe('Synthetic first deal')
    expect(wrapper.get('#deal-editor-tab-scope').attributes('disabled')).toBeDefined()
    finish(detail({ title: 'Synthetic corrected offer', contentVersion: 4, operationVersion: 3 }))
    await flushPromises()
    expect(client.content).toHaveBeenCalledExactlyOnceWith(firstId, {
      expectedContentVersion: 3,
      expectedOperationVersion: 2,
      note: 'Reviewed captured first target',
      changes: { title: 'Synthetic corrected offer' },
    })
    expect(client.detail).toHaveBeenCalledWith(linkedId, { limit: 20 })
    expect(wrapper.get('.deal-heading h2').text()).toBe('Synthetic linked deal')
    expect(wrapper.get('#deal-editor-tab-review').attributes('aria-selected')).toBe('true')
    expect(wrapper.get<HTMLTextAreaElement>('[name="note"]').element.value).toBe('')
    expect(wrapper.get<HTMLInputElement>('[name="confirm"]').element.checked).toBe(false)
  } finally {
    wrapper.unmount()
  }
})

it('fences a superseded exact-record response after browser navigation selects another deal', async () => {
  const client = methods()
  let finish!: (row: AdminDealDetail) => void
  client.detail.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const { wrapper, router } = await routed(`/admin/deals?dealId=${firstId}`, client)
  try {
    await router.push(`/admin/deals?dealId=${linkedId}&tab=scope`)
    await flushPromises()
    finish(detail())
    await flushPromises()
    expect(wrapper.get('.deal-heading h2').text()).toBe('Synthetic linked deal')
    expect(wrapper.get('#deal-editor-tab-scope').attributes('aria-selected')).toBe('true')
  } finally {
    wrapper.unmount()
  }
})

it('clears filters removed from an explicitly filtered route before loading its queue again', async () => {
  const { wrapper, router, client } = await routed(
    `/admin/deals?dealId=${firstId}&search=Synthetic&origin=USER_SUBMITTED&reviewStatus=PENDING&publication=UNPUBLISHED&merchantId=${merchantId}`,
  )
  try {
    expect(client.list).toHaveBeenLastCalledWith({
      search: 'Synthetic',
      origin: 'USER_SUBMITTED',
      reviewStatus: 'PENDING',
      publication: 'UNPUBLISHED',
      merchantId,
      includeDeleted: 'false',
      limit: 20,
    })
    await router.push(`/admin/deals?dealId=${linkedId}`)
    await flushPromises()
    expect(client.list).toHaveBeenLastCalledWith({ includeDeleted: 'false', limit: 20 })
    expect(wrapper.get<HTMLInputElement>('[name="search"]').element.value).toBe('')
    expect(wrapper.get<HTMLSelectElement>('[name="origin"]').element.value).toBe('')
    expect(wrapper.get<HTMLSelectElement>('[name="reviewStatus"]').element.value).toBe('')
    expect(wrapper.get<HTMLSelectElement>('[name="publication"]').element.value).toBe('')
    expect(wrapper.get<HTMLInputElement>('[name="merchantId"]').element.value).toBe('')
  } finally {
    wrapper.unmount()
  }
})

it.each(['invalid', `${firstId}&dealId=${linkedId}`])(
  'ignores an invalid or ambiguous linked deal ID (%s)',
  async (id) => {
    const { wrapper, client } = await routed(`/admin/deals?dealId=${id}&tab=evidence`)
    try {
      expect(client.detail).not.toHaveBeenCalled()
      expect(wrapper.find('.deal-heading').exists()).toBe(false)
      expect(wrapper.find('draft-evidence-stub').exists()).toBe(false)
      expect(wrapper.get('[role="alert"]').text()).toContain('linked deal ID is invalid')
    } finally {
      wrapper.unmount()
    }
  },
)
