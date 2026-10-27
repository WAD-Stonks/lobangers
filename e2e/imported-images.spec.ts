import { readFileSync } from 'node:fs'
import type { CommunitySummary } from '@broke-oclock/contracts/community'
import type { DealPin } from '@broke-oclock/contracts/deals'
import type { IngestionDraft } from '@broke-oclock/contracts/ingestion'
import type { VenueDealSummary } from '@broke-oclock/contracts/venues'
import { expect, type Locator, type Page, test } from '@playwright/test'

// SYNTHETIC network/session/media fixtures around the original SPA, router, SDK and CSS.
// Does not establish live authentication, UploadThing delivery or production authorization.
const samplePng = readFileSync(new URL('../apps/web/src/assets/logo.png', import.meta.url))
const imageUrl = 'https://media.example.test/synthetic-sample.png'
const failedUrl = 'https://media.example.test/synthetic-failure.png'
const gifUrl = 'https://media.example.test/synthetic-archive.gif'
// A real minimal GIF raster; only its archive metadata size is synthetic.
const sampleGif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
const venue = {
  id: '222222222222222222222222',
  name: 'Synthetic sample outlet',
  lat: 1.32,
  lng: 103.93,
}
const deal: DealPin = {
  id: '111111111111111111111111',
  title: 'Synthetic sample offer',
  category: 'FOOD',
  cuisine: 'JAPANESE',
  images: [{ url: imageUrl, alt: 'Synthetic sample image: LoBangers logo' }],
  label: '$5',
  description: 'Synthetic imported-image acceptance fixture, not a published promotion.',
  offerType: 'FIXED_PRICE',
  priceMinor: 500,
  discountPercent: null,
  terms: 'Synthetic terms',
  validUntil: null,
  rawValidityText: 'Unknown end date',
  votes: { alive: 0, dead: 0 },
  commentCount: 0,
  venues: [venue],
  imageUrl,
  imageAltText: 'Synthetic sample image: LoBangers logo',
}
const community: CommunitySummary = {
  alive: deal.votes.alive,
  dead: deal.votes.dead,
  status: 'NO_RECENT_REPORTS',
  myVote: null,
  myVoteIsRecent: false,
  lastReportedAt: null,
  asOf: '2026-10-26T00:00:00.000Z',
  commentCount: deal.commentCount,
  policy: { minAlive: 3, positivePercent: 80, windowHours: 24 },
}
const card: VenueDealSummary = { ...deal, currency: 'SGD', imageUrl }
const image = {
  sha256: 'a'.repeat(64),
  url: imageUrl,
  sourceUrl: 'https://source.example.test/original.png',
  altText: deal.imageAltText ?? null,
  mimeType: 'image/png',
  sizeBytes: samplePng.length,
  status: 'HOSTED',
}
const draft: IngestionDraft = {
  id: deal.id,
  title: 'Synthetic pending image review',
  description: deal.description,
  terms: null,
  category: 'FOOD',
  offerType: 'OTHER',
  validFrom: null,
  validUntil: null,
  rawValidityText: null,
  applicability: 'NO_FIXED_LOCATION',
  merchantId: null,
  outlet: null,
  reviewStatus: 'PENDING',
  contentVersion: 7,
  sourceUrl: 'https://source.example.test/post',
  sourceName: 'Synthetic source',
  reviewNote: null,
  reviewReady: false,
  images: [
    image,
    { ...image, sha256: 'b'.repeat(64), url: failedUrl, altText: 'Synthetic failing image' },
    { ...image, sha256: 'c'.repeat(64), url: imageUrl, status: 'UNKNOWN' },
    {
      ...image,
      sha256: 'd'.repeat(64),
      url: gifUrl,
      mimeType: 'image/gif',
      sizeBytes: 5_939_727,
      altText: 'Synthetic archive GIF',
    },
  ],
}

