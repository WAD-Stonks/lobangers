import { expect, type Page, type Route, test } from '@playwright/test'

// Merchant Flash Drop journeys on /merchant. The page talks to the real routes, so the signed-in
// merchant session, their outlets and deals, and the flash drop routes are all mocked here. The
// flash drop routes keep their state in memory for each test, like a tiny server, and the test
// plays the LoBangers reviewer by changing that state.
// Every account, outlet, deal and drop below is a labelled synthetic fixture; nothing touches
// real data.
const now = new Date().toISOString()
const SYNTHETIC_MERCHANT = {
  id: 'e'.repeat(24),
  name: 'Synthetic merchant (test fixture)',
  email: 'synthetic-merchant@example.test',
  emailVerified: true,
  role: 'MERCHANT',
  createdAt: now,
  updatedAt: now,
}
const SYNTHETIC_SESSION = {
  id: 'synthetic-merchant-session',
  userId: SYNTHETIC_MERCHANT.id,
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  createdAt: now,
  updatedAt: now,
}

// Two branches of one franchise; the set-price deal has a usual price for a flash drop to beat.
// Ids are 24-character hex strings because the typed client checks them.
const OUTLET_MAXWELL = '1'.repeat(24)
const OUTLET_TIONG_BAHRU = '2'.repeat(24)
const DEAL_BOGO = '3'.repeat(24)
const DEAL_SET = '4'.repeat(24)
const SYNTHETIC_OUTLETS = [
  {
    id: OUTLET_MAXWELL,
    name: 'Ah Seng Chicken Rice (Maxwell)',
    address: '1 Kadayanallur St, #01-10',
  },
  {
    id: OUTLET_TIONG_BAHRU,
    name: 'Ah Seng Chicken Rice (Tiong Bahru)',
    address: '30 Seng Poh Rd, #02-05',
  },
]
const syntheticDeal = (id: string, title: string, offer: Record<string, unknown>) => ({
  id,
  title,
  description: 'Fake deal for tests.',
  category: 'FOOD',
  cuisine: 'CHINESE',
  outletIds: [OUTLET_MAXWELL, OUTLET_TIONG_BAHRU],
  offerType: 'BUY_ONE_GET_ONE',
  discountPercent: null,
  priceCents: null,
  startDate: '',
  endDate: '',
  terms: '',
  endedAt: null,
  photo: null,
  ...offer,
})
const SYNTHETIC_DEALS = [
  syntheticDeal(DEAL_BOGO, '1-for-1 Roast Chicken Rice', {}),
  syntheticDeal(DEAL_SET, 'Steamed chicken rice set', {
    offerType: 'FIXED_PRICE',
    priceCents: 350,
  }),
]

type FlashDropBody = {
  dealId: string
  outletId: string
  flashPriceCents: number
  startsAt: string
  durationMinutes: number
  radiusMetres: number
  codeLimit: number
  version?: number
}
type FakeDrop = Omit<FlashDropBody, 'durationMinutes' | 'version'> & {
  id: string
  dealTitle: string
  outletName: string
  usualPriceCents: number | null
  endsAt: string
  claimedCount: number
  status: 'IN_REVIEW' | 'SCHEDULED' | 'LIVE' | 'ENDED' | 'SENT_BACK' | 'STOPPED'
  reviewNote: string | null
  version: number
  demo: boolean
}

const HOUR_MS = 3_600_000
const isoIn = (ms: number) => new Date(Date.now() + ms).toISOString()

// Fills in the names and times the server works out from what the form sent.
const dropFrom = (id: string, body: FlashDropBody, version: number): FakeDrop => {
  const deal = SYNTHETIC_DEALS.find((item) => item.id === body.dealId)
  const outlet = SYNTHETIC_OUTLETS.find((item) => item.id === body.outletId)
  const startMs = Math.max(Date.parse(body.startsAt), Date.now())
  return {
    id,
    dealId: body.dealId,
    dealTitle: deal?.title ?? 'Unknown deal',
    outletId: body.outletId,
    outletName: outlet?.name ?? 'Unknown outlet',
    flashPriceCents: body.flashPriceCents,
    usualPriceCents: (deal?.priceCents as number | null) ?? null,
    startsAt: new Date(startMs).toISOString(),
    endsAt: new Date(startMs + body.durationMinutes * 60_000).toISOString(),
    radiusMetres: body.radiusMetres,
    codeLimit: body.codeLimit,
    claimedCount: 0,
    status: 'IN_REVIEW',
    reviewNote: null,
    version,
    demo: false,
  }
}

