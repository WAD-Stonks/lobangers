import type { AdminFlashDrop } from '@broke-oclock/contracts/flash-drops'
import type { AdminOverviewResponse } from '@broke-oclock/contracts/platform-admin'
import { expect, type Page, test } from '@playwright/test'

// Explicitly synthetic native/REST boundaries: the real SPA, typed client and CSS render
// labelled fixture flash deals. Merchants send their own flash deals live; admins only watch
// and remove them. Server rules (versions, states, admin access) are proved in the
// API integration suite, not here.
const hex = (n: number) => n.toString(16).padStart(24, '0')
const base = {
  outletId: hex(900),
  offerType: 'FIXED_PRICE',
  discountPercent: null,
  usualPriceCents: 340,
  radiusMetres: 300,
  claimedCount: 0,
  reviewNote: null,
  version: 2,
  demo: true,
  outletLat: 1.32411,
  outletLng: 103.93012,
  checks: {
    merchantHoldsOutlet: true,
    outletLocated: true,
    priceLower: true,
    manyCodes: false,
    overlaps: [],
  },
} satisfies Partial<AdminFlashDrop>
const fixtures: AdminFlashDrop[] = [
  {
    ...base,
    id: hex(1),
    dealId: hex(101),
    dealTitle: 'Synthetic brown sugar boba',
    outletName: 'Synthetic Bedok Central',
    merchantName: 'Synthetic Boba Lab',
    flashPriceCents: 170,
    startsAt: '2026-10-31T10:00:00.000Z',
    endsAt: '2026-10-31T10:30:00.000Z',
    codeValidity: 'END_OF_DAY',
    codesExpireAt: '2026-10-31T15:59:59.999Z',
    codeLimit: 30,
    status: 'SCHEDULED',
  },
  {
    ...base,
    id: hex(2),
    dealId: hex(102),
    dealTitle: 'Synthetic plain prata, 2 for $1',
    outletName: 'Synthetic Bedok North',
    merchantName: 'Synthetic Prata House',
    flashPriceCents: 100,
    usualPriceCents: 260,
    startsAt: '2026-10-31T09:15:00.000Z',
    endsAt: '2026-10-31T10:15:00.000Z',
    codeValidity: 'END_OF_DAY',
    codesExpireAt: '2026-10-31T15:59:59.999Z',
    radiusMetres: 1000,
    codeLimit: 100,
    status: 'LIVE',
    demo: false,
    checks: {
      ...base.checks,
      manyCodes: true,
      overlaps: [
        {
          id: hex(3),
          dealTitle: 'Synthetic Kopi O for 50¢',
          outletName: 'Synthetic Kopi Corner',
          distanceMetres: 420,
        },
      ],
    },
  },
  {
    ...base,
    id: hex(3),
    dealId: hex(103),
    dealTitle: 'Synthetic Kopi O for 50¢',
    outletName: 'Synthetic Kopi Corner',
    merchantName: 'Synthetic Kopi Corner',
    flashPriceCents: 50,
    usualPriceCents: 140,
    startsAt: '2026-10-31T08:40:00.000Z',
    endsAt: '2026-10-31T09:40:00.000Z',
    codeValidity: 'END_OF_DAY',
    codesExpireAt: '2026-10-31T15:59:59.999Z',
    radiusMetres: 1000,
    codeLimit: 80,
    claimedCount: 31,
    status: 'LIVE',
    demo: false,
  },
]
const viewOf = (status: AdminFlashDrop['status']) =>
  status === 'SCHEDULED' ? 'scheduled' : status === 'LIVE' ? 'live' : 'ended'