async function installBoundary(page: Page) {
  const state = {
    admin: true,
    denyDrafts: false,
    requests: [] as string[],
    mediaReferrers: [] as string[],
    unexpected: [] as string[],
  }
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const note = document.createElement('div')
      note.textContent = 'SYNTHETIC API / SESSION / MEDIA FIXTURE — NOT LIVE'
      note.dataset.syntheticFixtureNote = 'true'
      note.style.cssText =
        'position:fixed;top:0;right:0;max-width:100%;z-index:2147483647;font:10px sans-serif;background:#ffe69c;color:#202020;padding:2px 4px;pointer-events:none'
      document.body.append(note)
    })
  })
  page.on('request', (request) => {
    if (new URL(request.url()).hostname === 'source.example.test')
      state.unexpected.push('Unexpected original-source request')
  })
  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.hostname === 'media.example.test') {
      state.requests.push(`MEDIA ${url.pathname}`)
      const referer = request.headers().referer
      if (referer) state.mediaReferrers.push(`${url.pathname}: ${referer}`)
      if (url.href === gifUrl)
        return route.fulfill({ status: 200, contentType: 'image/gif', body: sampleGif })
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: url.href === failedUrl ? Buffer.from('synthetic invalid raster') : samplePng,
      })
    }
    if (url.pathname.startsWith('/api/')) {
      state.requests.push(`${request.method()} ${url.pathname}`)
      if (request.method() !== 'GET') {
        state.unexpected.push(`${request.method()} ${url.pathname}`)
        return route.abort()
      }
      let data: unknown
      let status = 200
      if (url.pathname === '/api/auth/get-session')
        data = state.admin
          ? {
              user: {
                id: 'synthetic-admin',
                name: 'Synthetic operator',
                email: 'operator@example.test',
                role: 'ADMIN',
              },
              session: {
                id: 'synthetic-session',
                userId: 'synthetic-admin',
                expiresAt: '2099-01-01T00:00:00.000Z',
              },
            }
          : null
      else if (url.pathname === '/api/auth-methods')
        data = { password: true, google: false, emailOtp: false, passwordRecovery: false }
      else if (url.pathname === '/api/ingestion/dashboard')
        data = {
          source: {
            name: 'Synthetic source',
            enabled: false,
            reuseApproved: false,
            onemapConfigured: false,
          },
          counts: { pending: 1, approved: 0, rejected: 0, failed: 0 },
        }
      else if (url.pathname === '/api/ingestion/drafts') {
        if (state.denyDrafts) {
          status = 403
          data = { error: { code: 'FORBIDDEN', message: 'Synthetic revoked access' } }
        } else data = { items: [draft], nextCursor: null }
      } else if (url.pathname === '/api/ingestion/runs') data = { items: [] }
      else if (url.pathname === '/api/deals') data = { items: [deal], categories: ['FOOD'] }
      else if (url.pathname === `/api/deals/${deal.id}/community`) data = community
      else if (url.pathname === `/api/deals/${deal.id}/comments`)
        data = { items: [], nextCursor: null }
      else if (url.pathname === `/api/venues/${venue.id}`)
        data = {
          venue: {
            id: venue.id,
            name: venue.name,
            address: '1 Example Street',
            area: null,
            postalCode: null,
            merchantName: 'Synthetic merchant',
          },
          deals: [
            card,
            {
              ...card,
              id: '444444444444444444444444',
              title: 'Synthetic GIF offer',
              imageUrl: gifUrl,
              imageAltText: 'Synthetic archive GIF',
            },
            {
              ...card,
              id: '333333333333333333333333',
              title: 'Synthetic no-image offer',
              imageUrl: null,
              imageAltText: null,
            },
          ],
          pastDeals: [],
        }
      else {
        state.unexpected.push(`${request.method()} ${url.pathname}`)
        return route.abort()
      }
      return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    }
    if (
      url.origin === new URL(page.url() === 'about:blank' ? request.url() : page.url()).origin ||
      ['localhost', '127.0.0.1'].includes(url.hostname)
    )
      return route.continue()
    // Control remote basemap/font transport; no provider calls escape this fixture.
    if (request.resourceType() === 'image')
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=',
          'base64',
        ),
      })
    return route.fulfill({ status: 200, contentType: 'text/css', body: '' })
  })
  return state
}

async function painted(image: Locator) {
  await image.scrollIntoViewIfNeeded()
  // Wait for the real lazy-loaded raster without changing the component's loading policy.
  await expect
    .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)
  await image.evaluate(async (element) => {
    await (element as HTMLImageElement).decode()
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
  })
}

