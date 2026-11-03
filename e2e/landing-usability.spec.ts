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
const deals = Array.from({ length: 8 }, (_, index) => ({
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
      new RegExp(`/deals/\\d{24}\\?at=${venueId}&view=list&discovery=1`),
    )
    await expect(page.locator('.hero-restaurant-link')).toHaveAttribute(
      'href',
      `/venues/${venueId}`,
    )
    // The site menu opens the same drawer as on every other page.
    await page.getByTestId('nav-toggle').click()
    await expect(page.getByTestId('nav-menu')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('nav-menu')).toHaveCount(0)
    // Phones fold the bar's links away; wider screens keep How it works in the bar.
    if (width >= 800) {
      const how = page.getByRole('link', { name: 'How it works', exact: true })
      await expect(how).toHaveAttribute('href', '#story')
      await how.click()
    }
    await page.locator('#cuisines').scrollIntoViewIfNeeded()
    // The All Deals card: the whole card opens the deal over the All Deals list.
    // One row per page, as many cards as the width fits.
    const perPage = width < 600 ? 2 : 5
    const cards = page.locator('.food-deal-card')
    await expect(cards).toHaveCount(perPage)
    await expect(cards.first().locator('.food-deal-card__link')).toHaveAttribute(
      'href',
      `/deals/${deals[0]?.id}?at=${venueId}&view=list&discovery=1`,
    )
    await expect(cards.first().locator('.food-deal-card__status')).toHaveText('Likely still on')
    await expect(cards.first().locator('.food-deal-card__description')).toHaveText(
      'Synthetic meal 1',
    )
    const controls = page.locator('.landing-carousel-controls')
    await expect(
      page.locator('.deal-grid-toolbar').getByRole('link', { name: 'View all food deals' }),
    ).toHaveAttribute('href', '/deals?cat=food')
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
      `Showing ${perPage + 1}–${Math.min(2 * perPage, deals.length)}`,
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
  await page.setViewportSize({ width: 390, height: 844 })
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
  // One row of skeletons, as many as the width fits; the loaded cards replace them one for one.
  const skeletons = await section.locator('.landing-skeleton-card').count()
  expect(skeletons).toBeGreaterThanOrEqual(2)
  await expect(page.locator('.hero-loading-card')).toHaveAttribute('role', 'status')
  await expect(page.locator('.hero-map-area')).toHaveClass(/hero-map-docked/)
  const skeletonPosition = await page.locator('.hero-loading-card').evaluate((element) => {
    const { x, y } = element.getBoundingClientRect()
    return { x, y }
  })
  release()
  await expect(section.locator('.landing-skeleton-card')).toHaveCount(0)
  await expect(section.locator('.food-deal-card')).toHaveCount(skeletons)
  const featuredCard = page.locator('.hero-live-card:not(.hero-loading-card)')
  await expect(featuredCard).toBeVisible()
  await expect(page.locator('.hero-map-area')).toHaveClass(/hero-map-docked/)
  const featuredPosition = await featuredCard.evaluate((element) => {
    const { x, y } = element.getBoundingClientRect()
    return { x, y }
  })
  expect(featuredPosition.x).toBeCloseTo(skeletonPosition.x, 0)
  expect(featuredPosition.y).toBeCloseTo(skeletonPosition.y, 0)
  await expect(section.locator('.food-deal-card__description').first()).toHaveText(
    'Synthetic meal 1',
  )
  expect(calls).toBe(2)
})