const overview = (drops: readonly AdminFlashDrop[]): AdminOverviewResponse => ({
  generatedAt: '2026-10-31T09:00:00.000Z',
  counts: {
    pendingMerchantRequests: 1,
    pendingImportedDrafts: 2,
    failedImportedPosts: 0,
    pendingFlashDrops: drops.filter((drop) => drop.status === 'SCHEDULED').length,
    liveFlashDrops: drops.filter((drop) => drop.status === 'LIVE').length,
  },
  recentRuns: [],
  readiness: {
    googleConfigured: false,
    emailConfigured: false,
    oneMapConfigured: true,
    ingestionOptIn: false,
    reuseAttested: false,
    sourceRecordEnabled: false,
    sourceIdentityValid: true,
    importAllowed: false,
    liveProviderAcceptance: 'NOT_ESTABLISHED',
  },
})
type Boundary = {
  decisions: unknown[]
  failNext: { status: number; code: string; message: string } | null
}
async function boundary(page: Page): Promise<Boundary> {
  let drops: readonly AdminFlashDrop[] = fixtures
  const state: Boundary = { decisions: [], failNext: null }
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname === '/api/auth/get-session')
      return json({
        user: {
          id: 'synthetic-admin',
          name: 'Synthetic operator',
          email: 'operator@example.test',
          role: 'USER',
        },
        session: {
          id: 'synthetic-session',
          userId: 'synthetic-admin',
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
      })
    if (url.pathname === '/api/auth-methods')
      return json({ password: true, google: false, emailOtp: false, passwordRecovery: false })
    if (url.pathname === '/api/admin/overview') return json(overview(drops))
    if (url.pathname === '/api/admin/audit') return json({ items: [], nextCursor: null })
    if (url.pathname === '/api/admin/analytics/users')
      return json({
        generatedAt: '2026-10-31T09:00:00.000Z',
        timeZone: 'Asia/Singapore',
        totalUsers: 0,
        newUsersThisWeek: 0,
        weeks: Array.from({ length: 8 }, (_, index) => ({
          weekStart: new Date(Date.parse('2026-09-06T16:00:00Z') + index * 604800000).toISOString(),
          weekEnd: new Date(Date.parse('2026-09-13T16:00:00Z') + index * 604800000).toISOString(),
          newUsers: 0,
        })),
      })
    if (url.pathname === '/api/admin/flash-drops') {
      const view = url.searchParams.get('view') ?? 'live'
      const count = (target: string) =>
        drops.filter((drop) => viewOf(drop.status) === target).length
      return json({
        items: drops.filter((drop) => viewOf(drop.status) === view),
        counts: {
          scheduled: count('scheduled'),
          live: count('live'),
          ended: count('ended'),
          claimedToday: 43,
        },
      })
    }
    const decision = url.pathname.match(/^\/api\/admin\/flash-drops\/([0-9a-f]{24})\/decision$/)
    if (decision && route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as {
        decision: string
        note: string
        version: number
      }
      state.decisions.push({ id: decision[1], ...body })
      if (state.failNext) {
        const failure = state.failNext
        state.failNext = null
        return json({ error: { code: failure.code, message: failure.message } }, failure.status)
      }
      // Removing is the only decision.
      drops = drops.map((drop) =>
        drop.id === decision[1]
          ? { ...drop, status: 'STOPPED', version: drop.version + 1, reviewNote: body.note }
          : drop,
      )
      return json(drops.find((drop) => drop.id === decision[1]))
    }
    return json(
      { error: { code: 'NOT_FOUND', message: 'Synthetic boundary has no such route' } },
      404,
    )
  })
  return state
}
const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
const tab = (page: Page, name: RegExp) =>
  page.getByRole('tablist', { name: 'Flash deal views' }).getByRole('tab', { name })

test('opens on live flash deals, switches tabs and shows synthetic checks', async ({ page }) => {
  await boundary(page)
  await page.goto('/admin/flash-drops')
  await expect(page.getByRole('heading', { name: 'Flash deals', level: 1 })).toBeVisible()
  await expect(tab(page, /Live \(2\)/)).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('flash-drop-record')).toHaveCount(2)
  const detail = page.locator('.fd-detail')
  await expect(detail.getByRole('heading', { name: /Synthetic plain prata/ })).toBeVisible()
  await expect(detail).toContainText(
    'Synthetic Kopi O for 50¢ · Synthetic Kopi Corner · 420 m away',
  )
  await expect(detail).toContainText('100 codes is a lot for one stall')
  await page.getByTestId('flash-drop-record').nth(1).click()
  await expect(page.locator('.fd-live')).toContainText('31/80')
  await tab(page, /Scheduled \(1\)/).click()
  await expect(detail.getByRole('heading', { name: /Synthetic brown sugar boba/ })).toBeVisible()
  await expect(detail.locator('.fd-fake')).toHaveText('Fake deal')
  await expect(detail).toContainText('$1.70 (usual $3.40, 50% off)')
  await page.getByRole('button', { name: /Ended or removed/ }).click()
  await expect(tab(page, /Ended \(0\)/)).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('Nothing here right now.')).toBeVisible()
})