// The merchant's drops as the server would hold them: one in review, one sent back.
const startingDrops = (): FakeDrop[] => [
  dropFrom(
    '5'.repeat(24),
    {
      dealId: DEAL_SET,
      outletId: OUTLET_TIONG_BAHRU,
      flashPriceCents: 250,
      startsAt: isoIn(3 * HOUR_MS),
      durationMinutes: 30,
      radiusMetres: 300,
      codeLimit: 30,
    },
    1,
  ),
  {
    ...dropFrom(
      '6'.repeat(24),
      {
        dealId: DEAL_BOGO,
        outletId: OUTLET_MAXWELL,
        flashPriceCents: 300,
        startsAt: isoIn(27 * HOUR_MS),
        durationMinutes: 60,
        radiusMetres: 1000,
        codeLimit: 100,
      },
      2,
    ),
    status: 'SENT_BACK',
    reviewNote:
      'A 1 km circle reaches two other chicken rice drops at that time. Please use 500 m.',
  },
]

// An in-memory stand-in for /api/merchant/flash-drops. It also records each request body.
const fakeFlashDropServer = () => {
  let drops = startingDrops()
  let nextId = 7
  const sent: { method: string; path: string; body: unknown }[] = []
  const put = (updated: FakeDrop) => {
    drops = drops.map((drop) => (drop.id === updated.id ? updated : drop))
    return updated
  }
  const find = (id: string) => drops.find((drop) => drop.id === id)

  const handle = (route: Route, path: string) => {
    const method = route.request().method()
    const body = route.request().postDataJSON() as FlashDropBody | null
    sent.push({ method, path, body })
    if (path === '/api/merchant/flash-drops' && method === 'GET')
      return route.fulfill({ json: { items: drops } })
    if (path === '/api/merchant/flash-drops' && method === 'POST' && body) {
      const created = dropFrom(String(nextId++).repeat(24), body, 1)
      drops = [created, ...drops]
      return route.fulfill({ status: 201, json: created })
    }
    const match = path.match(/^\/api\/merchant\/flash-drops\/([0-9a-f]{24})(\/end)?$/)
    const drop = match ? find(match[1] ?? '') : undefined
    if (!drop || !body) return undefined
    if (body.version !== drop.version)
      return route.fulfill({
        status: 409,
        json: { error: { code: 'CONFLICT', message: 'Conflict' } },
      })
    if (match?.[2] && method === 'POST')
      return route.fulfill({
        json: put({ ...drop, status: 'ENDED', endsAt: isoIn(0), version: drop.version + 1 }),
      })
    if (method === 'PUT')
      return route.fulfill({ json: put(dropFrom(drop.id, body, drop.version + 1)) })
    return undefined
  }

  // Plays the LoBangers reviewer and the people claiming codes.
  const approveAndClaim = (flashPriceCents: number, claimedCount: number) => {
    const drop = drops.find((item) => item.flashPriceCents === flashPriceCents)
    if (drop) put({ ...drop, status: 'LIVE', claimedCount, version: drop.version + 1 })
  }

  return { handle, approveAndClaim, sent }
}

const signInAsMerchant = async (page: Page) => {
  const flashDrops = fakeFlashDropServer()
  await page.route(/basemaps\.cartocdn\.com|onemap\.gov\.sg/, (route) => route.abort())
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.startsWith('/api/auth/get-session'))
      return route.fulfill({ json: { user: SYNTHETIC_MERCHANT, session: SYNTHETIC_SESSION } })
    if (path === '/api/me')
      return route.fulfill({
        json: { user: SYNTHETIC_MERCHANT, session: { expiresAt: SYNTHETIC_SESSION.expiresAt } },
      })
    if (path === '/api/merchant/outlets')
      return route.fulfill({ json: { items: SYNTHETIC_OUTLETS } })
    if (path === '/api/merchant/deals') return route.fulfill({ json: { items: SYNTHETIC_DEALS } })
    if (path.startsWith('/api/merchant/flash-drops')) {
      const handled = flashDrops.handle(route, path)
      if (handled) return handled
    }
    return route.fulfill({
      status: 404,
      json: { error: { code: 'NOT_FOUND', message: 'Not found' } },
    })
  })
  // Withdraw / end early ask for confirmation.
  page.on('dialog', (dialog) => dialog.accept())
  await page.goto('/merchant')
  await expect(page.getByRole('heading', { name: 'Merchant dashboard' })).toBeVisible()
  return flashDrops
}

const dealCard = (page: Page, title: string) =>
  page
    .locator('li.card')
    .filter({ has: page.getByRole('button', { name: 'Flash drop this' }) })
    .filter({ hasText: title })

const dropCard = (page: Page, text: string) =>
  page.locator('[data-testid^="flash-drop-"]').filter({ hasText: text })

const expectNoSideScroll = async (page: Page) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

