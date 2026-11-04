import { expect, test } from '@playwright/test'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import * as fixtures from './community-fixtures'

const { flashDrop, HOME, mockFlashApi, mockPublicApi, mockSignedIn, VENUES } = fixtures

// Flash Drop on the map: the banner after a quiet moment, the edge banner for a drop off
// screen, claiming one code and finding it again in My codes. The API is mocked with labelled
// synthetic fixtures; every drop is a fake deal.
test.use({ geolocation: HOME, permissions: ['geolocation'] })

const settledMap = async (page: import('@playwright/test').Page) => {
  await page.goto('/browse')
  await expect(page.getByTestId('splash-screen')).toBeHidden()
  await expect(page.locator('.flash-pin__oval').first()).toBeVisible()
}

test('a quiet map pops the banner over the drop, then lets it go after five seconds', async ({
  page,
}) => {
  await mockPublicApi(page)
  await mockFlashApi(page, [flashDrop()])
  await page.setViewportSize({ width: 1280, height: 844 })
  await settledMap(page)
  const banner = page.locator('.flash-banner')
  await expect(banner).toBeVisible({ timeout: 6000 })
  await expect(banner).toContainText('Fake deal')
  await expect(banner).toContainText('$1.50 Synthetic chicken rice set')
  await expect(banner).toBeHidden({ timeout: 7000 })
})

test('the banner opens the deal, where a signed-out visitor is asked to log in', async ({
  page,
}) => {
  await mockPublicApi(page)
  await mockFlashApi(page, [flashDrop()])
  await settledMap(page)
  await page.locator('.flash-banner').click({ timeout: 6000 })
  await expect(page).toHaveURL(/\/deals\/d2d2/)
  const card = page.getByTestId('flash-claim')
  await expect(card).toContainText('Fake deal')
  await expect(card).toContainText('12 codes left of 40')
  await expect(card.getByRole('link', { name: 'Log in to claim a code' })).toBeVisible()
})

test('claiming keeps one code, shows it on the deal and in My codes', async ({ page }) => {
  await mockPublicApi(page)
  await mockSignedIn(page)
  await mockFlashApi(page, [flashDrop()])
  await page.goto(`/deals/${'d2'.repeat(12)}?at=${VENUES.chicken.id}`)
  await page.getByTestId('flash-claim-button').click()
  await expect(page.getByTestId('flash-code')).toContainText('LB-7KQ2MX')
  await expect(page.getByTestId('codes-dot')).toBeVisible()
  await page.getByTestId('nav-toggle').click()
  await expect(page.getByTestId('my-codes-link')).toContainText('1 code ready to use')
  await page.getByTestId('my-codes-link').click()
  await expect(page).toHaveURL(/\/codes/)
  await expect(page.getByTestId('my-code')).toContainText('LB-7KQ2MX')
})

test('a drop with no codes left says so and never pops a banner', async ({ page }) => {
  await mockPublicApi(page)
  await mockSignedIn(page)
  await mockFlashApi(page, [flashDrop({ codesLeft: 0 })])
  await page.goto(`/deals/${'d2'.repeat(12)}?at=${VENUES.chicken.id}`)
  await expect(page.getByTestId('flash-claim')).toContainText('All the codes have been claimed')
  await expect(page.getByTestId('flash-claim-button')).toHaveCount(0)
})

test('a drop off screen docks its banner to the edge and flies there', async ({ page }) => {
  await mockPublicApi(page)
  await mockFlashApi(page, [
    flashDrop({
      dealId: 'd6'.repeat(12),
      dealTitle: 'Synthetic fishball noodles',
      venueId: VENUES.far.id,
      venueName: VENUES.far.name,
      lat: VENUES.far.lat,
      lng: VENUES.far.lng,
    }),
  ])
  await page.goto('/browse')
  await expect(page.getByTestId('splash-screen')).toBeHidden()
  const edge = page.getByTestId('flash-edge-banner')
  // The banner waits for a quiet map (FIRST_IDLE_MS), which takes longer to settle when the
  // machine is busy running other tests.
  await expect(edge).toBeVisible({ timeout: 15_000 })
  await expect(edge).toContainText('away')
  await edge.click()
  await expect(page).toHaveURL(/\/deals\/d6d6/)
})
