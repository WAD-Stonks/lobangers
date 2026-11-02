import { expect, type Page, test } from '@playwright/test'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import * as fixtures from './community-fixtures'

const { HOME, mockPublicApi, mockSignedIn } = fixtures

// Hungry Nearby on the map: other people as small lobangers, poking them, and showing or hiding
// yourself. The presence API is mocked with labelled SYNTHETIC people; nobody here is real.
test.use({ geolocation: HOME, permissions: ['geolocation'] })

const AVATARS = ['bao', 'chickenrice', 'kaya', 'kopi', 'ondeh', 'teh'] as const
// Synthetic fuzzed spots a short walk around HOME, between the synthetic deal pins.
const SYNTHETIC_PEOPLE = [
  [0.0011, -0.0004],
  [-0.0009, 0.0012],
  [0.0004, 0.0019],
  [-0.0016, -0.0013],
  [0.0019, 0.0009],
  [-0.0003, -0.0021],
].map(([dLat = 0, dLng = 0], index) => ({
  token: `synthetic-person-${String(index).padStart(2, '0')}`,
  avatar: AVATARS[index % AVATARS.length],
  lat: HOME.latitude + dLat,
  lng: HOME.longitude + dLng,
}))

type Calls = { put: Record<string, unknown>[]; deletes: number; gets: number }

const mockPresence = async (page: Page) => {
  const calls: Calls = { put: [], deletes: 0, gets: 0 }
  let me: Record<string, unknown> | null = null
  await page.route('**/api/presence*', async (route) => {
    const request = route.request()
    if (request.method() === 'PUT') {
      const body = request.postDataJSON() as Record<string, unknown>
      calls.put.push(body)
      me = {
        token: 'synthetic-me-token-0001',
        avatar: body.avatar ?? 'kopi',
        lat: HOME.latitude + 0.0002,
        lng: HOME.longitude + 0.0013,
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      }
      return route.fulfill({ json: { me } })
    }
    if (request.method() === 'DELETE') {
      calls.deletes += 1
      me = null
      return route.fulfill({ json: { ok: true } })
    }
    calls.gets += 1
    return route.fulfill({
      json: { serverTime: new Date().toISOString(), items: SYNTHETIC_PEOPLE, me },
    })
  })
  return calls
}

const people = (page: Page) => page.locator('.nearby-person-anchor[title="Another lobanger"]')

const openMap = async (page: Page) => {
  await page.goto('/browse')
  await expect(page.getByTestId('splash-screen')).toBeHidden()
  await expect(page.locator('.deal-map-pin__badge').first()).toBeVisible()
}

test('nobody shows until the toggle is on, then people stand on the map', async ({ page }) => {
  await mockPublicApi(page)
  const calls = await mockPresence(page)
  await page.setViewportSize({ width: 1280, height: 844 })
  await openMap(page)
  await expect(people(page)).toHaveCount(0)
  expect(calls.gets).toBe(0)
  const toggle = page.getByTestId('nearby-toggle')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(people(page)).toHaveCount(SYNTHETIC_PEOPLE.length)
  await page.getByTestId('nearby-just-look').click()
  await expect(page.getByText('Showing lobangers nearby. You stay hidden.')).toBeVisible()
  await toggle.click()
  await expect(people(page)).toHaveCount(0)
  // Looking alone never writes anything.
  expect(calls.put).toHaveLength(0)
  expect(calls.deletes).toBe(0)
})

test('hovering says "Another lobanger" and tapping pokes them', async ({ page }) => {
  await mockPublicApi(page)
  await mockPresence(page)
  await page.setViewportSize({ width: 1280, height: 844 })
  await openMap(page)
  await page.getByTestId('nearby-toggle').click()
  await page.getByTestId('nearby-just-look').click()
  await expect(page.getByTestId('nearby-popover')).toBeHidden()
  const first = people(page).first()
  const label = first.locator('.nearby-person__label')
  await expect(label).toHaveText('Another lobanger')
  await first.hover()
  await expect(label).toHaveCSS('opacity', '1')
  await first.click()
  await expect(first.locator('.nearby-person')).toHaveClass(/is-poked/)
  await expect(first.locator('img')).toHaveAttribute('src', /-poked\.webp$/)
  await expect(first.locator('img')).toHaveAttribute('src', /-idle\.webp$/)
  // Nothing about the person beyond the label.
  await expect(first).not.toContainText('synthetic')
})