test('removes a live flash deal with a note and its version', async ({ page }) => {
  const state = await boundary(page)
  await page.goto('/admin/flash-drops')
  const submit = page.getByRole('button', { name: 'Remove flash deal' }).last()
  await page.getByRole('checkbox', { name: /I confirm removing/ }).check()
  await expect(submit).toBeDisabled()
  await page.getByLabel('Why are you removing it? (required)').fill('Misleading price.')
  await submit.click()
  await expect(page.getByRole('status').filter({ hasText: 'Removed.' })).toBeVisible()
  await expect(tab(page, /Live \(1\)/)).toBeVisible()
  await tab(page, /Ended \(1\)/).click()
  await expect(page.locator('.fd-outcome')).toHaveText('Removed by an admin: “Misleading price.”')
  expect(state.decisions).toEqual([
    { id: hex(2), decision: 'STOP', note: 'Misleading price.', version: 2 },
  ])
})

test('a stale version shows a conflict alert with Refresh', async ({ page }) => {
  const state = await boundary(page)
  await page.goto('/admin/flash-drops')
  state.failNext = { status: 409, code: 'CONFLICT', message: 'This flash deal changed' }
  await page.getByLabel('Why are you removing it? (required)').fill('Misleading price.')
  await page.getByRole('checkbox', { name: /I confirm removing/ }).check()
  await page.getByRole('button', { name: 'Remove flash deal' }).last().click()
  const alert = page.locator('.fd-decision').getByRole('alert')
  await expect(alert).toContainText('Someone else changed this flash deal')
  await alert.getByRole('button', { name: 'Refresh' }).click()
  await expect(alert).toHaveCount(0)
  await expect(page.getByTestId('flash-drop-record')).toHaveCount(2)
})

test('overview card and attention row link to the flash deals page', async ({ page }) => {
  await boundary(page)
  await page.goto('/admin')
  const card = page.locator('.overview-summary a[href="/admin/flash-drops?view=scheduled"]')
  await expect(card).toContainText('Flash deals scheduled')
  await expect(card).toContainText('1')
  const attention = page.locator('.overview-attention')
  await expect(attention).toContainText('2 Flash deals live now')
  await expect(attention).not.toContainText('Flash deals scheduled to start')
  await attention.getByRole('link', { name: 'Watch live flash deals →' }).click()
  await expect(page).toHaveURL('/admin/flash-drops?view=live')
  await expect(tab(page, /Live \(2\)/)).toHaveAttribute('aria-selected', 'true')
  await page.goto('/admin')
  await card.click()
  await expect(page).toHaveURL('/admin/flash-drops?view=scheduled')
  await expect(tab(page, /Scheduled/)).toHaveAttribute('aria-selected', 'true')
})

for (const width of [390, 834, 1280]) {
  test(`review screenshots at ${width}px`, async ({ page }, info) => {
    await boundary(page)
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/admin/flash-drops')
    await expect(page.locator('.fd-detail')).toContainText('420 m away')
    expect(await noHorizontalScroll(page)).toBe(true)
    if (width < 992) {
      const small = await page
        .locator('.fd-panel button:visible')
        .evaluateAll((buttons) =>
          buttons
            .filter((button) => button.getBoundingClientRect().height < 44)
            .map((button) => button.textContent),
        )
      expect(small).toEqual([])
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath(`flash-drops-review-${width}.png`),
      fullPage: true,
    })
    await page.getByTestId('flash-drop-record').nth(1).click()
    await expect(page.locator('.fd-live')).toBeVisible()
    expect(await noHorizontalScroll(page)).toBe(true)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath(`flash-drops-live-${width}.png`),
      fullPage: true,
    })
    await page.goto('/admin')
    await expect(
      page.locator('.overview-summary a[href="/admin/flash-drops?view=scheduled"]'),
    ).toBeVisible()
    expect(await noHorizontalScroll(page)).toBe(true)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath(`admin-overview-${width}.png`),
      fullPage: true,
    })
  })
}
