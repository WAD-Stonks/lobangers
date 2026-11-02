import { expect, test } from '@playwright/test'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { HOME, mockPublicApi } from './community-fixtures'

// Review screenshots of the community features at phone, tablet and desktop widths. The API is
// mocked with labelled synthetic fixtures; map tiles load from the network when available.
test.use({ geolocation: HOME, permissions: ['geolocation'] })

const WIDTHS = [390, 834, 1280] as const

test('map pins and groups for review', async ({ page }, info) => {
  test.setTimeout(120_000)
  await mockPublicApi(page)
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/browse')
    await expect(page.getByTestId('splash-screen')).toBeHidden()
    await expect(page.locator('.deal-map-pin__badge').first()).toBeVisible()
    await page.screenshot({ path: info.outputPath(`pins-near-${width}.png`) })
    // Phones have no zoom buttons, so zoom out with the wheel over the open part of the map.
    await page.mouse.move(width / 2, 200)
    for (const _ of [1, 2, 3]) {
      await page.mouse.wheel(0, 400)
      await page.waitForTimeout(400)
    }
    await expect(page.locator('.deal-map-cluster__chip').first()).toBeVisible()
    await page.waitForTimeout(800)
    await page.screenshot({ path: info.outputPath(`pins-groups-${width}.png`) })
  }
})
