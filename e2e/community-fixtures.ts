import type { Page } from '@playwright/test'

// Labelled synthetic fixtures for the community-feature journeys (pins, Flash Drop, Makan Squad
// and Hungry Nearby). Every record is fake; nothing here touches a real account or database.
export const HOME = { latitude: 1.3236, longitude: 103.9273 }

const venue = (id: string, name: string, lat: number, lng: number) => ({ id, name, lat, lng })

export const VENUES = {
  kopi: venue('a1'.repeat(12), 'Synthetic Kopi Corner', 1.3241, 103.9281),
  chicken: venue('a2'.repeat(12), 'Synthetic Ah Seng Chicken Rice', 1.3229, 103.9262),
  boba: venue('a3'.repeat(12), 'Synthetic Boba Lab', 1.3248, 103.9256),
  prata: venue('a4'.repeat(12), 'Synthetic Prata House', 1.3222, 103.9289),
  far: venue('a5'.repeat(12), 'Synthetic Jurong Hawker', 1.3331, 103.7431),
  farTwo: venue('a6'.repeat(12), 'Synthetic Woodlands Bakery', 1.4361, 103.7861),
}

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()

export const deal = (id: string, title: string, overrides: Record<string, unknown> = {}) => ({
  id,
  title,
  category: 'FOOD',
  cuisine: null,
  label: title,
  description: `Fake deal. Synthetic description for ${title}.`,
  offerType: 'FIXED_PRICE',
  priceMinor: null,
  discountPercent: null,
  terms: null,
  validUntil: inDays(3),
  rawValidityText: null,
  votes: { alive: 2, dead: 0 },
  commentCount: 0,
  images: [],
  venues: [VENUES.kopi],
  ...overrides,
})

export const DEALS = [
  deal('d1'.repeat(12), 'Synthetic kopi O', {
    category: 'DRINKS',
    label: '$1.20',
    priceMinor: 120,
    discountPercent: 40,
    offerType: 'PERCENT_OFF',
  }),
  deal('d2'.repeat(12), 'Synthetic chicken rice set', {
    label: '$3.50',
    priceMinor: 350,
    venues: [VENUES.chicken],
  }),
  deal('d3'.repeat(12), 'Synthetic brown sugar boba', {
    category: 'DRINKS',
    label: '$3.40',
    priceMinor: 340,
    offerType: 'BUY_ONE_GET_ONE',
    venues: [VENUES.boba],
  }),
  deal('d4'.repeat(12), 'Synthetic plain prata', {
    label: '2 for $1',
    offerType: 'OTHER',
    validUntil: new Date(Date.now() + 3 * 3_600_000).toISOString(),
    venues: [VENUES.prata],
  }),
  deal('d5'.repeat(12), 'Synthetic prata kosong set', {
    label: '$2.10',
    priceMinor: 210,
    venues: [VENUES.prata],
  }),
  deal('d6'.repeat(12), 'Synthetic fishball noodles', {
    label: '$4.50',
    priceMinor: 450,
    venues: [VENUES.far],
  }),
  deal('d7'.repeat(12), 'Synthetic kaya toast', {
    category: 'BAKERY',
    label: '1-for-1',
    offerType: 'BUY_ONE_GET_ONE',
    venues: [VENUES.farTwo],
  }),
]

// The public reads every map screen makes. Writes are mocked by each journey.
export const mockPublicApi = async (page: Page, deals: readonly unknown[] = DEALS) => {
  await page.route('**/api/deals*', (route) =>
    route.fulfill({ json: { items: deals, categories: ['FOOD', 'DRINKS', 'BAKERY'] } }),
  )
  await page.route('**/api/me', (route) =>
    route.fulfill({ status: 401, json: { error: 'Unauthorized' } }),
  )
  await page.route('**/api/deals/*/community', (route) =>
    route.fulfill({
      json: { votes: { alive: 2, dead: 0 }, myVote: null, status: 'FRESH', commentCount: 0 },
    }),
  )
  await page.route('**/api/deals/*/comments*', (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } }),
  )
}
