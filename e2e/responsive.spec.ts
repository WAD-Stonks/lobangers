import { commentsResponseSchema, communitySummarySchema } from '@broke-oclock/contracts/community'
import { expect, type Page, test } from '@playwright/test'

// Evidence only: observe actual Chromium output without replacing SPA or browser behavior.
const browserObservations = new WeakMap<
  Page,
  {
    console: string[]
    pageErrors: string[]
    resources: { url: string; status?: number; error?: string }[]
  }
>()
test.beforeEach(async ({ page }) => {
  const observed = {
    console: [] as string[],
    pageErrors: [] as string[],
    resources: [] as { url: string; status?: number; error?: string }[],
  }
  browserObservations.set(page, observed)
  page.on('console', (message) => observed.console.push(`${message.type()}: ${message.text()}`))
  page.on('pageerror', (error) => observed.pageErrors.push(error.message))
  page.on('response', (response) =>
    observed.resources.push({ url: response.url(), status: response.status() }),
  )
  page.on('requestfailed', (request) =>
    observed.resources.push({ url: request.url(), error: request.failure()?.errorText }),
  )
})
test.afterEach(async ({ page }, info) => {
  await info.attach('actual-browser-observations', {
    body: JSON.stringify(
      {
        ...browserObservations.get(page),
        layout: await page.evaluate(() => ({
          url: location.href,
          fonts: document.fonts.status,
          splash: Boolean(document.querySelector('[data-testid="splash-screen"]')),
          width: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
          alerts: [...document.querySelectorAll('[role="alert"]')].map((el) => el.textContent),
          buttons: [...document.querySelectorAll('button')].map((el) => ({
            name: el.getAttribute('aria-label') ?? el.textContent,
            width: el.getBoundingClientRect().width,
            height: el.getBoundingClientRect().height,
            minHeight: getComputedStyle(el).minHeight,
          })),
        })),
      },
      null,
      2,
    ),
    contentType: 'application/json',
  })
})

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
    images: [],
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
  '/deals',
  `/deals/${DEALS[0]?.id}`,
  `/venues/${VENUE.id}`,
  '/ask-lobbie',
  // Signed-out /login and /add both land on the standalone sign-in page.
  '/sign-in',
]
const TOUCH_MAX_WIDTH = 992
const MIN_TARGET_PX = 44

// Measure native layout only after the covering splash, fonts and finite motion settle.
const settled = async (page: Page) => {
  await expect(page.getByTestId('splash-screen')).toHaveCount(0)
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => {
          const end = animation.effect?.getComputedTiming().endTime
          return typeof end === 'number' && Number.isFinite(end)
        })
        .map((animation) => animation.finished.catch(() => {})),
    )
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
  })
}

const mockApi = async (page: Page) => {
  await page.route(/basemaps\.cartocdn\.com|onemap\.gov\.sg/, (route) => route.abort())
  await page.route('**/api/auth/get-session*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }),
  )
  await page.route('**/api/deals*', (route) =>
    route.fulfill({ json: { items: DEALS, categories: ['FOOD'] } }),
  )
  await page.route(`**/api/venues/${VENUE.id}`, (route) => route.fulfill({ json: VENUE_DETAIL }))
  await page.route(`**/api/deals/${DEALS[0]?.id}/community`, (route) => {
    expect(route.request().method()).toBe('GET')
    return route.fulfill({
      json: communitySummarySchema.parse({
        alive: DEALS[0]?.votes.alive,
        dead: DEALS[0]?.votes.dead,
        status: 'LIKELY_STILL_ON',
        myVote: null,
        myVoteIsRecent: false,
        lastReportedAt: null,
        asOf: '2026-10-28T00:00:00.000Z',
        commentCount: DEALS[0]?.commentCount,
        policy: { minAlive: 3, positivePercent: 80, windowHours: 24 },
      }),
    })
  })
  await page.route(`**/api/deals/${DEALS[0]?.id}/comments*`, (route) => {
    expect(route.request().method()).toBe('GET')
    expect(Object.fromEntries(new URL(route.request().url()).searchParams)).toEqual({ limit: '3' })
    return route.fulfill({
      json: commentsResponseSchema.parse({
        items: [
          {
            id: '3'.repeat(24),
            body: 'Synthetic outlet detail.',
            authorName: 'Synthetic visitor A',
            createdAt: '2026-10-28T00:00:00.000Z',
            canDelete: false,
          },
          {
            id: '4'.repeat(24),
            body: 'Synthetic redemption tip.',
            authorName: 'Synthetic visitor B',
            createdAt: '2026-10-27T00:00:00.000Z',
            canDelete: false,
          },
        ],
        nextCursor: null,
      }),
    })
  })
}

