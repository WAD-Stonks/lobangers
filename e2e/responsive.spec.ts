import { expect, type Page, test } from '@playwright/test'

// Every shell route at every test width: no horizontal scroll, nothing sticking out past the
// viewport, 44px touch targets below 992px, and no runtime errors. The API is mocked with
// labelled synthetic fixtures, including an 80-character unbroken title.
const VENUE = { id: 'a'.repeat(24), name: 'Synthetic Albert Centre', lat: 1.3016, lng: 103.8527 }
const LONG_TITLE = 'Synthetic'.repeat(9).slice(0, 80)
const DEALS = [
  {
    id: '1'.repeat(24),
    title: LONG_TITLE,
    category: 'FOOD',
    cuisine: null,
    label: '$3.80',
    description: 'Synthetic deal with a deliberately unbroken title.',
    offerType: 'FIXED_PRICE',
    priceMinor: 380,
    discountPercent: null,
    terms: 'Synthetic terms that run long enough to wrap onto several lines in a narrow panel.',
    validUntil: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    rawValidityText: null,
    votes: { alive: 4, dead: 0 },
    commentCount: 2,
    venues: [VENUE],
  },
]
const VENUE_DETAIL = {
  venue: {
    id: VENUE.id,
    name: VENUE.name,
    address: 'Synthetic Block 270, Queen Street, Market and Food Centre, Unit 01-27, Bras Basah',
    area: 'Bras Basah',
    postalCode: '180270',
    merchantName: 'Synthetic Hawker Collective',
  },
  deals: [],
  pastDeals: [],
}

const WIDTHS = [320, 360, 390, 768, 834, 1024, 1194, 1280, 1440]
const ROUTES = [
  '/browse',
  '/browse?view=list',
  `/deals/${DEALS[0]?.id}`,
  `/venues/${VENUE.id}`,
  '/login',
  '/add',
]
const TOUCH_MAX_WIDTH = 992
const MIN_TARGET_PX = 44

const mockApi = async (page: Page) => {
  await page.route(/basemaps\.cartocdn\.com|onemap\.gov\.sg/, (route) => route.abort())
  await page.route('**/api/auth/get-session*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }),
  )
  await page.route('**/api/deals*', (route) =>
    route.fulfill({ json: { items: DEALS, categories: ['FOOD'] } }),
  )
  await page.route(`**/api/venues/${VENUE.id}`, (route) => route.fulfill({ json: VENUE_DETAIL }))
}

for (const width of WIDTHS) {
  for (const route of ROUTES) {
    test(`${route} fits ${width}px`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.setViewportSize({ width, height: 800 })
      await mockApi(page)
      await page.goto(route)
      await expect(page.getByTestId('shell-panel').locator('[data-panel-heading]')).toBeVisible()

      // 1. No horizontal page scroll.
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)

      // 2. No visible element sticks out past the viewport edge.
      const offenders = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('body *')]
          .filter((el) => el.offsetParent !== null && !el.closest('.leaflet-container'))
          .filter((el) => {
            const r = el.getBoundingClientRect()
            return r.width > 0 && (r.left < -1 || r.right > window.innerWidth + 1)
          })
          .map((el) => el.dataset.testid ?? el.className),
      )
      expect(offenders).toEqual([])

      // 3. Every button is at least 44px on touch widths.
      if (width < TOUCH_MAX_WIDTH) {
        const small = await page.getByRole('button').evaluateAll(
          (els, min) =>
            els
              .filter((el) => {
                const r = el.getBoundingClientRect()
                return r.width > 0 && (r.width < min || r.height < min)
              })
              .map((el) => el.getAttribute('aria-label') ?? el.textContent),
          MIN_TARGET_PX,
        )
        expect(small).toEqual([])
      }

      expect(errors).toEqual([])
    })
  }
}