test('a signed-out visitor is asked to log in to show themselves', async ({ page }) => {
  await mockPublicApi(page)
  const calls = await mockPresence(page)
  await openMap(page)
  await page.getByTestId('nearby-toggle').click()
  const popover = page.getByTestId('nearby-popover')
  await expect(popover.getByRole('link', { name: 'Log in to show yourself' })).toBeVisible()
  await expect(popover.getByTestId('nearby-show-me')).toHaveCount(0)
  expect(calls.put).toHaveLength(0)
})

test('Show me too shares a spot, and Hide me stops at once', async ({ page }) => {
  await mockPublicApi(page)
  await mockSignedIn(page)
  const calls = await mockPresence(page)
  await page.setViewportSize({ width: 1280, height: 844 })
  await openMap(page)
  await page.getByTestId('nearby-toggle').click()
  const popover = page.getByTestId('nearby-popover')
  await popover.getByRole('button', { name: 'Teh' }).click()
  await popover.getByTestId('nearby-show-me').click()
  await expect.poll(() => calls.put.length).toBe(1)
  expect(calls.put[0]).toMatchObject({ avatar: 'teh' })
  expect(Object.keys(calls.put[0] ?? {}).sort()).toEqual(['avatar', 'lat', 'lng'])
  const self = page.locator('.nearby-person--self')
  await expect(self).toBeVisible()
  await expect(self).toContainText('You')
  await expect(self.locator('img')).toHaveAttribute('src', '/lobangers/teh-idle.webp')
  // The viewer never appears in their own list of other people.
  await expect(people(page)).toHaveCount(SYNTHETIC_PEOPLE.length)
  await expect(popover.getByTestId('nearby-hide-me')).toBeVisible()
  await popover.getByTestId('nearby-hide-me').click()
  await expect.poll(() => calls.deletes).toBe(1)
  await expect(self).toHaveCount(0)
  await expect(page.getByText('You are hidden.')).toBeVisible()
  // The choice is remembered without sharing.
  const stored = await page.evaluate(() => window.localStorage.getItem('lobangers-nearby'))
  expect(JSON.parse(stored ?? '{}')).toMatchObject({ looking: true, sharing: false, avatar: 'teh' })
})

test('hungry nearby screens for review', async ({ page }, info) => {
  test.setTimeout(120_000)
  await mockPublicApi(page)
  await mockSignedIn(page)
  await mockPresence(page)
  for (const width of [390, 834, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/browse')
    await page.evaluate(() => window.localStorage.removeItem('lobangers-nearby'))
    await openMap(page)
    await page.getByTestId('nearby-toggle').click()
    await expect(people(page)).toHaveCount(SYNTHETIC_PEOPLE.length)
    await page.waitForTimeout(500)
    await page.screenshot({ path: info.outputPath(`nearby-popover-${width}.png`) })
    await page.getByTestId('nearby-show-me').click()
    await expect(page.locator('.nearby-person--self')).toBeVisible()
    await page.getByRole('button', { name: 'Done' }).click()
    // Poke the person nearest the middle of the visible map, not one under the header or sheet.
    const reachable = await people(page).evaluateAll((nodes) => {
      const scored = nodes.map((node, index) => {
        const box = node.getBoundingClientRect()
        const x = box.x + box.width / 2
        const y = box.y + box.height / 2
        const hit = document.elementFromPoint(x, y)
        const open = hit !== null && node.contains(hit) && y > 160
        return { index, open, score: Math.hypot(x - window.innerWidth / 2, y - 280) }
      })
      return scored.filter((item) => item.open).sort((a, b) => a.score - b.score)[0]?.index ?? -1
    })
    expect(reachable).toBeGreaterThanOrEqual(0)
    await people(page).nth(reachable).click()
    await page.waitForTimeout(120)
    await page.screenshot({ path: info.outputPath(`nearby-map-${width}.png`) })
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflow).toBe(false)
    const box = await page.getByTestId('nearby-toggle').boundingBox()
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(width < 992 ? 44 : 40)
    await page.getByTestId('nearby-toggle').click()
  }
})