for (const width of WIDTHS) {
  for (const route of ROUTES) {
    test(`${route} fits ${width}px`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.setViewportSize({ width, height: 800 })
      await mockApi(page)
      await page.goto(route)
      await expect(
        route === '/sign-in'
          ? page.getByTestId('standalone-auth')
          : page.getByTestId('shell-panel').locator('[data-panel-heading]'),
      ).toBeVisible()
      await settled(page)
      if (route.startsWith('/deals/')) {
        const community = page.getByTestId('deal-community')
        await expect(community.locator('.deal-community-status')).toHaveText('Likely still on')
        await expect(community.locator('.deal-community-comments > li')).toHaveCount(2)
        await expect(community.getByRole('alert')).toHaveCount(0)
      }

      // 1. No horizontal page scroll.
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)

      // 2. No visible element sticks out past the viewport edge. Content clipped by a
      // container that itself fits (a swipeable chip row, cropped artwork) is fine.
      const offenders = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('body *')]
          .filter((el) => el.offsetParent !== null && !el.closest('.leaflet-container'))
          .filter((el) => {
            const r = el.getBoundingClientRect()
            if (r.width === 0 || (r.left >= -1 && r.right <= window.innerWidth + 1)) return false
            for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
              if (getComputedStyle(a).overflowX === 'visible') continue
              const c = a.getBoundingClientRect()
              if (c.left >= -1 && c.right <= window.innerWidth + 1) return false
            }
            return true
          })
          .map((el) => el.dataset.testid ?? el.className),
      )
      expect(offenders).toEqual([])

      // 3. Every button is at least 44px on touch widths. Layout size, so a scroll-triggered
      // entrance that has not played yet (GSAP, invisible to getAnimations) is not measured.
      if (width < TOUCH_MAX_WIDTH) {
        const small = await page.getByRole('button').evaluateAll(
          (els, min) =>
            els
              .filter((el): el is HTMLElement => el instanceof HTMLElement)
              .filter((el) => {
                const w = el.offsetWidth
                const h = el.offsetHeight
                return w > 0 && (w < min || h < min)
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
  await expect(page.getByTestId('shell-panel').locator('[data-panel-heading]')).toHaveText(
    LONG_TITLE,
  )
  await expect(page.locator('.panel-frame__actions')).toBeVisible()
  const community = page.getByTestId('deal-community')
  await expect(community.locator('.deal-community-status')).toHaveText('Likely still on')
  await expect(community.locator('.deal-community-comments > li')).toHaveCount(2)
  await settled(page)
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

test('the filter popup keeps its actions visible while its body scrolls', async ({ page }) => {
  await mockApi(page)
  for (const width of [390, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/browse')
    await page
      .locator('[data-testid="all-filters"]:visible, [data-testid="mobile-all-filters"]:visible')
      .click()
    const body = page.getByTestId('filter-sheet-body')
    await expect(body).toBeVisible()
    const apply = page.getByTestId('filter-show')
    await expect(apply).toBeVisible()
    const before = await apply.boundingBox()
    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    const after = await apply.boundingBox()
    expect(before && after && Math.abs(before.y - after.y) < 1, `${width}px`).toBe(true)
    expect(after && after.y + after.height <= 800, `${width}px`).toBe(true)
  }
})

test('map quick filters sit beside search on desktop and below it on mobile without clipping', async ({
  page,
}) => {
  await mockApi(page)
  await page.goto('/browse')
  await expect(page.getByTestId('map-shell')).toBeVisible()
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 })
    await settled(page)
    const search = await page.getByRole('search').boundingBox()
    const toolbar = page.getByTestId('discovery-quick-filters')
    const chips = await toolbar.boundingBox()
    expect(
      chips &&
        search &&
        (width >= 992 ? chips.x >= search.x + search.width : chips.y >= search.y + search.height),
      `${width}px`,
    ).toBe(true)
    expect(chips && chips.x + chips.width <= width + 1, `${width}px`).toBe(true)
    // Chips past the edge are fine only inside the swipeable row, which itself fits.
    const clipped = await page
      .getByTestId('discovery-quick-filters')
      .locator('button:visible')
      .evaluateAll(
        (els) =>
          els.filter((el) => {
            if (el.getBoundingClientRect().right <= window.innerWidth) return false
            const row = el.closest('.discovery-filters__chips')
            return !row || row.getBoundingClientRect().right > window.innerWidth + 1
          }).length,
      )
    expect(clipped, `${width}px`).toBe(0)
  }
})

test('reduced motion still allows opening deals from the map results', async ({ page }) => {
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
  await expect(page.getByTestId('deal-rows').locator('li')).toHaveCount(2)
  await page.clock.runFor(6000)
  await expect(page.getByTestId('hot-card')).toHaveCount(0)
  await page.getByTestId('deal-rows').getByRole('link').first().click()
  await expect(page).toHaveURL(/\/deals\//)
})

test('map workspace rail, results and drawer fit desktop and mobile', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await mockApi(page)
  for (const width of [390, 834, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/browse')
    await expect(page.getByTestId('splash-screen')).toBeHidden()
    const rail = page.getByTestId('map-navigation')
    if (width >= 992) {
      await expect(rail).toBeVisible()
      const railBox = await rail.boundingBox()
      const results = await page.getByTestId('shell-panel').boundingBox()
      const search = await page.getByRole('search').boundingBox()
      const controls = await page.getByTestId('map-controls').boundingBox()
      expect(railBox?.width).toBe(72)
      expect(results && railBox && results.x >= railBox.x + railBox.width).toBe(true)
      expect(search && railBox && search.x >= railBox.x + railBox.width).toBe(true)
      expect(controls && controls.x > width - 200).toBe(true)
      await page.getByTestId('nav-toggle').click()
      await expect(page.getByRole('dialog', { name: 'Site', exact: true })).toBeVisible()
      await expect(page.getByTestId('shell-panel')).toHaveAttribute('inert', '')
      await page.getByRole('button', { name: 'Close navigation menu' }).click()
      await expect(page.getByTestId('nav-menu')).toBeHidden()
      await expect(page.getByTestId('nav-toggle')).toBeFocused()
    } else {
      // Below desktop the navigation is the bottom tab bar instead of the rail.
      await expect(rail).toHaveClass(/map-navigation--bottom/)
      await expect(page.getByTestId('sheet-handle')).toBeVisible()
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.screenshot({ path: info.outputPath(`workspace-${width}.png`) })
  }
  expect(errors).toEqual([])
})

test('sidebar choice survives reload and can be reversed from the remaining menu', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 844 })
  await mockApi(page)
  await page.goto('/browse')
  await expect(page.getByTestId('map-shell')).toBeVisible()
  await expect(page.getByTestId('splash-screen')).toBeHidden()
  await page.getByTestId('nav-toggle').click()
  await page.getByTestId('show-sidebar').click()
  await expect(page.getByTestId('map-navigation')).toHaveCount(0)
  await expect(page.getByTestId('nav-toggle')).toBeFocused()
  await page.reload()
  await expect(page.getByTestId('map-shell')).toBeVisible()
  await expect(page.getByTestId('splash-screen')).toBeHidden()
  await expect(page.getByTestId('map-navigation')).toHaveCount(0)
  await page.getByTestId('nav-toggle').click()
  await expect(page.getByTestId('show-sidebar')).toHaveAttribute('aria-checked', 'false')
  await page.getByTestId('show-sidebar').click()
  await expect(page.getByTestId('map-navigation')).toBeVisible()
  await expect(page.getByTestId('shell-panel')).not.toHaveAttribute('inert')
  await expect(page.getByTestId('nav-toggle')).toBeFocused()
})

for (const width of [390, 1280]) {
  test(`map guide walks through real controls without submitting anything at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 844 })
    const writes: string[] = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('request', (request) => {
      if (request.url().includes('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method()))
        writes.push(request.url())
    })
    await mockApi(page)
    const now = new Date().toISOString()
    await page.route('**/api/deals/*/community', (route) =>
      route.fulfill({
        json: {
          alive: 4,
          dead: 0,
          status: 'LIKELY_STILL_ON',
          myVote: null,
          myVoteIsRecent: false,
          lastReportedAt: now,
          asOf: now,
          commentCount: 1,
          policy: { minAlive: 3, positivePercent: 80, windowHours: 24 },
        },
      }),
    )
    await page.route('**/api/deals/*/comments*', (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: '8'.repeat(24),
              body: 'Synthetic recent outlet tip.',
              authorName: 'Synthetic visitor',
              createdAt: now,
              canDelete: false,
            },
          ],
          nextCursor: null,
        },
      }),
    )
    await page.goto('/browse?q=synthetic&sort=ending')
    await expect(page.getByTestId('splash-screen')).toBeHidden()
    const origin = page.url()
    await page.getByTestId('nav-toggle').click()
    await page.getByTestId('start-map-tutorial').click()
    const guide = page.getByTestId('map-tutorial')
    await expect(guide.getByRole('heading', { name: 'Find a deal that fits' })).toBeVisible()
    await expect(page.getByTestId('filter-sheet')).toBeVisible()
    await expect(page.getByTestId('filter-sheet')).toHaveAttribute('inert', '')
    await guide.getByTestId('tutorial-next').click()
    await expect(guide.getByRole('heading', { name: 'Open a deal' })).toBeVisible()
    await expect(page).toHaveURL(/\/deals\//)
    await guide.getByTestId('tutorial-next').click()
    await expect(guide.getByRole('heading', { name: 'Check community verification' })).toBeVisible()
    await expect(page.locator('.deal-community-verification')).toBeVisible()
    await page.screenshot({ path: info.outputPath(`tutorial-verification-${width}.png`) })
    await guide.getByTestId('tutorial-next').click()
    await expect(guide.getByRole('heading', { name: 'Read the conversation' })).toBeVisible()
    await expect(page.locator('.deal-community-comments')).toContainText(
      'Synthetic recent outlet tip.',
    )
    await guide.getByTestId('tutorial-next').click()
    await expect(guide.getByRole('heading', { name: 'Where to add a deal' })).toBeVisible()
    await guide.getByTestId('tutorial-next').click()
    await expect(guide).toHaveCount(0)
    await expect(page).toHaveURL(origin)
    expect(writes).toEqual([])
    expect(errors).toEqual([])
  })
}

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
    await page
      .locator('[data-testid="all-filters"]:visible, [data-testid="mobile-all-filters"]:visible')
      .click()
    await settled('filter-sheet')
    await page.screenshot({ path: info.outputPath(`map-shell-filters-${width}.png`) })
    await page.keyboard.press('Escape')
    await page.getByTestId('nav-toggle').click()
    await settled('nav-menu')
    await page.screenshot({ path: info.outputPath(`map-shell-menu-${width}.png`) })
  }
})

for (const width of [1024, 1440]) {
  test(`map search overlays the drawer without covering deal content at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await mockApi(page)
    await page.goto(`/deals/${DEALS[0]?.id}`)
    const panel = page.getByTestId('shell-panel')
    const search = page.getByRole('search')
    const back = page.getByRole('link', { name: 'Back to results' })
    await expect(back).toBeVisible()
    const panelBox = await panel.boundingBox()
    const searchBox = await search.boundingBox()
    const backBox = await back.boundingBox()
    expect(panelBox).not.toBeNull()
    expect(searchBox).not.toBeNull()
    expect(backBox).not.toBeNull()
    if (!panelBox || !searchBox || !backBox) throw new Error('Missing map layout bounds')
    expect(panelBox.y).toBeLessThan(searchBox.y)
    expect(searchBox.x).toBeGreaterThan(panelBox.x)
    expect(searchBox.x + searchBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width)
    expect(backBox.y).toBeGreaterThan(searchBox.y + searchBox.height)
    // The scroll container runs behind search; its content starts below it.
    const headingBox = await panel.locator('[data-panel-heading]').boundingBox()
    expect(headingBox?.y).toBeGreaterThan(searchBox.y + searchBox.height)
    await back.click()
    await expect(page).toHaveURL(/\/browse/)
  })
}

