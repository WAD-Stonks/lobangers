import { expect, test } from '@playwright/test'

// Synthetic API fixtures exercise the actual landing page, client, routing and responsive CSS.
const venueId = 'a'.repeat(24)
const address = '1 Woodlands Square, Singapore 738099'
const venueResponse = {
  venue: {
    id: venueId,
    name: 'Synthetic Woodlands outlet',
    address,
    area: 'Woodlands',
    postalCode: '738099',
    merchantName: 'Synthetic',
  },
  deals: [],
  pastDeals: [],
}
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
      if (path === `/api/venues/${venueId}`) return route.fulfill({ json: venueResponse })
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
    await expect(cards.first().locator('.landing-card-location')).toHaveText(address)
    const loginHref = await cards
      .first()
      .getByRole('link', { name: 'Log in to save' })
      .getAttribute('href')
    expect(new URL(loginHref ?? '', 'http://localhost').searchParams.get('redirect')).toBe(
      `/deals/${deals[0]?.id}?at=${venueId}`,
    )
    const controls = page.locator('.landing-carousel-controls')
    await expect(
      page.locator('.deal-grid-toolbar').getByRole('link', { name: 'View all food deals' }),
    ).toHaveAttribute('href', '/browse?cat=food')
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
    if (width === 390) {
      const story = page.locator('.cinematic-story')
      expect(
        await story.evaluate((el) => el.getBoundingClientRect().height / innerHeight),
      ).toBeCloseTo(5.2, 1)
      for (const progress of [0.25, 0.6, 0.9]) {
        await story.evaluate((el, p) => {
          const top = el.getBoundingClientRect().top + scrollY
          window.scrollTo({
            top: top + (el.getBoundingClientRect().height - innerHeight) * p,
            behavior: 'instant',
          })
        }, progress)
        await expect(page.getByRole('link', { name: 'Skip to food deals' })).toBeVisible()
      }
      await page.getByRole('link', { name: 'Skip to food deals' }).click()
      await expect(page).toHaveURL(/#cuisines$/)
    }
    const fonts = await page
      .locator('.story-playback-toggle')
      .evaluateAll((elements) =>
        elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
      )
    expect(fonts.every((size) => size >= 14)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  })
}

test('failed deals can retry, with skeletons until the replacement response arrives', async ({
  page,
}) => {
  let calls = 0
  let release!: () => void
  const ready = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/auth/get-session') return route.fulfill({ json: null })
    if (path === `/api/venues/${venueId}`) return route.fulfill({ json: venueResponse })
    if (path === '/api/deals') {
      calls++
      if (calls === 1)
        return route.fulfill({
          status: 503,
          json: { error: { code: 'UNAVAILABLE', message: 'Synthetic error' } },
        })
      await ready
      return route.fulfill({ json: { items: deals, categories: ['FOOD'] } })
    }
    return route.fulfill({ status: 404, json: {} })
  })
  await page.goto('/')
  const section = page.locator('#cuisines')
  await section.getByRole('button', { name: 'Retry loading deals' }).click()
  await expect(section.locator('.landing-skeleton-card')).toHaveCount(4)
  await expect(page.locator('.hero-loading-card')).toHaveAttribute('aria-busy', 'true')
  release()
  await expect(section.locator('.landing-skeleton-card')).toHaveCount(0)
  await expect(section.locator('.landing-food-card')).toHaveCount(4)
  await expect(section.locator('.landing-card-location').first()).toHaveText(address)
  expect(calls).toBe(2)
})
