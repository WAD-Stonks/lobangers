import type { VenueDetailResponse } from '@broke-oclock/contracts/venues'
import { flushPromises, mount } from '@vue/test-utils'
import { ApiClientError } from '@web/lib/api-client'
import VenuePanel from '@web/modules/venues-feed/VenuePanel.vue'
import { beforeEach, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

// Synthetic REST boundary: page projection only, not live venue data.
const rest = vi.hoisted(() => ({ venue: vi.fn() }))
vi.mock('@web/lib/api-client', () => ({
  ApiClientError: class ApiClientError extends Error {
    constructor(readonly code: string) {
      super(code)
    }
  },
  api: { venues: { get: rest.venue } },
}))

const venueId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const detail: VenueDetailResponse = {
  venue: {
    id: venueId,
    name: 'Synthetic Kopi Tampines',
    address: '1 Example Street',
    area: 'Tampines',
    postalCode: '520001',
    merchantName: 'Synthetic Kopi',
  },
  deals: [
    {
      id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      title: 'Kopi set',
      category: 'Food',
      offerType: 'FIXED_PRICE',
      priceMinor: 350,
      currency: 'SGD',
      discountPercent: null,
      validUntil: '2026-10-31T16:00:00.000Z',
      rawValidityText: null,
      imageUrl: 'https://example.test/kopi.jpg',
    },
    {
      id: 'cccccccccccccccccccccccc',
      title: 'Toast discount',
      category: 'Food',
      offerType: 'PERCENT_OFF',
      priceMinor: null,
      currency: 'SGD',
      discountPercent: 20,
      validUntil: null,
      rawValidityText: 'While stocks last',
      imageUrl: null,
    },
  ],
  pastDeals: [
    {
      id: 'dddddddddddddddddddddddd',
      title: 'Old kaya toast set',
      offerType: 'BUY_ONE_GET_ONE',
      priceMinor: null,
      currency: 'SGD',
      discountPercent: null,
      validUntil: '2026-09-30T16:00:00.000Z',
    },
  ],
}

const stub = { render: () => h('div') }

const mountAt = async (path: string) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'browse', component: stub },
      { path: '/deals/:dealId', name: 'deal', component: stub },
      { path: '/venues/:venueId', name: 'venue', component: VenuePanel },
    ],
  })
  await router.push(path)
  const wrapper = mount(VenuePanel, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

const openTab = async (wrapper: Awaited<ReturnType<typeof mountAt>>['wrapper'], label: string) => {
  const tab = wrapper.findAll('[role="tab"]').find((candidate) => candidate.text() === label)
  await tab?.trigger('click')
}

beforeEach(() => {
  vi.resetAllMocks()
})

it('titles the panel with the venue and links each ongoing deal to its deal panel', async () => {
  rest.venue.mockResolvedValue(detail)
  const { wrapper } = await mountAt(`/venues/${venueId}?cat=food`)
  expect(rest.venue).toHaveBeenCalledWith(venueId)
  expect(wrapper.find('h1').text()).toBe('Synthetic Kopi Tampines')
  expect(wrapper.find('.venue-panel__logo').text()).toBe('SK')
  expect(wrapper.text()).toContain('1 Example Street, Singapore 520001')
  expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe('Now')
  const cards = wrapper.findAll('[data-testid="venue-deal-card"]')
  expect(cards).toHaveLength(2)
  expect(cards[0]?.find('img').attributes('src')).toBe('https://example.test/kopi.jpg')
  expect(cards[0]?.text()).toContain('$3.50')
  expect(cards[0]?.text()).toContain('Until 31 Oct 2026')
  expect(cards[1]?.text()).toContain('20% off')
  expect(cards[1]?.text()).toContain('While stocks last')
  const link = wrapper
    .findAll('a')
    .find((anchor) => anchor.attributes('href')?.startsWith('/deals/'))
  expect(link?.attributes('href')).toBe(`/deals/bbbbbbbbbbbbbbbbbbbbbbbb?cat=food&at=${venueId}`)
})

it('lists past deals on the Past tab and details on About', async () => {
  rest.venue.mockResolvedValue(detail)
  const { wrapper } = await mountAt(`/venues/${venueId}`)
  await openTab(wrapper, 'Past')
  const rows = wrapper.findAll('[data-testid="venue-past-deal"]')
  expect(rows).toHaveLength(1)
  expect(rows[0]?.text()).toContain('Old kaya toast set')
  expect(rows[0]?.text()).toContain('Ended 30 Sept 2026')
  expect(rows[0]?.text()).toContain('1-for-1')
  await openTab(wrapper, 'About')
  expect(wrapper.text()).toContain('Tampines')
  expect(wrapper.text()).toContain('Synthetic Kopi')
})

it('shows empty messages when the venue has no ongoing or past deals', async () => {
  rest.venue.mockResolvedValue({ ...detail, deals: [], pastDeals: [] })
  const { wrapper } = await mountAt(`/venues/${venueId}`)
  expect(wrapper.text()).toContain('No ongoing deals at this venue right now.')
  await openTab(wrapper, 'Past')
  expect(wrapper.text()).toContain('No past deals at this venue yet.')
})

it('resets the panel to the top when the tab changes', async () => {
  rest.venue.mockResolvedValue(detail)
  const { wrapper } = await mountAt(`/venues/${venueId}`)
  const body = wrapper.get('[data-testid="panel-body"]').element as HTMLElement
  body.scrollTop = 300
  await openTab(wrapper, 'Past')
  await flushPromises()
  expect(body.scrollTop).toBe(0)
})

it('shows not found for a missing venue and retries other failures', async () => {
  rest.venue.mockRejectedValueOnce(
    new (ApiClientError as unknown as new (code: string) => Error)('NOT_FOUND'),
  )
  const missing = await mountAt(`/venues/${venueId}`)
  expect(missing.wrapper.find('h1').text()).toBe('Venue not found')

  rest.venue.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(detail)
  const failing = await mountAt(`/venues/${venueId}`)
  expect(failing.wrapper.text()).toContain('Unable to load this venue')
  await failing.wrapper.get('button.lb-btn').trigger('click')
  await flushPromises()
  expect(failing.wrapper.find('h1').text()).toBe('Synthetic Kopi Tampines')
})
