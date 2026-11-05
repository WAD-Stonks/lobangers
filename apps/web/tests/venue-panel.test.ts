import type { VenueDetailResponse } from '@broke-oclock/contracts/venues'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { ApiClientError } from '@web/lib/api-client'
import { clearVenueDetailCache } from '@web/modules/venues-feed/venue-detail-cache'
import { makeDeal, mountShell, SIGNED_OUT } from '@web-tests/support/shell-fixtures'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const rest = vi.hoisted(() => ({ venue: vi.fn(), list: vi.fn(), bookmarks: vi.fn() }))
vi.mock('@web/lib/api-client', () => ({
  ApiClientError: class ApiClientError extends Error {
    constructor(readonly code: string) {
      super(code)
    }
  },
  api: {
    venues: { get: rest.venue },
    deals: { list: rest.list },
    account: { bookmarks: rest.bookmarks },
  },
}))
vi.mock('@web/lib/auth-client', () => ({
  authClient: { useSession: () => ref(SIGNED_OUT), getSession: async () => ({ data: null }) },
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

let mounted: VueWrapper[] = []

const mountAt = async (path: string) => {
  const { wrapper, router } = await mountShell(path)
  mounted = [...mounted, wrapper]
  return { wrapper, router }
}

const openTab = async (wrapper: Awaited<ReturnType<typeof mountAt>>['wrapper'], label: string) => {
  const tab = wrapper.findAll('[role="tab"]').find((candidate) => candidate.text() === label)
  await tab?.trigger('click')
}

beforeEach(() => {
  vi.resetAllMocks()
  clearVenueDetailCache()
  rest.list.mockResolvedValue({ items: [], categories: [] })
})

afterEach(() => {
  for (const wrapper of mounted) wrapper.unmount()
  mounted = []
})

it('titles the panel with the venue and links each ongoing deal to its deal panel', async () => {
  rest.venue.mockResolvedValue(detail)
  const { wrapper } = await mountAt(`/venues/${venueId}?cat=food`)
  expect(rest.venue).toHaveBeenCalledWith(venueId)
  expect(wrapper.find('h1').text()).toBe('Synthetic Kopi Tampines')
  expect(wrapper.find('.venue-panel__logo').text()).toBe('SK')
  expect(wrapper.text()).toContain('1 Example Street, Singapore 520001')
  expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe('Now')
  const cards = wrapper.findAll('[data-testid="venue-deals"] > li')
  expect(cards).toHaveLength(2)
  expect(cards[0]?.text()).toContain('Kopi set')
  expect(cards[0]?.text()).toContain('Synthetic Kopi Tampines')
  expect(cards[1]?.text()).toContain('Toast discount')
  expect(cards[1]?.find('.deal-rows__media--placeholder').exists()).toBe(true)
  const link = wrapper.find('[data-testid="venue-deals"] a.deal-rows__row')
  expect(link?.attributes('href')).toBe(`/deals/bbbbbbbbbbbbbbbbbbbbbbbb?cat=food&at=${venueId}`)
})

it('reopens a recently viewed venue at once without asking the server again', async () => {
  rest.venue.mockResolvedValue(detail)
  const first = await mountAt(`/venues/${venueId}`)
  first.wrapper.unmount()

  const reopened = (await mountAt(`/venues/${venueId}`)).wrapper
  expect(reopened.text()).not.toContain('Loading venue')
  expect(reopened.find('h1').text()).toBe('Synthetic Kopi Tampines')
  await flushPromises()
  expect(rest.venue).toHaveBeenCalledTimes(1)
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

it("reuses the map's loaded deal so the card shows its freshness and other outlets", async () => {
  const loaded = makeDeal({
    id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
    title: 'Kopi set',
    votes: { alive: 5, dead: 0 },
    venues: [
      { id: venueId, name: 'Synthetic Kopi Tampines', lat: 1.35, lng: 103.94 },
      { id: 'e'.repeat(24), name: 'Synthetic Kopi Bedok', lat: 1.32, lng: 103.93 },
    ],
  })
  rest.list.mockResolvedValue({ items: [loaded], categories: ['DRINKS'] })
  rest.venue.mockResolvedValue(detail)
  const { wrapper } = await mountAt(`/venues/${venueId}`)
  const card = wrapper.findAll('[data-testid="venue-deals"] > li')[0]
  expect(card?.text()).toContain('Likely still on')
  expect(card?.text()).toContain('+1 more outlet')
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