test('send a flash drop for review, see it approved and end it early', async ({ page }) => {
  const server = await signInAsMerchant(page)
  await expect(page.getByText('sample data')).toHaveCount(0)

  await dealCard(page, 'Steamed chicken rice set')
    .getByRole('button', { name: 'Flash drop this' })
    .click()
  await expect(page.getByRole('heading', { name: 'New flash drop' })).toBeVisible()
  await expect(page.getByLabel('Which deal?')).toHaveValue(DEAL_SET)

  // Not lower than the usual $3.50.
  await page.getByLabel('Flash price ($)').fill('3.50')
  await page.getByRole('button', { name: 'Send for review' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'The flash price has to be lower than the usual $3.50.',
  )

  await page.getByLabel('Flash price ($)').fill('1.20')
  await page.getByText('Ah Seng Chicken Rice (Maxwell)', { exact: true }).click()
  await page.getByText('15 min', { exact: true }).click()
  await expect(page.getByTestId('flash-preview')).toHaveText(
    'FLASH DROP · $1.20 Steamed chicken rice set · 15:00 · within 500 m',
  )
  await page.getByRole('button', { name: 'Send for review' }).click()

  await expect(page.getByRole('status')).toContainText('was sent for review')
  const fresh = dropCard(page, 'Flash price $1.20')
  await expect(fresh).toContainText('In review')
  await expect(fresh).not.toContainText('Fake deal')
  await expect(fresh.getByRole('button', { name: /demo/ })).toHaveCount(0)
  expect(server.sent).toContainEqual(
    expect.objectContaining({
      method: 'POST',
      body: expect.objectContaining({
        dealId: DEAL_SET,
        outletId: OUTLET_MAXWELL,
        flashPriceCents: 120,
      }),
    }),
  )

  // LoBangers approves it and people start claiming codes; the page shows it after a reload.
  server.approveAndClaim(120, 12)
  await page.reload()
  await expect(fresh.locator('.badge')).toHaveText('Live')
  await expect(fresh).toContainText('12 of 40 claimed')

  await fresh.getByRole('button', { name: 'End drop early' }).click()
  await expect(fresh.locator('.badge')).toHaveText('Ended')
  await expect(page.getByRole('status')).toContainText('has ended')
})

test('withdraw a drop that is still in review', async ({ page }) => {
  await signInAsMerchant(page)
  const inReview = dropCard(page, 'Flash price $2.50')
  await inReview.getByRole('button', { name: 'Withdraw' }).click()
  await expect(inReview.locator('.badge')).toHaveText('Ended')
})

test('edit and resend a drop LoBangers sent back', async ({ page }) => {
  const server = await signInAsMerchant(page)
  const sentBack = dropCard(page, '1-for-1 Roast Chicken Rice')
  await expect(sentBack).toContainText('Sent back')
  await expect(sentBack).toContainText('LoBangers: “A 1 km circle')

  await sentBack.getByRole('button', { name: 'Edit and resend' }).click()
  await expect(page.getByRole('heading', { name: 'Edit and resend flash drop' })).toBeVisible()
  await expect(page.getByLabel('Flash price ($)')).toHaveValue('3')
  await page.getByText('500 m', { exact: true }).click()
  await page.getByRole('button', { name: 'Send for review' }).click()

  await expect(sentBack.locator('.badge')).toHaveText('In review')
  await expect(sentBack).toContainText('500 m')
  await expect(sentBack).not.toContainText('LoBangers: “')
  // The resend carries the version it was based on, so the server can spot a stale edit.
  expect(server.sent).toContainEqual(
    expect.objectContaining({
      method: 'PUT',
      body: expect.objectContaining({ radiusMetres: 500, version: 2 }),
    }),
  )
})

for (const width of [390, 834, 1280]) {
  test(`review screenshots at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await signInAsMerchant(page)

    await page.getByRole('heading', { name: 'Flash drops' }).scrollIntoViewIfNeeded()
    await expectNoSideScroll(page)
    await page.screenshot({ path: info.outputPath(`drops-list-${width}.png`), fullPage: true })

    await page.getByRole('button', { name: 'New flash drop' }).click()
    await page.getByLabel('Which deal?').selectOption(DEAL_SET)
    await page.getByLabel('Flash price ($)').fill('1.50')
    await page.getByText('Pick a time', { exact: true }).click()
    await expect(page.getByLabel('Start time')).toBeVisible()
    await expectNoSideScroll(page)
    if (width < 576) {
      // Phone touch targets: the chips and small buttons are at least 44px tall.
      const heights = await page
        .locator('.chip, [data-testid^="flash-drop-"] .btn-sm')
        .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height))
      expect(Math.min(...heights)).toBeGreaterThanOrEqual(44)
    }
    await page.getByRole('heading', { name: 'New flash drop' }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath(`form-open-${width}.png`), fullPage: true })
  })
}
