import { postsPageSchema } from '@broke-oclock/contracts/ingestion-recovery'
import type { AdminOverviewResponse } from '@broke-oclock/contracts/platform-admin'
import { expect, type Page, test } from '@playwright/test'
// biome-ignore lint/style/noRestrictedImports: E2E-only helper; no E2E alias exists and config is outside this UI adoption scope.
import { openAdminAccount, openAdminNavigation } from './admin-ui'

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

// Explicitly synthetic native/REST boundaries. Real SPA/transport/layout only,
// not live authentication, provider delivery, database authorization or acceptance.
const overview: AdminOverviewResponse = {
  generatedAt: '2026-10-10T00:00:00.000Z',
  counts: { pendingMerchantRequests: 2, pendingImportedDrafts: 4, failedImportedPosts: 3 },
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
}
async function boundary(page: Page) {
  const reads: string[] = []
  let signedOut = false
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    reads.push(url.pathname + url.search)
    let body: unknown
    if (url.pathname === '/api/auth/get-session')
      body = signedOut
        ? null
        : {
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
          }
    else if (url.pathname === '/api/auth/sign-out') {
      signedOut = true
      body = { success: true }
    } else if (url.pathname === '/api/auth-methods')
      body = { password: true, google: false, emailOtp: false, passwordRecovery: false }
    else if (url.pathname === '/api/admin/overview') body = overview
    else if (url.pathname === '/api/ingestion/dashboard')
      body = {
        source: {
          name: 'Synthetic source',
          enabled: false,
          reuseApproved: false,
          onemapConfigured: false,
        },
        counts: { pending: 4, approved: 0, rejected: 0, failed: 3 },
      }
    else if (url.pathname === '/api/ingestion/runs') body = { items: [] }
    else if (url.pathname === '/api/ingestion/posts' && route.request().method() === 'GET') {
      expect(Object.fromEntries(url.searchParams)).toEqual({ status: 'FAILED', limit: '20' })
      body = postsPageSchema.parse({ items: [], nextCursor: null })
    } else if (
      [
        '/api/admin/accounts',
        '/api/admin/merchant-requests',
        '/api/admin/audit',
        '/api/ingestion/drafts',
      ].includes(url.pathname)
    )
      body = { items: [], nextCursor: null }
    else throw new Error(`Unexpected synthetic boundary: ${url.pathname}`)
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
  })
  return reads
}
for (const width of [320, 390, 1280]) {
  test(`synthetic admin overview and actionable deep links fit ${width}px`, async ({ page }) => {
    const reads = await boundary(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'Admin overview', exact: true })).toBeVisible()
    await expect(page.getByText('Live provider acceptance', { exact: true })).toBeVisible()
    await expect(page.getByText('NOT_ESTABLISHED', { exact: true })).toBeVisible()
    const requestLink = page.locator(
      'a[href="/admin/accounts?requestStatus=PENDING#merchant-requests"]',
    )
    await expect(requestLink).toContainText('2')
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await requestLink.focus()
    await requestLink.press('Enter')
    await expect(page).toHaveURL('/admin/accounts?requestStatus=PENDING#merchant-requests')
    await expect(page.locator('#request-status')).toHaveValue('PENDING')
    await expect(page.locator('#merchant-requests')).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    expect(
      reads.some(
        (url) => url.startsWith('/api/admin/merchant-requests?') && url.includes('status=PENDING'),
      ),
    ).toBe(true)
    await page.goto('/admin')
    await page.locator('a[href="/admin/ingestion?status=PENDING#queue-title"]').click()
    await expect(page.locator('#queue-status')).toHaveValue('PENDING')
    await expect(page.locator('#queue-title')).toBeVisible()
    await page.goto('/admin')
    await page.locator('a[href="/admin/ingestion#runs-title"]').click()
    await expect(page.locator('#runs-title')).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    expect(errors).toEqual([])
  })
}
test('synthetic native logout removes operational evidence before sign-in', async ({ page }) => {
  await boundary(page)
  await page.goto('/admin')
  await expect(
    page.locator('a[href="/admin/accounts?requestStatus=PENDING#merchant-requests"]'),
  ).toBeVisible()
  await openAdminAccount(page)
  await page.getByTestId('admin-sign-out').click()
  await expect(page.getByRole('heading', { name: 'Sign in to view administration' })).toBeVisible()
  await expect(
    page.locator('a[href="/admin/accounts?requestStatus=PENDING#merchant-requests"]'),
  ).toHaveCount(0)
})

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`synthetic restrained admin navigation and sign-in fit ${width}px`, async ({
    page,
  }, info) => {
    await boundary(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 900 })
    for (const path of ['/admin', '/admin/accounts', '/admin/ingestion']) {
      await page.goto(path)
      const nav = await openAdminNavigation(page)
      const active = nav.locator('[aria-current="page"]')
      await expect(active).toHaveCount(1)
      await expect(active).toHaveAttribute('href', path)
      await expect(nav.locator('a')).toHaveText([
        'Overview',
        'Deals',
        'Catalogue',
        'Moderation',
        'Accounts',
        'Ingestion',
        'Audit',
      ])
      expect(
        await nav
          .locator('a')
          .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
      ).toEqual([
        '/admin',
        '/admin/deals',
        '/admin/catalogue',
        '/admin/moderation',
        '/admin/accounts',
        '/admin/ingestion',
        '/admin/audit',
      ])
      await expect(page.locator('.site-header')).toHaveCount(0)
      await expect(page.locator('.admin-topbar')).toHaveCSS('position', 'sticky')
      await expect(
        page
          .locator('.admin-content .card:visible, .admin-content .workspace-surface:visible')
          .first(),
      ).toBeVisible()
      const styles = await page.evaluate(() => {
        const heading = document.querySelector('.admin-shell h1')
        const activeLink = document.querySelector('.admin-navigation [aria-current="page"]')
        const card = document.querySelector(
          '.admin-content .card, .admin-content .workspace-surface',
        )
        if (!heading || !activeLink || !card) throw new Error('Admin surfaces missing')
        return {
          font: getComputedStyle(heading).fontFamily,
          accent: getComputedStyle(activeLink, '::before').backgroundColor,
          navFill: getComputedStyle(activeLink).backgroundColor,
          navWeight: getComputedStyle(activeLink).fontWeight,
          navRows: new Set(
            [...document.querySelectorAll('.admin-navigation a')].map(
              (link) => link.getBoundingClientRect().top,
            ),
          ).size,
          surface: getComputedStyle(card).backgroundColor,
          canvas: getComputedStyle(document.querySelector('.admin-shell') ?? document.body)
            .backgroundColor,
          radius: getComputedStyle(card).borderRadius,
          fits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          viewport: innerWidth,
        }
      })
      expect(styles).toEqual({
        font: expect.stringContaining('-apple-system'),
        accent: 'rgb(243, 203, 69)',
        navFill: 'rgb(241, 242, 244)',
        navWeight: '650',
        navRows: 7,
        surface: 'rgb(255, 255, 255)',
        canvas: 'rgb(248, 249, 251)',
        radius: '8px',
        fits: true,
        viewport: width,
      })
      if (width < 768)
        await page.getByRole('button', { name: 'Close navigation', exact: true }).click()
      await page.screenshot({
        path: info.outputPath(`${path.split('/').at(-1)}-${width}.png`),
        fullPage: true,
      })
    }
    await openAdminAccount(page)
    await page.getByTestId('admin-sign-out').click()
    const signIn = page.getByRole('region', { name: 'Sign in to review ingestion' })
    await expect(signIn).toBeVisible()
    await expect(page.getByTestId('admin-sign-out')).toHaveCount(0)
    const submit = signIn.getByRole('button', { name: 'Sign in', exact: true })
    await expect(submit).toHaveCSS('background-color', 'rgb(243, 203, 69)')
    await expect(submit).toHaveCSS('color', 'rgb(32, 36, 43)')
    await page.getByLabel('Email', { exact: true }).focus()
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Password', { exact: true })).toBeFocused()
    await expect(page.getByLabel('Password', { exact: true })).toHaveCSS('outline-style', 'solid')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true)
    await page.screenshot({ path: info.outputPath(`sign-in-${width}.png`), fullPage: true })
    expect(errors).toEqual([])
  })
}