async function expandSheet(page: Page, width: number) {
  if (width >= 992) return
  const handle = page.getByTestId('sheet-handle')
  await handle.press('ArrowUp')
  await expect(handle).toHaveAttribute('aria-label', /Full height$/)
  await expect(page.getByTestId('shell-panel')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
}

for (const width of [320, 768, 1024, 1440]) {
  test(`synthetic imported-image review and public surfaces at ${width}px`, async ({ page }) => {
    // Three full SPA boots now include real splash exits and raster/frame readiness.
    test.setTimeout(60_000)
    await page.setViewportSize({ width, height: 950 })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      // The deliberately denied draft read is exercised below; retain its resource error separately.
      if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text())
    })
    const state = await installBoundary(page)
    await page.goto('/admin/ingestion')
    await expect(page.getByRole('heading', { name: 'Ingestion admin', exact: true })).toBeVisible()
    const queue = page.locator('section[aria-labelledby="queue-title"]')
    const view = queue.getByRole('button', { name: `View details: ${draft.title}`, exact: true })
    await view.focus()
    await page.keyboard.press('Enter')
    const evidence = page.getByRole('region', { name: 'Imported image evidence' })
    await painted(evidence.getByRole('img', { name: deal.imageAltText ?? '', exact: true }))
    await painted(evidence.getByRole('img', { name: 'Synthetic archive GIF', exact: true }))
    await expect(
      evidence.getByRole('img', { name: 'Synthetic archive GIF', exact: true }),
    ).toHaveAttribute('src', gifUrl)
    await expect(evidence.getByText('Image unavailable', { exact: true })).toBeVisible()
    await expect(evidence.getByText('Storage status: UNKNOWN')).toBeVisible()
    await expect(evidence.getByRole('img', { name: 'No photo for this deal yet' })).toBeVisible()
    await expect(evidence.getByTestId('image-source').first()).toHaveAttribute(
      'href',
      image.sourceUrl,
    )
    await expect(queue.getByTestId('approve-draft')).toBeDisabled()
    await evidence.screenshot({
      path: test.info().outputPath(`synthetic-admin-${width}.png`),
      style: '[data-synthetic-fixture-note] { visibility: hidden !important; }',
    })
    const layout = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }))
    expect(layout).toEqual({ width, scroll: width })
    // Original denial cleanup must remove already selected image evidence.
    state.denyDrafts = true
    await queue.getByLabel('Review status').selectOption('APPROVED')
    await expect(page.getByText('You do not have permission to review ingestion.')).toBeVisible()
    await expect(evidence).toHaveCount(0)
    state.admin = false
    await page.goto('/browse')
    await expect(page.getByTestId('splash-screen')).toHaveCount(0)
    const row = page.getByTestId('nearby-list').getByRole('link').first()
    await painted(row.locator('img'))
    await row.focus()
    await page.keyboard.press('Enter')
    const detail = page.getByTestId('shell-panel')
    await expect(detail.getByRole('heading', { name: deal.title })).toBeVisible()
    await expect(detail.locator('.deal-community-status')).toHaveText('No recent reports')
    await expect(detail.locator('.deal-community-empty')).toContainText('No comments yet')
    await expect(detail.locator('[role="alert"]')).toHaveCount(0)
    expect(state.requests).toContain(`GET /api/deals/${deal.id}/community`)
    expect(state.requests).toContain(`GET /api/deals/${deal.id}/comments`)
    await expandSheet(page, width)
    await painted(detail.locator('img'))
    await detail.screenshot({
      path: test.info().outputPath(`synthetic-detail-${width}.png`),
      style: '[data-synthetic-fixture-note] { visibility: hidden !important; }',
    })
    expect(await detail.locator('img').getAttribute('alt')).toBe(deal.imageAltText)
    await expect(page).toHaveURL(new RegExp(`/deals/${deal.id}`))
    await expect(detail.getByText('Japanese', { exact: true })).toBeVisible()
    await expect(detail.locator('img')).toHaveAttribute('referrerpolicy', 'no-referrer')
    await detail.getByRole('link', { name: 'Back to results', exact: true }).click()
    await expect(page).toHaveURL(/\/browse(?:\?|$)/)
    await expect(page.getByTestId('deal-gallery')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.goto(`/venues/${venue.id}`)
    await expect(page.getByTestId('splash-screen')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: venue.name, exact: true })).toBeVisible()
    // Current mobile routes open a half-height sheet. Expand it with the actual accessible
    // handle before inspecting cards below the viewport; never force eager loading in tests.
    await expandSheet(page, width)
    const ongoing = page.getByRole('list', { name: 'Ongoing deals' })
    await painted(ongoing.locator('img').first())
    await painted(ongoing.getByRole('img', { name: 'Synthetic archive GIF', exact: true }))
    await expect(ongoing.getByRole('img', { name: 'No photo for this deal yet' })).toBeVisible()
    await ongoing.screenshot({
      path: test.info().outputPath(`synthetic-venue-${width}.png`),
      style: '[data-synthetic-fixture-note] { visibility: hidden !important; }',
    })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    expect(state.unexpected).toEqual([])
    expect(state.mediaReferrers).toEqual([])
    expect(state.requests.some((request) => request.includes('source.example.test'))).toBe(false)
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    await test.info().attach('synthetic-boundary-receipt', {
      body: JSON.stringify(
        {
          width,
          url: page.url(),
          title: await page.title(),
          requests: state.requests,
          errors,
          layout,
          unexpected: state.unexpected,
        },
        null,
        2,
      ),
      contentType: 'application/json',
    })
    expect(errors).toEqual([
      'Failed to load resource: the server responded with a status of 403 (Forbidden)',
    ])
  })
}
