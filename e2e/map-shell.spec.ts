import { expect, type Page, test } from '@playwright/test'

// Map-shell journeys. The API is mocked at the browser boundary with labelled synthetic
// fixtures; map tiles are blocked so tests never depend on the network.
const VENUES = {
  north: { id: 'a'.repeat(24), name: 'Synthetic Woodlands Kopi', lat: 1.436, lng: 103.786 },
  west: { id: 'b'.repeat(24), name: 'Synthetic Jurong Hawker', lat: 1.333, lng: 103.743 },
  east: { id: 'c'.repeat(24), name: 'Synthetic Tampines Bakery', lat: 1.354, lng: 103.944 },
}
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()
const deal = (id: string, title: string, overrides: Record<string, unknown>) => ({
  id,
  title,
  category: 'FOOD',
  cuisine: null,
  label: title,
  description: `Synthetic description for ${title}.`,
  offerType: 'FIXED_PRICE',
  priceMinor: null,
  discountPercent: null,
  terms: null,
  validUntil: null,
  rawValidityText: null,
  votes: { alive: 2, dead: 0 },
  commentCount: 0,
  images: [],
  venues: [VENUES.north],
  ...overrides,
})
const DEALS = [
  deal('1'.repeat(24), 'Synthetic kopi set', {
    category: 'DRINKS',
    label: '$1.90',
    priceMinor: 190,
    validUntil: inDays(2),
  }),
  deal('2'.repeat(24), 'Synthetic fishball noodles', {
    label: '$6.50',
    priceMinor: 650,
    validUntil: inDays(3),
    venues: [VENUES.west],
  }),
  deal('3'.repeat(24), 'Synthetic kaya toast', {
    category: 'BAKERY',
    label: '1-for-1',
    offerType: 'BUY_ONE_GET_ONE',
    validUntil: inDays(4),
    venues: [VENUES.east],
  }),
]
const VENUE_DETAIL = {
  venue: {
    id: VENUES.west.id,
    name: VENUES.west.name,
    address: '1 Synthetic Street',
    area: 'Jurong',
    postalCode: '600001',
    merchantName: 'Synthetic Hawker',
  },
  deals: [],
  pastDeals: Array.from({ length: 12 }, (_, index) => ({
    id: `${index}`.padStart(24, 'f'),
    title: `Synthetic past deal ${index + 1}`,
    offerType: 'OTHER',
    priceMinor: null,
    currency: 'SGD',
    discountPercent: null,
    validUntil: '2026-09-30T16:00:00.000Z',
  })),
}

const mockApi = async (page: Page) => {
  await page.route(/basemaps\.cartocdn\.com|onemap\.gov\.sg/, (route) => route.abort())
  await page.route('**/api/auth/get-session*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }),
  )
  await page.route('**/api/deals*', (route) =>
    route.fulfill({ json: { items: DEALS, categories: ['BAKERY', 'DRINKS', 'FOOD'] } }),
  )
  await page.route(`**/api/venues/${VENUES.west.id}`, (route) =>
    route.fulfill({ json: VENUE_DETAIL }),
  )
}

// At island zoom the map sums deals up per region; tapping a group zooms one tier in.
const groups = (page: Page) => page.locator('.deal-map-cluster')
const openGroup = (page: Page, name: string) =>
  page.getByLabel(name, { exact: true }).dispatchEvent('click')

const panelHeading = (page: Page) => page.getByTestId('shell-panel').locator('[data-panel-heading]')
const rows = (page: Page) => page.getByTestId('nearby-list').locator('li')

