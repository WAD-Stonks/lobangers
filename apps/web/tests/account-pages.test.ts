import type { AccountVenue, MyMerchantRequest, Submission } from '@broke-oclock/contracts/account'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import MerchantAccessPage from '@web/pages/MerchantAccessPage.vue'
import MySubmissionsPage from '@web/pages/MySubmissionsPage.vue'
import { chooseOption, optionLabels, selectedValue } from '@web-tests/support/select'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type Component, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

type Page<T> = { items: T[]; nextCursor: string | null }

// Synthetic API boundary only: these tests check the pages, not backend behaviour.
const account = vi.hoisted(() => ({
  submissions: vi.fn(),
  deleteSubmission: vi.fn(),
  venues: vi.fn(),
  requestMerchantAccess: vi.fn(),
  merchantRequests: vi.fn(),
}))
const canAddDeal = vi.hoisted(() => ({ value: true }))
vi.mock('@web/lib/use-can-add-deal', async () => {
  const { computed } = await import('vue')
  return { useCanAddDeal: () => computed(() => canAddDeal.value) }
})

vi.mock('@web/lib/api-client', () => ({
  ApiClientError: class ApiClientError extends Error {
    constructor(
      readonly code: string,
      readonly status: number,
      message: string,
    ) {
      super(message)
    }
  },
  api: { account },
}))

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

const submission = (n: number, overrides: Partial<Submission> = {}): Submission => ({
  id: `submission-${n}`,
  title: `Submission ${n}`,
  description: 'Half-price kopi all day.',
  category: 'DRINKS',
  cuisine: null,
  offerType: 'PERCENT_OFF',
  discountPercent: 50,
  priceCents: null,
  startDate: '2026-11-01',
  endDate: '2026-11-30',
  terms: 'Takeaway only',
  photoUrl: null,
  stalls: [
    { id: 'stall-1', name: 'Kopi Corner Bedok', address: '1 Bedok North Rd' },
    { id: 'stall-2', name: 'Kopi Corner Tampines', address: '2 Tampines St' },
    { id: 'stall-3', name: 'Kopi Corner Jurong', address: '3 Jurong West Ave' },
  ],
  reviewStatus: 'PENDING',
  reviewNote: null,
  deletable: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})
const request = (n: number): MyMerchantRequest => ({
  id: `request-${n}`,
  venueName: `Stall ${n}`,
  merchantName: 'Merchant',
  status: 'PENDING',
  reviewNote: null,
  createdAt: '2026-01-01T00:00:00.000Z',
})
const venue = (id: string, name: string): AccountVenue => ({
  id,
  name,
  merchantName: 'Merchant',
  address: '1 Test Road',
})

const BModalStub = {
  props: ['modelValue', 'title'],
  template: '<div v-if="modelValue" class="modal-stub"><h5>{{ title }}</h5><slot /></div>',
}

const mountPage = async (component: Component, path = '/') => {
  const stub = { render: () => h('div') }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: stub },
      { path: '/login', component: stub },
      { path: '/add', name: 'submit-deal', component: stub },
    ],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(component, { global: { plugins: [router], stubs: { BModal: BModalStub } } })
  await flushPromises()
  return Object.assign(wrapper, { router })
}

const buttonWithText = (wrapper: VueWrapper, text: string) =>
  wrapper.findAll('button').find((button) => button.text().includes(text))

beforeEach(() => {
  vi.resetAllMocks()
  canAddDeal.value = true
})

describe('Load more on the submissions page', () => {
  it('ignores a second click while the first Load more is still running', async () => {
    account.submissions.mockResolvedValueOnce({ items: [submission(1)], nextCursor: 'cursor-1' })
    const wrapper = await mountPage(MySubmissionsPage)

    const nextPage = deferred<Page<Submission>>()
    account.submissions.mockReturnValueOnce(nextPage.promise)
    const loadMore = buttonWithText(wrapper, 'Load more')
    await Promise.all([loadMore?.trigger('click'), loadMore?.trigger('click')])

    expect(account.submissions).toHaveBeenCalledTimes(2)
    nextPage.resolve({ items: [submission(2)], nextCursor: null })
    await flushPromises()
    expect(wrapper.findAll('.submission-card h2').map((heading) => heading.text())).toEqual([
      'Submission 1',
      'Submission 2',
    ])
  })
})