test('desktop sidebar collapse persists across genuine SPA navigation', async ({ page }, info) => {
  await boundary(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/admin')
  const shell = page.locator('.admin-shell')
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
  await expect(shell).toHaveClass(/admin-shell--collapsed/)
  await expect(page.locator('.admin-sidebar')).toHaveCSS('width', '72px')
  await expect(page.getByRole('button', { name: 'Expand sidebar', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  await page
    .getByRole('navigation', { name: 'Administration', exact: true })
    .getByRole('link', { name: 'Accounts', exact: true })
    .click()
  await expect(page).toHaveURL('/admin/accounts')
  await expect(page.getByRole('heading', { name: 'Accounts', level: 1, exact: true })).toBeVisible()
  await expect(shell).toHaveClass(/admin-shell--collapsed/)
  await expect(page.locator('.admin-sidebar')).toHaveCSS('width', '72px')
  await page.screenshot({ path: info.outputPath('collapsed-accounts-1440.png'), fullPage: true })
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click()
  await expect(shell).not.toHaveClass(/admin-shell--collapsed/)
  await expect(page.locator('.admin-sidebar')).toHaveCSS('width', '232px')
})

for (const width of [320, 390]) {
  test(`mobile native navigation traps focus, restores scroll and Escape focus at ${width}px`, async ({
    page,
  }, info) => {
    await boundary(page)
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'Admin overview', exact: true })).toBeVisible()
    const trigger = page.getByRole('button', { name: 'Open navigation', exact: true })
    const drawer = page.getByRole('dialog', { name: 'Administration navigation' })
    await expect(drawer).toBeHidden()
    await expect(page.getByRole('navigation', { name: 'Administration', exact: true })).toHaveCount(
      0,
    )
    const priorOverflow = await page.locator('body').evaluate((body) => body.style.overflow)
    await openAdminNavigation(page)
    await expect(drawer).toHaveAttribute('open', '')
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')
    const close = page.getByRole('button', { name: 'Close navigation', exact: true })
    await expect(close).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(drawer.getByRole('link', { name: 'Back to map', exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(close).toBeFocused()
    await page.screenshot({ path: info.outputPath(`navigation-open-${width}.png`) })
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    await expect(trigger).toBeFocused()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(await page.locator('body').evaluate((body) => body.style.overflow)).toBe(priorOverflow)
    const nav = await openAdminNavigation(page)
    await nav.getByRole('link', { name: 'Accounts', exact: true }).click()
    await expect(page).toHaveURL('/admin/accounts')
    await expect(
      page.getByRole('heading', { name: 'Accounts', level: 1, exact: true }),
    ).toBeVisible()
    await expect(drawer).toBeHidden()
    expect(await page.locator('body').evaluate((body) => body.style.overflow)).toBe(priorOverflow)
    await openAdminAccount(page)
    await page.getByTestId('admin-sign-out').focus()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('admin-sign-out')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Admin account', exact: true })).toBeFocused()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true)
  })
}
