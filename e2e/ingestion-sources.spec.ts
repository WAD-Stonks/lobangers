import { expect, type Page, test } from '@playwright/test'

// Synthetic API and native-session network boundaries. This exercises the real
// SPA, shared Axios client, DOM, keyboard and layout, not connected authorization.
const installBoundary = async (page: Page) => {
  const source = {
    id: '0123456789abcdef01234567',
    name: `Source ${'W'.repeat(110)}`,
    provider: 'TELEGRAM',
    externalId: 'thiscounted',
    url: 'https://t.me/s/ThisCounted',
    enabled: false,
    updatedAt: '2026-10-20T00:00:00.000Z',
  }
  const writes: { path: string; body: Record<string, unknown> }[] = []
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    let data: unknown
    let status = 200
    if (path === '/api/auth/get-session')
      data = {
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
    else if (path === '/api/auth-methods')
      data = { password: true, google: false, emailOtp: false, passwordRecovery: false }
    else if (path === '/api/ingestion/dashboard')
      data = {
        source: {
          name: 'MoneyDigest',
          enabled: false,
          reuseApproved: false,
          onemapConfigured: false,
        },
        counts: { pending: 0, approved: 0, rejected: 0, failed: 0 },
      }
    else if (path === '/api/ingestion/drafts') data = { items: [], nextCursor: null }
    else if (path === '/api/ingestion/runs') data = { items: [] }
    else if (path === '/api/ingestion/sources' && request.method() === 'GET')
      data = { items: [source], nextCursor: null }
    else if (path === '/api/ingestion/sources' && request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>
      writes.push({ path, body })
      data = {
        ...source,
        id: '111111111111111111111111',
        name: body.name,
        url: body.previewUrl,
        externalId: String(body.previewUrl).split('/').at(-1)?.toLowerCase(),
      }
      status = 201
    } else if (path === `/api/ingestion/sources/${source.id}` && request.method() === 'PATCH') {
      const body = request.postDataJSON() as Record<string, unknown>
      writes.push({ path, body })
      source.enabled = body.enabled === true
      source.updatedAt = source.enabled ? '2026-10-20T00:00:01.000Z' : '2026-10-20T00:00:02.000Z'
      data = source
    } else throw new Error(`Unexpected synthetic request ${request.method()} ${path}`)
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
  })
  return { source, writes }
}

for (const width of [320, 768, 1024, 1440]) {
  test(`synthetic source administration remains usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text())
    })
    const state = await installBoundary(page)
    await page.goto('/admin/ingestion')
    await expect(page.getByRole('heading', { name: 'Ingestion admin', exact: true })).toBeVisible()
    const panel = page.locator('section[aria-labelledby="sources-title"]')
    await expect(panel.getByRole('heading', { name: 'Telegram sources' })).toBeVisible()
    await panel.getByRole('button', { name: 'View sources', exact: true }).click()
    const row = panel.locator(`[data-source-id="${state.source.id}"]`)
    await expect(row.getByRole('button', { name: 'Enable source' })).toBeDisabled()
    await row
      .getByRole('checkbox', { name: 'I have confirmed this source is permitted for use' })
      .check()
    await row.getByRole('button', { name: 'Enable source' }).click()
    await expect(row.getByRole('button', { name: 'Disable source' })).toBeEnabled()
    expect(state.writes[0]?.body).toEqual({
      enabled: true,
      reuseConfirmed: true,
      expectedUpdatedAt: '2026-10-20T00:00:00.000Z',
    })
    await row.getByRole('button', { name: 'Disable source' }).click()
    await expect(row.getByRole('button', { name: 'Enable source' })).toBeDisabled()
    const url = `https://t.me/s/${'W'.repeat(32)}`
    await panel.getByLabel('Source name', { exact: true }).fill('Synthetic added source')
    await panel.getByLabel('Telegram preview URL', { exact: true }).fill(url)
    // Native keyboard form submission, not DOM event injection.
    await panel.getByLabel('Telegram preview URL', { exact: true }).press('Tab')
    await expect(panel.getByRole('button', { name: 'Add disabled source' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(panel.getByRole('status')).toContainText('Added disabled source')
    expect(state.writes.at(-1)?.body).toEqual({ name: 'Synthetic added source', previewUrl: url })
    expect(
      await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      })),
    ).toEqual({ width, scroll: width })
    await panel.screenshot({
      path: test.info().outputPath('sources-panel.png'),
    })
    await test.info().attach(`source-panel-${width}-accessibility`, {
      body: await panel.ariaSnapshot(),
      contentType: 'text/plain',
    })
    expect(errors).toEqual([])
  })
}