describe('thanks after sharing a deal', () => {
  it('thanks the member once after a submission, then drops the marker from the address', async () => {
    account.submissions.mockResolvedValue({ items: [submission(1)], nextCursor: null })
    const wrapper = await mountPage(MySubmissionsPage, '/?submitted=1')

    expect(wrapper.get('h1').text()).toBe('My deal submissions')
    expect(wrapper.get('.alert-success').text()).toContain('will appear once an admin reviews it')
    expect(wrapper.router.currentRoute.value.query).toEqual({})
  })

  it('shows no thanks on an ordinary visit', async () => {
    account.submissions.mockResolvedValue({ items: [], nextCursor: null })
    const wrapper = await mountPage(MySubmissionsPage)
    expect(wrapper.find('.alert-success').exists()).toBe(false)
  })
})

describe('adding a deal from the submissions page', () => {
  it('links to the Add a deal form, even before the first submission', async () => {
    account.submissions.mockResolvedValue({ items: [], nextCursor: null })
    const wrapper = await mountPage(MySubmissionsPage)
    const link = wrapper.get('a.my-submissions__add')
    expect(link.text()).toBe('Add a deal')
    expect(link.attributes('href')).toBe('/add')
  })

  it('offers no Add a deal to merchants, who add deals from their dashboard', async () => {
    canAddDeal.value = false
    account.submissions.mockResolvedValue({ items: [], nextCursor: null })
    const wrapper = await mountPage(MySubmissionsPage)
    expect(wrapper.find('.my-submissions__add').exists()).toBe(false)
  })
})

describe('submission cards and details', () => {
  it('shows the status in plain case with the offer, stalls and dates on each card', async () => {
    account.submissions.mockResolvedValue({
      items: [
        submission(1),
        submission(2, { reviewStatus: 'APPROVED', stalls: submission(2).stalls.slice(0, 1) }),
      ],
      nextCursor: null,
    })
    const wrapper = await mountPage(MySubmissionsPage)
    const [first, second] = wrapper.findAll('.submission-card')

    expect(first?.get('.badge').text()).toBe('Awaiting review')
    expect(second?.get('.badge').text()).toBe('Approved')
    expect(first?.text()).toContain('50% off · Drinks')
    expect(first?.text()).toContain('Kopi Corner Bedok, Kopi Corner Tampines and 1 more')
    expect(first?.text()).toContain('1 Nov 2026 to 30 Nov 2026')
    expect(second?.text()).toContain('Kopi Corner Bedok')
  })

  it('opens every detail of a submission, with each stall and its address', async () => {
    account.submissions.mockResolvedValue({
      items: [submission(1, { reviewNote: 'Looks good' })],
      nextCursor: null,
    })
    const wrapper = await mountPage(MySubmissionsPage)
    expect(wrapper.find('.modal-stub').exists()).toBe(false)

    await wrapper.get('.submission-card__open').trigger('click')
    const modal = wrapper.get('.modal-stub')
    expect(modal.get('h5').text()).toBe('Submission 1')
    for (const text of [
      'Awaiting review',
      'An admin will check this deal before it appears on the map.',
      'Half-price kopi all day.',
      'Takeaway only',
      'Reviewer note',
      'Looks good',
      'Stalls (3)',
      'Kopi Corner Jurong',
      '3 Jurong West Ave',
    ])
      expect(modal.text()).toContain(text)
  })

  it('offers delete only while the deal is pending', async () => {
    account.submissions.mockResolvedValue({
      items: [submission(1, { reviewStatus: 'APPROVED', deletable: false })],
      nextCursor: null,
    })
    const wrapper = await mountPage(MySubmissionsPage)
    await wrapper.get('.submission-card__open').trigger('click')
    expect(buttonWithText(wrapper, 'Delete deal')).toBeUndefined()
  })

  it('offers no delete for a deal back in review after an admin approved it', async () => {
    account.submissions.mockResolvedValue({
      items: [submission(1, { deletable: false })],
      nextCursor: null,
    })
    const wrapper = await mountPage(MySubmissionsPage)
    await wrapper.get('.submission-card__open').trigger('click')
    expect(buttonWithText(wrapper, 'Delete deal')).toBeUndefined()
    expect(wrapper.get('.modal-stub').text()).toContain('can no longer be deleted')
  })

  it('deletes a pending deal after a second confirming click and drops it from the list', async () => {
    account.submissions.mockResolvedValue({
      items: [submission(1), submission(2)],
      nextCursor: null,
    })
    account.deleteSubmission.mockResolvedValue({ deleted: true })
    const wrapper = await mountPage(MySubmissionsPage)
    await wrapper.get('.submission-card__open').trigger('click')

    await buttonWithText(wrapper, 'Delete deal')?.trigger('click')
    expect(account.deleteSubmission).not.toHaveBeenCalled()
    await buttonWithText(wrapper, 'Keep it')?.trigger('click')
    expect(buttonWithText(wrapper, 'Yes, delete')).toBeUndefined()

    await buttonWithText(wrapper, 'Delete deal')?.trigger('click')
    await buttonWithText(wrapper, 'Yes, delete')?.trigger('click')
    await flushPromises()
    expect(account.deleteSubmission).toHaveBeenCalledWith('submission-1')
    expect(wrapper.find('.modal-stub').exists()).toBe(false)
    expect(wrapper.findAll('.submission-card h2').map((heading) => heading.text())).toEqual([
      'Submission 2',
    ])
    expect(wrapper.get('.alert-success').text()).toContain('was deleted')
  })

  it('keeps the deal and explains when it was reviewed before the delete', async () => {
    const { ApiClientError } = (await import('@web/lib/api-client')) as unknown as {
      ApiClientError: new (code: string, status: number, message: string) => Error
    }
    account.submissions.mockResolvedValue({ items: [submission(1)], nextCursor: null })
    account.deleteSubmission.mockRejectedValue(
      new ApiClientError('PRECONDITION_FAILED', 412, 'Not pending'),
    )
    const wrapper = await mountPage(MySubmissionsPage)
    await wrapper.get('.submission-card__open').trigger('click')
    await buttonWithText(wrapper, 'Delete deal')?.trigger('click')
    await buttonWithText(wrapper, 'Yes, delete')?.trigger('click')
    await flushPromises()

    expect(wrapper.get('.modal-stub [role="alert"]').text()).toContain('can no longer be deleted')
    expect(wrapper.findAll('.submission-card')).toHaveLength(1)
  })
})