for (const width of [390, 1280]) {
  test.describe(`at ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await mockApi(page)
    })

    test('browse: a quick chip filters pins, list and URL, and survives opening a deal', async ({
      page,
    }) => {
      await page.goto('/browse')
      await expect(rows(page)).toHaveCount(3)
      await expect(groups(page)).toHaveCount(3)

      await page.getByRole('button', { name: 'Under $5' }).click()
      await expect(page).toHaveURL(/max=5/)
      await expect(rows(page)).toHaveCount(2)
      await expect(groups(page)).toHaveCount(2)

      await rows(page).first().getByRole('link').click()
      await expect(page).toHaveURL(/\/deals\//)
      await expect(panelHeading(page)).toHaveText('Synthetic kopi set')

      await page.goBack()
      await expect(page).toHaveURL(/max=5/)
      await expect(rows(page)).toHaveCount(2)
    })

    test('Lobbie: a suggestion shows typing, then deals in the chat and framed pins on the map', async ({
      page,
    }) => {
      let release: () => void = () => undefined
      const answered = new Promise<void>((resolve) => {
        release = resolve
      })
      const sent: unknown[] = []
      await page.route('**/api/assistant/chat', async (route) => {
        sent.push(route.request().postDataJSON())
        await answered
        await route.fulfill({
          json: {
            reply: 'Shiok! That kopi set is a proper steal ☕',
            deals: [DEALS[0], DEALS[2]],
            filters: {
              maxPriceMinor: 500,
              endingToday: false,
              maxWalkMinutes: 0,
              categories: [],
              cuisines: [],
            },
          },
        })
      })
      await page.goto('/browse')
      await expect(groups(page)).toHaveCount(3)

      await page.getByRole('button', { name: 'Ask Lobbie for Lobangs' }).click()
      await expect(page).toHaveURL(/\/ask-lobbie/)
      await expect(panelHeading(page)).toHaveText('Ask Lobbie')
      await expect(page.getByTestId('lobbie-log')).toContainText('Lobbie the Lobang Lobster')

      await page.getByRole('button', { name: 'Lunch under $5' }).click()
      await expect(page.getByTestId('lobbie-typing')).toBeVisible()
      await expect(page.getByTestId('lobbie-input')).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Cheap eats near me' })).toHaveCount(0)
      await page.screenshot({ path: `test-results/lobbie-typing-${width}.png` })
      expect(sent).toEqual([
        {
          messages: [{ role: 'user', text: 'Lunch under $5' }],
          position: null,
          filters: {
            maxPriceMinor: 0,
            endingToday: false,
            maxWalkMinutes: 0,
            categories: [],
            cuisines: [],
          },
        },
      ])

      release()
      await expect(page.getByTestId('lobbie-typing')).toHaveCount(0)
      await expect(page.getByTestId('lobbie-input')).toBeEnabled()
      await expect(page.getByTestId('lobbie-log')).toContainText('proper steal')
      await expect(page.getByTestId('lobbie-deals').locator('li')).toHaveCount(2)
      const activeFilters = page.getByTestId('lobbie-active-filters')
      await expect(activeFilters.getByRole('button')).toHaveText(['Up to $5', 'Clear all'])
      // The two picks are far apart; framing shows both as pins instead of region pills.
      await expect(groups(page)).toHaveCount(0)
      await expect(page.locator('.deal-map-pin')).toHaveCount(2)
      await expect(page.locator('.deal-map-pin').first()).toBeInViewport()
      await expect(page.locator('.deal-map-pin').last()).toBeInViewport()
      await page.screenshot({ path: `test-results/lobbie-results-${width}.png` })

      await page.getByTestId('lobbie-deals').getByRole('link').first().click()
      await expect(panelHeading(page)).toHaveText('Synthetic kopi set')
      await page.getByRole('link', { name: 'Back to Lobbie' }).click()
      await expect(page.getByTestId('lobbie-log')).toContainText('Lunch under $5')

      await page.getByRole('button', { name: 'Remove filter Up to $5' }).click()
      await expect(activeFilters).toHaveCount(0)
      await expect(page.getByTestId('lobbie-notice')).toHaveText('Removed “Up to $5”')
    })

    test('pin to deal: each pin opens its deal with the panel at the top', async ({ page }) => {
      // Both outlets a short walk apart in Jurong East: tapping West fits them both at street zoom.
      const nextDoor = {
        ...VENUES.west,
        id: 'd'.repeat(24),
        name: 'Synthetic Jurong Bakery',
        lat: 1.3345,
        lng: 103.7445,
      }
      const items = DEALS.map((item) =>
        item.title === 'Synthetic kaya toast' ? { ...item, venues: [nextDoor] } : item,
      )
      await page.route('**/api/deals*', (route) =>
        route.fulfill({ json: { items, categories: ['BAKERY', 'DRINKS', 'FOOD'] } }),
      )
      await page.goto('/browse')
      await openGroup(page, '2 deals in West')
      await expect(page.locator('.deal-map-pin')).toHaveCount(2)
      await page.locator('.deal-map-pin[title^="Synthetic fishball"]').dispatchEvent('click')
      await expect(panelHeading(page)).toHaveText('Synthetic fishball noodles')
      const body = page.getByTestId('panel-body')
      await body.evaluate((element) => {
        element.scrollTop = element.scrollHeight
      })
      await page.locator('.deal-map-pin[title^="Synthetic kaya"]').dispatchEvent('click')
      await expect(panelHeading(page)).toHaveText('Synthetic kaya toast')
      await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(0)
    })

    test('filters sheet: live count, badge, and focus back on Escape', async ({ page }) => {
      await page.goto('/browse')
      await expect(rows(page)).toHaveCount(3)
      const allFilters = page.getByTestId('all-filters')
      await allFilters.click()
      const sheet = page.getByRole('dialog', { name: 'Filters' })
      await expect(sheet).toBeVisible()
      await expect(page.getByTestId('filter-show')).toHaveText('Show 3 deals')
      await sheet.getByRole('button', { name: /^Bakery/ }).click()
      await expect(page.getByTestId('filter-show')).toHaveText('Show 1 deal')
      await page.getByTestId('filter-show').click()
      await expect(sheet).toBeHidden()
      await expect(page.getByTestId('filter-badge')).toContainText('1')

      await allFilters.click()
      await expect(sheet).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(sheet).toBeHidden()
      await expect(allFilters).toBeFocused()
    })

    test('venue: switching tabs returns the panel to the top', async ({ page }) => {
      await page.goto(`/venues/${VENUES.west.id}`)
      await expect(panelHeading(page)).toHaveText(VENUES.west.name)
      await page.getByRole('tab', { name: 'Past' }).click()
      const body = page.getByTestId('panel-body')
      await body.evaluate((element) => {
        element.scrollTop = element.scrollHeight
      })
      await page.getByRole('tab', { name: 'About' }).click()
      await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(0)
      await expect(page.getByText('1 Synthetic Street, Singapore 600001').first()).toBeVisible()
    })

    test('geolocation denied: the fallback message shows and the list still renders', async ({
      page,
      context,
    }) => {
      await context.grantPermissions([])
      await page.goto('/browse')
      await page.getByTestId('near-me').click()
      await expect(page.getByTestId('location-status')).toContainText(/refused|unavailable/)
      await expect(rows(page)).toHaveCount(3)
    })

    test('keyboard only: the menu opens from the logo and Escape returns focus', async ({
      page,
    }) => {
      await page.goto('/browse')
      await page.keyboard.press('Tab')
      const toggle = page.getByTestId('nav-toggle')
      await expect(toggle).toBeFocused()
      const outline = await toggle.evaluate((element) => getComputedStyle(element).outlineStyle)
      expect(outline).not.toBe('none')
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('nav-menu')).toBeVisible()
      await expect(
        page.getByTestId('nav-menu').getByRole('link', { name: 'Add a deal' }),
      ).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('nav-menu')).toBeHidden()
      await expect(toggle).toBeFocused()
    })
  })
}

test('hot card: rotates, pauses and opens its deal', async ({ page }) => {
  // A fake clock instead of sleeps: time only moves when the test says so.
  await page.clock.install()
  await page.setViewportSize({ width: 1280, height: 844 })
  await mockApi(page)
  await page.goto('/browse')
  const position = page.getByTestId('hot-position')
  await expect(position).toHaveText('1 of 3')
  await page.mouse.move(1200, 60)
  await page.clock.runFor(4600)
  await expect(position).toHaveText('2 of 3')

  await page.getByTestId('hot-pause').click()
  await page.mouse.move(1200, 60)
  await page.clock.runFor(15_000)
  await expect(position).toHaveText('2 of 3')

  const title = (await page.getByTestId('hot-open').locator('strong').textContent()) ?? ''
  await page.getByTestId('hot-open').click()
  await expect(panelHeading(page)).toHaveText(title)
})
