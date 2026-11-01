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
      json: {
        alive: 2,
        dead: 0,
        status: 'UNCERTAIN',
        myVote: null,
        myVoteIsRecent: false,
        lastReportedAt: null,
        asOf: new Date().toISOString(),
        commentCount: 0,
        policy: { minAlive: 3, positivePercent: 80, windowHours: 24 },
      },
    }),
  )
  await page.route('**/api/deals/*/comments*', (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } }),
  )
}

export const SYNTHETIC_USER = {
  id: 'f1'.repeat(12),
  name: 'Synthetic Allison',
  email: 'synthetic-allison@example.test',
  emailVerified: true,
  role: 'USER',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

// A signed-in synthetic visitor. Registered after mockPublicApi so it wins for /api/me.
export const mockSignedIn = async (page: Page) => {
  const expiresAt = new Date(Date.now() + 86_400_000).toISOString()
  await page.route('**/api/auth/get-session*', (route) =>
    route.fulfill({
      json: {
        user: SYNTHETIC_USER,
        session: {
          id: 'synthetic-session',
          userId: SYNTHETIC_USER.id,
          expiresAt,
          createdAt: SYNTHETIC_USER.createdAt,
          updatedAt: SYNTHETIC_USER.updatedAt,
        },
      },
    }),
  )
  await page.route('**/api/me', (route) =>
    route.fulfill({ json: { user: SYNTHETIC_USER, session: { expiresAt } } }),
  )
  await page.route('**/api/account/bookmarks*', (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } }),
  )
}

const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()

// A live, fake Flash Drop on the synthetic chicken rice deal.
export const flashDrop = (overrides: Record<string, unknown> = {}) => ({
  id: 'e1'.repeat(12),
  dealId: 'd2'.repeat(12),
  dealTitle: 'Synthetic chicken rice set',
  category: 'FOOD',
  venueId: VENUES.chicken.id,
  venueName: VENUES.chicken.name,
  lat: VENUES.chicken.lat,
  lng: VENUES.chicken.lng,
  flashPriceCents: 150,
  usualPriceCents: 350,
  startsAt: inMinutes(-5),
  endsAt: inMinutes(25),
  radiusMetres: 500,
  codesLeft: 12,
  codeLimit: 40,
  demo: true,
  ...overrides,
})

// Live drops, claiming (one code per person) and My codes, kept in memory per page.
export const mockFlashApi = async (page: Page, drops: readonly ReturnType<typeof flashDrop>[]) => {
  const codes: Record<string, unknown>[] = []
  await page.route('**/api/flash-drops/active', (route) =>
    route.fulfill({ json: { serverTime: new Date().toISOString(), items: drops } }),
  )
  await page.route('**/api/flash-drops/codes', (route) => route.fulfill({ json: { items: codes } }))
  await page.route('**/api/flash-drops/*/claims', (route) => {
    const dropId = new URL(route.request().url()).pathname.split('/')[3]
    const drop = drops.find((item) => item.id === dropId)
    if (!drop)
      return route.fulfill({
        status: 404,
        json: { error: { code: 'NOT_FOUND', message: 'Flash drop not found' } },
      })
    if (drop.codesLeft <= 0)
      return route.fulfill({
        status: 409,
        json: {
          error: { code: 'CONFLICT', message: 'All the codes for this drop have been claimed' },
        },
      })
    const code = {
      code: 'LB-7KQ2MX',
      dropId: drop.id,
      dealId: drop.dealId,
      dealTitle: drop.dealTitle,
      venueName: drop.venueName,
      flashPriceCents: drop.flashPriceCents,
      claimedAt: new Date().toISOString(),
      endsAt: drop.endsAt,
      active: true,
      demo: drop.demo,
    }
    if (!codes.some((item) => item.dropId === drop.id)) codes.unshift(code)
    return route.fulfill({ status: 201, json: code })
  })
}
