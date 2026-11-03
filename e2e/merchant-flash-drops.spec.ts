import { expect, type Page, test } from '@playwright/test'

// Merchant Flash Drop journeys on /merchant. Flash drops still run on their in-browser sample
// data (USE_SAMPLE_DATA in merchant-api.ts), but the merchant's outlets and deals come from the
// server, so those routes are mocked here along with the signed-in merchant session.
// Every account, outlet and deal below is a labelled synthetic fixture; nothing touches real data.
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

// The outlets and deals the sample flash drops were written against (two branches of one
// franchise; sample-4 has a set price for a flash drop to beat).
const SYNTHETIC_OUTLETS = [
  { id: 'outlet-1', name: 'Ah Seng Chicken Rice (Maxwell)', address: '1 Kadayanallur St, #01-10' },
  { id: 'outlet-2', name: 'Ah Seng Chicken Rice (Tiong Bahru)', address: '30 Seng Poh Rd, #02-05' },
]
const syntheticDeal = (id: string, title: string, offer: Record<string, unknown>) => ({
  id,
  title,
  description: 'Fake deal for tests.',
  category: 'FOOD',
  cuisine: 'CHINESE',
  outletIds: ['outlet-1', 'outlet-2'],
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
  syntheticDeal('sample-1', '1-for-1 Roast Chicken Rice', {}),
  syntheticDeal('sample-4', 'Steamed chicken rice set', {
    offerType: 'FIXED_PRICE',
    priceCents: 350,
  }),
]

const signInAsMerchant = async (page: Page) => {
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
    // Flash drops make no API calls while they use sample data.
    return route.fulfill({
      status: 404,
      json: { error: { code: 'NOT_FOUND', message: 'Not found' } },
    })
  })
  // Withdraw / end early ask for confirmation.
  page.on('dialog', (dialog) => dialog.accept())
  await page.goto('/merchant')
  await expect(page.getByRole('heading', { name: 'Merchant dashboard' })).toBeVisible()
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

test('send a flash drop for review, approve it (demo) and end it early', async ({ page }) => {
  await signInAsMerchant(page)
  await expect(page.getByText('the flash drops on this page are sample data')).toBeVisible()

  await dealCard(page, 'Steamed chicken rice set')
    .getByRole('button', { name: 'Flash drop this' })
    .click()
  await expect(page.getByRole('heading', { name: 'New flash drop' })).toBeVisible()
  await expect(page.getByLabel('Which deal?')).toHaveValue('sample-4')

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
  await expect(fresh).toContainText('Fake deal')

  await fresh.getByRole('button', { name: 'Simulate approval (demo)' }).click()
  await expect(fresh.locator('.badge')).toHaveText('Live')
  await expect(fresh).toContainText('of 40 claimed')

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
  await signInAsMerchant(page)
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
})

for (const width of [390, 834, 1280]) {
  test(`review screenshots at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await signInAsMerchant(page)

    await page.getByRole('heading', { name: 'Flash drops' }).scrollIntoViewIfNeeded()
    await expectNoSideScroll(page)
    await page.screenshot({ path: info.outputPath(`drops-list-${width}.png`), fullPage: true })

    await page.getByRole('button', { name: 'New flash drop' }).click()
    await page.getByLabel('Which deal?').selectOption('sample-4')
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
