import { expect, test } from '@playwright/test'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { failUnmockedApi } from './unmocked-api'

test.beforeEach(({ page }) => failUnmockedApi(page))

const BROWSE_CANVAS = '[data-testid="map-shell"]'

test('the landing page opens the preserved browse map and navigation works', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Bang for your buck.' })).toBeVisible()
  await page.getByRole('link', { name: 'Explore food deals' }).first().click()
  await expect(page.locator(BROWSE_CANVAS)).toBeVisible()
  await expect(page.getByTestId('panel-toggle')).toHaveCount(0)
  await expect(page.getByTestId('split-toggle')).toHaveCount(0)
  await page.getByTestId('nav-toggle').click()
  await page.getByTestId('nav-menu').getByRole('link', { name: 'All deals' }).click()
  await expect(page).toHaveURL(/view=list/)
  await expect(page.locator(BROWSE_CANVAS)).toBeVisible()
  await expect(page.getByTestId('nav-menu')).toHaveCount(0)
})

test('the /browse address retains the interactive deal map', async ({ page }) => {
  await page.goto('/browse')
  await expect(page).toHaveURL(/\/browse$/)
  await expect(page.locator(BROWSE_CANVAS)).toBeVisible()
})

test('unknown route has a usable recovery link', async ({ page }) => {
  await page.goto('/does-not-exist')
  await expect(page.getByRole('main')).toContainText(/not found|404/i)
  await page.getByRole('main').locator('a[href="/"]', { hasText: 'Return home' }).click()
  await expect(page.getByRole('heading', { name: 'Bang for your buck.' })).toBeVisible()
})

for (const width of [390, 1280]) {
  test(`starter routes fit ${width}px without runtime errors`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 850 })
    for (const route of ['/', '/getting-started']) {
      await page.goto(route)
      await expect(page.getByRole('main')).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      )
      expect(overflow).toBe(false)
      await page.screenshot({
        path: info.outputPath(`${route === '/' ? 'landing' : 'setup'}-${width}.png`),
        fullPage: true,
      })
    }
    expect(errors).toEqual([])
  })
}
