import type {
  CatalogueMerchant,
  CatalogueVenueDetail,
} from '@broke-oclock/contracts/admin-catalogue'
import { flushPromises, mount } from '@vue/test-utils'
import CataloguePanel from '@web/modules/admin-catalogue/CataloguePanel.vue'
import { beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

const rest = vi.hoisted(() => ({
  merchants: vi.fn(),
  merchant: vi.fn(),
  venues: vi.fn(),
  venue: vi.fn(),
  patchMerchant: vi.fn(),
}))
vi.mock('@web/lib/api-client', () => ({ api: { adminCatalogue: rest } }))
const merchant: CatalogueMerchant = {
  id: '111111111111111111111111',
  name: 'Synthetic parent merchant',
  version: 3,
  archived: false,
  venueCount: 2,
  dealCount: 1,
}
const otherMerchant = {
  ...merchant,
  id: '222222222222222222222222',
  name: 'Synthetic second merchant',
}
const venue: CatalogueVenueDetail = {
  id: '333333333333333333333333',
  merchantId: merchant.id,
  merchantName: merchant.name,
  parentArchived: false,
  name: 'Synthetic parent outlet',
  address: 'Synthetic fixture address',
  postalCode: '123456',
  area: 'Fixture',
  latitude: 1.3,
  longitude: 103.8,
  imageUrl: null,
  geographyPrecision: 'OUTLET',
  catalogueKey: 'synthetic-outlet',
  version: 4,
  archived: false,
  selectable: false,
  geographyVerified: false,
  occupancyVerified: false,
  geographyState: 'UNVERIFIED',
  occupancyState: 'UNVERIFIED',
  dealCount: 1,
  grantCount: 0,
  requestCount: 0,
  evidence: [],
  evidenceTruncated: false,
}
const click = async (wrapper: ReturnType<typeof mount>, label: string) => {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === label)
  if (!button) throw new Error(`Missing button ${label}`)
  await button.trigger('click')
  await flushPromises()
}
const routed = async (path = '/admin/catalogue') => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/catalogue', component: CataloguePanel },
      { path: '/admin/deals', component: { template: '<h1>Previous deal task</h1>' } },
    ],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(RouterView, { global: { plugins: [router] } })
  await flushPromises()
  return { router, wrapper }
}
beforeEach(() => {
  vi.resetAllMocks()
  rest.merchants.mockResolvedValue({ items: [merchant, otherMerchant], nextCursor: null })
  rest.merchant.mockImplementation(async (id) =>
    id === otherMerchant.id ? otherMerchant : merchant,
  )
  rest.venues.mockResolvedValue({ items: [venue], nextCursor: null })
  rest.venue.mockResolvedValue(venue)
  rest.patchMerchant.mockResolvedValue({ id: merchant.id, version: 4 })
})

it('keeps the merchant context while opening its outlets and returning to its exact record', async () => {
  const { router, wrapper } = await routed()
  try {
    await wrapper.get(`[data-open-id="${merchant.id}"]`).trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.recordId).toBe(merchant.id)
    await click(wrapper, 'View outlets for this merchant')
    expect(rest.venues).toHaveBeenLastCalledWith({
      status: 'all',
      limit: 25,
      merchantId: merchant.id,
    })
    expect(router.currentRoute.value.query).toMatchObject({
      kind: 'venues',
      merchantId: merchant.id,
    })
    expect(wrapper.get('[aria-label="Merchant outlet context"]').text()).toContain(merchant.name)
    await wrapper.get(`[data-open-id="${venue.id}"]`).trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.recordId).toBe(venue.id)
    expect(wrapper.get('[data-testid="catalogue-detail-heading"]').text()).toBe(venue.name)
    await click(wrapper, 'View merchant')
    expect(rest.merchant).toHaveBeenLastCalledWith(merchant.id)
    expect(router.currentRoute.value.query).toMatchObject({
      kind: 'merchants',
      recordId: merchant.id,
    })
    expect(router.currentRoute.value.query.merchantId).toBeUndefined()
    expect(wrapper.get('[data-testid="catalogue-detail-heading"]').text()).toBe(merchant.name)
  } finally {
    wrapper.unmount()
  }
})

it('opens an exact outlet outside the first page and preserves a safe return task', async () => {
  rest.venues.mockResolvedValue({ items: [], nextCursor: null })
  const returnTo = '/admin/deals?dealId=444444444444444444444444&tab=scope'
  const path = `/admin/catalogue?kind=venues&merchantId=${merchant.id}&recordId=${venue.id}&returnTo=${encodeURIComponent(returnTo)}`
  const { router, wrapper } = await routed(path)
  try {
    expect(rest.venue).toHaveBeenCalledWith(venue.id)
    expect(wrapper.get('[data-testid="catalogue-detail-heading"]').text()).toBe(venue.name)
    expect(wrapper.get('[aria-label="Merchant outlet context"]').text()).toContain(merchant.name)
    const back = wrapper.get('a[href^="/admin/deals"]')
    expect(back.attributes('href')).toBe(returnTo)
    await back.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe(returnTo)
    expect(wrapper.text()).toContain('Previous deal task')
  } finally {
    wrapper.unmount()
  }
})