describe('merchant access page', () => {
  beforeEach(() => {
    account.venues.mockResolvedValue([])
    account.merchantRequests.mockResolvedValue({ items: [], nextCursor: null })
  })

  it('shows older merchant requests with Load more and fetches each page once', async () => {
    account.merchantRequests.mockResolvedValueOnce({ items: [request(1)], nextCursor: 'cursor-1' })
    const wrapper = await mountPage(MerchantAccessPage)
    expect(wrapper.text()).toContain('Stall 1')

    const nextPage = deferred<Page<MyMerchantRequest>>()
    account.merchantRequests.mockReturnValueOnce(nextPage.promise)
    const loadMore = buttonWithText(wrapper, 'Load more')
    await Promise.all([loadMore?.trigger('click'), loadMore?.trigger('click')])

    expect(account.merchantRequests).toHaveBeenCalledTimes(2)
    expect(account.merchantRequests).toHaveBeenLastCalledWith({ cursor: 'cursor-1' })
    nextPage.resolve({ items: [request(2)], nextCursor: null })
    await flushPromises()
    expect(wrapper.text()).toContain('Stall 1')
    expect(wrapper.text()).toContain('Stall 2')
    expect(buttonWithText(wrapper, 'Load more')).toBeUndefined()
  })

  it('ignores an older stall search that finishes last', async () => {
    const wrapper = await mountPage(MerchantAccessPage) // the search on open returns nothing
    const searchA = deferred<AccountVenue[]>()
    const searchB = deferred<AccountVenue[]>()
    account.venues.mockReturnValueOnce(searchA.promise).mockReturnValueOnce(searchB.promise)

    const searchBox = wrapper.find('#venue-search')
    const searchButton = buttonWithText(wrapper, 'Search')
    await searchBox.setValue('A')
    await searchButton?.trigger('click')
    await searchBox.setValue('B')
    await searchButton?.trigger('click')

    // The newer search (B) finishes first and the user picks a stall from it.
    searchB.resolve([venue('venue-b', 'Stall B')])
    await flushPromises()
    await chooseOption(wrapper, '#venue', 'venue-b')

    // The older search (A) finishes last and must change nothing.
    searchA.resolve([venue('venue-a', 'Stall A')])
    await flushPromises()

    const options = await optionLabels(wrapper, '#venue')
    expect(options).toEqual(['Choose a stall', 'Stall B (Merchant)'])
    expect(selectedValue(wrapper, '#venue')).toBe('venue-b')
  })

  it('does not show an error from an older search that failed after a newer one succeeded', async () => {
    const wrapper = await mountPage(MerchantAccessPage)
    const searchA = deferred<AccountVenue[]>()
    account.venues
      .mockReturnValueOnce(searchA.promise)
      .mockResolvedValueOnce([venue('venue-b', 'Stall B')])

    const searchButton = buttonWithText(wrapper, 'Search')
    await searchButton?.trigger('click')
    await searchButton?.trigger('click')
    await flushPromises()

    searchA.reject(new Error('offline'))
    await flushPromises()
    expect(wrapper.text()).not.toContain('Could not search stalls')
    expect(await optionLabels(wrapper, '#venue')).toContain('Stall B (Merchant)')
  })

  it('discards a Load more response that finishes after a refresh', async () => {
    account.venues.mockResolvedValue([venue('venue-1', 'Stall V')])
    account.requestMerchantAccess.mockResolvedValue({ id: 'new-request', version: 0 })
    account.merchantRequests.mockResolvedValueOnce({ items: [request(1)], nextCursor: 'cursor-1' })
    const wrapper = await mountPage(MerchantAccessPage)

    // The user clicks Load more, and that slow request is still pending...
    const stale = deferred<Page<MyMerchantRequest>>()
    account.merchantRequests.mockReturnValueOnce(stale.promise)
    await buttonWithText(wrapper, 'Load more')?.trigger('click')

    // ...when they send a new request, which refreshes the first page.
    account.merchantRequests.mockResolvedValueOnce({
      items: [request(9), request(1)],
      nextCursor: 'cursor-new',
    })
    await chooseOption(wrapper, '#venue', 'venue-1')
    await wrapper.find('#why').setValue('Please approve')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Stall 9')

    // The old Load more now finishes. It belongs to the old list and must change nothing.
    stale.resolve({ items: [request(21)], nextCursor: 'cursor-stale' })
    await flushPromises()
    expect(wrapper.text()).not.toContain('Stall 21')

    // The cursor still points at the refreshed list.
    account.merchantRequests.mockResolvedValueOnce({ items: [request(10)], nextCursor: null })
    await buttonWithText(wrapper, 'Load more')?.trigger('click')
    await flushPromises()
    expect(account.merchantRequests).toHaveBeenLastCalledWith({ cursor: 'cursor-new' })
  })

  it('does not start Load more while the first page is being refreshed', async () => {
    account.venues.mockResolvedValue([venue('venue-1', 'Stall V')])
    account.requestMerchantAccess.mockResolvedValue({ id: 'new-request', version: 0 })
    account.merchantRequests.mockResolvedValueOnce({ items: [request(1)], nextCursor: 'cursor-1' })
    const wrapper = await mountPage(MerchantAccessPage)

    const refresh = deferred<Page<MyMerchantRequest>>()
    account.merchantRequests.mockReturnValueOnce(refresh.promise)
    await chooseOption(wrapper, '#venue', 'venue-1')
    await wrapper.find('#why').setValue('Please approve')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(buttonWithText(wrapper, 'Load more')?.attributes('disabled')).toBeDefined()
    expect(account.merchantRequests).toHaveBeenCalledTimes(2) // first page + the refresh

    refresh.resolve({ items: [request(9)], nextCursor: 'cursor-new' })
    await flushPromises()
    expect(buttonWithText(wrapper, 'Load more')?.attributes('disabled')).toBeUndefined()
  })
})