test('split map panel fits three cards with verification badges on the posters', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockApi(page)
  await page.route('**/api/deals*', (route) =>
    route.fulfill({
      json: {
        items: [1, 2, 3].map((index) => ({
          ...DEALS[0],
          id: String(index).repeat(24),
          title: `Synthetic offer ${index}`,
        })),
        categories: ['FOOD'],
      },
    }),
  )
  await page.goto('/browse?view=map&discovery=1&split=1&results=cards')
  const cards = page.getByTestId('shell-panel').locator('.food-deal-card')
  await expect(cards).toHaveCount(3)
  const boxes = await cards.evaluateAll((elements) =>
    elements.map((element) => {
      const card = element.getBoundingClientRect()
      const photo = element.querySelector('.food-deal-card__photo')?.getBoundingClientRect()
      const badge = element.querySelector('.food-deal-card__status')?.getBoundingClientRect()
      const body = element.querySelector('.food-deal-card__body')?.getBoundingClientRect()
      return { x: card.x, y: card.y, right: card.right, photo, badge, body }
    }),
  )
  expect(boxes[0]?.y).toBe(boxes[1]?.y)
  expect(boxes[1]?.y).toBe(boxes[2]?.y)
  expect(boxes[0]?.right).toBeLessThan(boxes[1]?.x ?? 0)
  expect(boxes[1]?.right).toBeLessThan(boxes[2]?.x ?? 0)
  for (const box of boxes) {
    expect((box.photo?.width ?? 0) / (box.photo?.height ?? 1)).toBeCloseTo(0.8, 2)
    expect(box.body?.top).toBeCloseTo(box.photo?.bottom ?? 0, 0)
    expect(box.badge?.top).toBeGreaterThanOrEqual(box.photo?.top ?? 0)
    expect(box.badge?.bottom).toBeLessThanOrEqual(box.photo?.bottom ?? 0)
    expect(box.badge?.right).toBeLessThanOrEqual(box.photo?.right ?? 0)
  }
})

test('mobile quick filters stay on one swipeable row with full filters beside search', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await page.route('**/api/deals*', (route) =>
    route.fulfill({
      json: {
        items: DEALS.map((deal) => ({ ...deal, cuisine: 'JAPANESE' })),
        categories: ['FOOD'],
      },
    }),
  )
  await page.goto('/browse')
  const quickFilters = page.locator('.discovery-filters__chips')
  await expect(page.getByTestId('quick-category')).toBeVisible()
  const row = await quickFilters.evaluate((element) => ({
    width: element.clientWidth,
    scrollWidth: element.scrollWidth,
    tops: [...element.querySelectorAll('[data-testid^="quick-"]')].map(
      (button) => button.getBoundingClientRect().top,
    ),
    viewportWidth: window.innerWidth,
    pageWidth: document.documentElement.scrollWidth,
  }))
  expect(new Set(row.tops).size).toBe(1)
  expect(row.scrollWidth).toBeGreaterThan(row.width)
  expect(row.pageWidth).toBe(row.viewportWidth)
  const allFilters = page.getByTestId('mobile-all-filters')
  await allFilters.click()
  await expect(page.getByTestId('filter-sheet')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(allFilters).toBeFocused()
})
