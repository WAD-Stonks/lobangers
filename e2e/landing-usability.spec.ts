import { expect, test } from '@playwright/test'

// Synthetic API fixtures exercise the actual landing page, client, routing and responsive CSS.
const venueId = 'a'.repeat(24)
const deals = Array.from({ length: 6 }, (_, index) => ({
  id: String(index + 1).padStart(24, '0'),
  title: `Synthetic meal ${index + 1}`,
  category: 'FOOD',
  cuisine: 'Chinese',
  label: '$5',
  description: 'Synthetic promotion',
  offerType: 'FIXED_PRICE',
  priceMinor: 500,
  discountPercent: null,
  terms: null,
  validUntil: '2050-01-01T00:00:00.000Z',
  rawValidityText: null,
  votes: {
    alive: index === 0 ? 3 : 0,
    dead: 0,
    status: index === 0 ? 'LIKELY_STILL_ON' : 'NO_RECENT_REPORTS',
  },
  commentCount: 0,
  images: [],
  venues: [{ id: venueId, name: 'Synthetic Woodlands outlet', lat: 1.4382, lng: 103.789 }],
}))
for (const width of [320, 390, 1440]) {
  test(`landing navigation, cards and controls at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await page.route('**/api/**', (route) => {
      const path = new URL(route.request().url()).pathname
      if (path === '/api/auth/get-session') return route.fulfill({ json: null })
      if (path === '/api/deals')
        return route.fulfill({ json: { items: deals, categories: ['FOOD'] } })
      return route.fulfill({
        status: 404,
        json: { error: { code: 'NOT_FOUND', message: 'Synthetic unavailable endpoint' } },
      })
    })
    await page.goto('/')
    await expect(page.locator('.hero-live-card')).toBeVisible()
    await expect(page.locator('.hero-deal-action')).toHaveAttribute(
      'href',
      new RegExp(`/deals/\\d{24}\\?at=${venueId}`),
    )
    await expect(page.locator('.hero-restaurant-link')).toHaveAttribute(
      'href',
      `/venues/${venueId}`,
    )
    if (width < 1100) await page.locator('.landing-menu-toggle').click()
    const how = page.getByRole('link', { name: 'How it works', exact: true })
    await expect(how).toHaveAttribute('href', '#story')
    await how.click()
    await expect(page.locator('.landing-mobile-menu')).toHaveCount(0)
    await page.locator('#cuisines').scrollIntoViewIfNeeded()
    const cards = page.locator('.landing-food-card')
    await expect(cards).toHaveCount(width < 600 ? 1 : 4)
    await expect(cards.first().locator('.landing-card-primary')).toHaveAttribute(
      'href',
      `/deals/${deals[0]?.id}?at=${venueId}`,
    )
    await expect(cards.first().locator('.landing-verification-badge')).toHaveText(
      '✓ Likely still on',
    )
    await expect(cards.first().locator('.landing-card-location')).toContainText('Woodlands')
    const controls = page.locator('.landing-carousel-controls')
    await controls.scrollIntoViewIfNeeded()
    const bounds = await page.evaluate(() => ({
      grid: document.querySelector('.landing-deal-grid')?.getBoundingClientRect().bottom ?? 0,
      controls:
        document.querySelector('.landing-carousel-controls')?.getBoundingClientRect().top ?? 0,
    }))
    expect(bounds.controls).toBeGreaterThanOrEqual(bounds.grid)
    await controls.getByRole('button', { name: 'Next deals', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.landing-carousel-status')).toContainText(
      width < 600 ? 'Showing 2–2' : 'Showing 5–6',
    )
    await controls.getByRole('button', { name: 'Previous deals', exact: true }).click()
    await page.screenshot({ path: info.outputPath(`landing-deals-${width}.png`) })
    const fonts = await page
      .locator('.story-playback-toggle')
      .evaluateAll((elements) =>
        elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
      )
    expect(fonts.every((size) => size >= 14)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  })
}