test('long text never widens the panel', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await mockApi(page)
  for (const route of ['/browse', `/deals/${DEALS[0]?.id}`, `/venues/${VENUE.id}`]) {
    await page.goto(route)
    const body = page.getByTestId('panel-body')
    await expect(body).toBeVisible()
    const fits = await body.evaluate((element) => element.scrollWidth <= element.clientWidth)
    expect(fits, route).toBe(true)
  }
})

test('the sticky action bar never covers the last item', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 667 })
  await mockApi(page)
  await page.goto(`/deals/${DEALS[0]?.id}`)
  const body = page.getByTestId('panel-body')
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  const lastBottom = await body.evaluate(
    (element) => element.lastElementChild?.getBoundingClientRect().bottom ?? 0,
  )
  const barTop = await page
    .locator('.panel-frame__actions')
    .evaluate((element) => element.getBoundingClientRect().top)
  expect(lastBottom).toBeLessThanOrEqual(barTop + 1)
})

test('the filter sheet fits without scrolling inside on tablet and desktop', async ({ page }) => {
  await mockApi(page)
  for (const width of [768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/browse')
    await page.getByTestId('all-filters').click()
    const body = page.getByTestId('filter-sheet-body')
    await expect(body).toBeVisible()
    const fits = await body.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)
    expect(fits, `${width}px`).toBe(true)
  }
})

test('the chip row sits below the search field and no chip is clipped', async ({ page }) => {
  await mockApi(page)
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/browse')
    const search = await page.getByRole('search').boundingBox()
    const chips = await page.getByTestId('quick-chips').boundingBox()
    expect(chips && search && chips.y >= search.y + search.height, `${width}px`).toBe(true)
    const clipped = await page
      .getByTestId('quick-chips')
      .locator('button:visible')
      .evaluateAll(
        (els) => els.filter((el) => el.getBoundingClientRect().right > window.innerWidth).length,
      )
    expect(clipped, `${width}px`).toBe(0)
  }
})

test('reduced motion keeps the hot card still but panels still change', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install()
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.route(/basemaps\.cartocdn\.com|onemap\.gov\.sg/, (route) => route.abort())
  await page.route('**/api/auth/get-session*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }),
  )
  const second = { ...DEALS[0], id: '2'.repeat(24), title: 'Synthetic second deal' }
  await page.route('**/api/deals*', (route) =>
    route.fulfill({ json: { items: [...DEALS, second], categories: ['FOOD'] } }),
  )
  await page.goto('/browse')
  await expect(page.getByTestId('hot-position')).toHaveText('1 of 2')
  await page.clock.runFor(6000)
  await expect(page.getByTestId('hot-position')).toHaveText('1 of 2')
  await page.getByTestId('hot-open').click()
  await expect(page).toHaveURL(/\/deals\//)
})

test('screenshots for review', async ({ page }, info) => {
  test.setTimeout(120_000)
  await mockApi(page)
  // Opacity 1 means the enter transition has finished.
  const settled = (testId: string) =>
    expect
      .poll(() => page.getByTestId(testId).evaluate((el) => getComputedStyle(el).opacity))
      .toBe('1')
  for (const width of [390, 834, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 844 })
    for (const [name, route] of [
      ['browse', '/browse'],
      ['deal', `/deals/${DEALS[0]?.id}`],
      ['venue', `/venues/${VENUE.id}`],
    ] as const) {
      await page.goto(route)
      await expect(page.getByTestId('splash-screen')).toBeHidden()
      await expect(page.getByTestId('shell-panel').locator('[data-panel-heading]')).toBeVisible()
      await page.screenshot({ path: info.outputPath(`map-shell-${name}-${width}.png`) })
    }
    await page.goto('/browse')
    await expect(page.getByTestId('splash-screen')).toBeHidden()
    await page.getByTestId('all-filters').click()
    await settled('filter-sheet')
    await page.screenshot({ path: info.outputPath(`map-shell-filters-${width}.png`) })
    await page.keyboard.press('Escape')
    await page.getByTestId('nav-toggle').click()
    await settled('nav-menu')
    await page.screenshot({ path: info.outputPath(`map-shell-menu-${width}.png`) })
  }
})