it('filters the directory when switching from a selected merchant and can explicitly clear that filter', async () => {
  const { router, wrapper } = await routed(`/admin/catalogue?recordId=${merchant.id}`)
  try {
    await wrapper.get('#catalogue-kind').setValue('venues')
    await flushPromises()
    expect(rest.venues).toHaveBeenLastCalledWith({
      status: 'all',
      limit: 25,
      merchantId: merchant.id,
    })
    await click(wrapper, 'Show all outlets')
    expect(rest.venues).toHaveBeenLastCalledWith({ status: 'all', limit: 25 })
    expect(router.currentRoute.value.query.merchantId).toBeUndefined()
    expect(wrapper.find('[aria-label="Merchant outlet context"]').exists()).toBe(false)
  } finally {
    wrapper.unmount()
  }
})

it('queues browser route changes until a captured write finishes and resets consent for the new target', async () => {
  let finish!: (result: { id: string; version: number }) => void
  rest.patchMerchant.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const { router, wrapper } = await routed(`/admin/catalogue?recordId=${merchant.id}`)
  try {
    await wrapper.get('[name="merchantName"]').setValue('Synthetic correction')
    await wrapper.get('[name="note"]').setValue('Reviewed exact original version')
    await wrapper.get('[name="confirmed"]').setValue(true)
    await wrapper.get('form:has([name="merchantName"])').trigger('submit')
    await flushPromises()
    await router.push(`/admin/catalogue?recordId=${otherMerchant.id}`)
    await flushPromises()
    expect(rest.merchant).not.toHaveBeenCalledWith(otherMerchant.id)
    expect(wrapper.get('[data-testid="catalogue-detail-heading"]').text()).toBe(merchant.name)
    expect(
      wrapper
        .findAll('button')
        .find((button) => button.text() === 'View outlets for this merchant')
        ?.attributes('disabled'),
    ).toBeDefined()
    finish({ id: merchant.id, version: 4 })
    await flushPromises()
    expect(rest.patchMerchant).toHaveBeenCalledTimes(1)
    expect(rest.patchMerchant.mock.calls[0]?.[1]).toMatchObject({
      expectedVersion: 3,
      confirmed: true,
    })
    expect(rest.merchant).toHaveBeenCalledWith(otherMerchant.id)
    expect(wrapper.get('[data-testid="catalogue-detail-heading"]').text()).toBe(otherMerchant.name)
    expect(wrapper.get<HTMLTextAreaElement>('[name="note"]').element.value).toBe('')
    expect(wrapper.get<HTMLInputElement>('[name="confirmed"]').element.checked).toBe(false)
  } finally {
    wrapper.unmount()
  }
})

it('drops a superseded direct-record read when the browser opens another exact target', async () => {
  let finish!: (result: CatalogueMerchant) => void
  rest.merchant.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const { router, wrapper } = await routed(`/admin/catalogue?recordId=${merchant.id}`)
  try {
    await router.push(`/admin/catalogue?recordId=${otherMerchant.id}`)
    await flushPromises()
    expect(wrapper.get('[data-testid="catalogue-detail-heading"]').text()).toBe(otherMerchant.name)
    finish(merchant)
    await flushPromises()
    expect(wrapper.get('[data-testid="catalogue-detail-heading"]').text()).toBe(otherMerchant.name)
  } finally {
    wrapper.unmount()
  }
})

it('retains an unknown-result lock after a queued route change and a return to the same target', async () => {
  let reject!: (error: Error) => void
  rest.patchMerchant.mockReturnValueOnce(
    new Promise((_resolve, fail) => {
      reject = fail
    }),
  )
  const { router, wrapper } = await routed(`/admin/catalogue?recordId=${merchant.id}`)
  try {
    await wrapper.get('[name="merchantName"]').setValue('Synthetic correction')
    await wrapper.get('[name="note"]').setValue('Reviewed original target')
    await wrapper.get('[name="confirmed"]').setValue(true)
    await wrapper.get('form:has([name="merchantName"])').trigger('submit')
    await flushPromises()
    await router.push(`/admin/catalogue?recordId=${otherMerchant.id}`)
    reject(new Error('Synthetic unknown response'))
    await flushPromises()
    expect(wrapper.get('[data-testid="catalogue-detail-heading"]').text()).toBe(otherMerchant.name)
    await router.push(`/admin/catalogue?recordId=${merchant.id}`)
    await flushPromises()
    expect(wrapper.text()).toContain('outcome could not be confirmed')
    expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined()
    expect(wrapper.get<HTMLTextAreaElement>('[name="note"]').element.value).toBe('')
    expect(wrapper.get<HTMLInputElement>('[name="confirmed"]').element.checked).toBe(false)
    await wrapper.get('form:has([name="merchantName"])').trigger('submit')
    expect(rest.patchMerchant).toHaveBeenCalledTimes(1)
  } finally {
    wrapper.unmount()
  }
})

it('ignores invalid record IDs and external return destinations', async () => {
  const { wrapper } = await routed(
    '/admin/catalogue?recordId=invalid&returnTo=https%3A%2F%2Fexample.test',
  )
  try {
    expect(rest.merchant).not.toHaveBeenCalled()
    expect(wrapper.find('.catalogue-return').exists()).toBe(false)
    expect(wrapper.find('[data-testid="catalogue-detail-heading"]').exists()).toBe(false)
  } finally {
    wrapper.unmount()
  }
})
