import { copyFileSync, mkdirSync } from 'node:fs'
import { basename } from 'node:path'
import { expect, type Page, type TestInfo, test } from '@playwright/test'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import * as fixtures from './community-fixtures'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import * as squad from './squad-fake'

const { HOME, mockPublicApi, mockSignedIn, VENUES } = fixtures
const { fakeMember, mockSquadApi } = squad

// Makan Squad screens around the live vote: starting a room from a deal or the header, the
// host lobby, joining with a code (and every way that can go wrong), closing and the ended
// screen. The squad API is an in-memory fake with labelled synthetic rooms and people.
test.use({ geolocation: HOME, permissions: ['geolocation'] })

const WIDTHS = [390, 834, 1280] as const
const SHOTS_DIR = process.env.SQUAD_SHOTS_DIR

const shoot = async (page: Page, info: TestInfo, name: string) => {
  await expect(page.getByTestId('splash-screen')).toBeHidden()
  await page.evaluate(() => document.querySelector('.squad-room__body')?.scrollTo(0, 0))
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 844 })
    await page.waitForTimeout(450)
    const path = info.outputPath(`${name}-${width}.png`)
    await page.screenshot({ path })
    if (SHOTS_DIR) {
      mkdirSync(SHOTS_DIR, { recursive: true })
      copyFileSync(path, `${SHOTS_DIR}/${basename(path)}`)
    }
  }
}

const signedInWithSquad = async (page: Page) => {
  await mockPublicApi(page)
  await mockSignedIn(page)
  return mockSquadApi(page)
}

const HOST = () => fakeMember('Synthetic Damien', { isHost: true, avatar: 'kaya' })

test('the header Room button starts a room and fits a 320px phone', async ({ page }, info) => {
  await signedInWithSquad(page)
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/browse')
  await expect(page.getByTestId('splash-screen')).toBeHidden()
  // Measure the routed header, not the generic header that can precede a lazy route.
  const header = page.getByTestId('shell-header')
  const room = header.getByRole('link', { name: 'Start a Squad room' }).first()
  await expect(room).toBeVisible()
  const box = await room.boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  const search = await header.getByRole('search').boundingBox()
  expect(search?.width ?? 0).toBeGreaterThan(80)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await shoot(page, info, 'header-room-button')
  await page.getByTestId('squad-header-button').click()
  await expect(page).toHaveURL(/\/squad\/new$/)
  await expect(page.getByRole('heading', { name: 'Start a Squad room' })).toBeVisible()
})

test('a deal starts a room with itself picked; the lobby waits for a friend', async ({
  page,
}, info) => {
  const fake = await signedInWithSquad(page)
  await page.goto(`/deals/${'d2'.repeat(12)}?at=${VENUES.chicken.id}`)
  await page.getByTestId('squad-deal-cta').click()
  await expect(page).toHaveURL(/\/squad\/new\?deal=d2d2/)
  await expect(page.getByTestId('squad-picked-count')).toHaveText('1 of 10 picked')
  await expect(page.getByTestId('squad-name')).toHaveValue('Synthetic')
  await page.locator('.squad-dchip', { hasText: 'Synthetic kopi O' }).click()
  await expect(page.getByTestId('squad-picked-count')).toHaveText('2 of 10 picked')
  await shoot(page, info, 'create')

  await page.getByTestId('squad-open').click()
  await expect(page).toHaveURL(/\/squad\/KOPI$/)
  await expect(page.getByTestId('squad-code-tiles')).toHaveAttribute('data-code', 'KOPI')
  const start = page.getByTestId('squad-start')
  await expect(start).toBeDisabled()
  await expect(start).toHaveText('Waiting for at least 1 friend')
  await expect(page.getByTestId('squad-lobby-count')).toContainText('1 of 4 in the lobby')

  fake.addMember('KOPI', fakeMember('Synthetic Noah'))
  await expect(start).toBeEnabled({ timeout: 6000 })
  await expect(start).toHaveText('Start stirring the pot!')
  await expect(page.getByTestId('squad-lobby-members')).toContainText('Synthetic Noah')
  await shoot(page, info, 'host-lobby')

  // Closing asks first, then the ended screen offers a new room or the map.
  await page.getByTestId('squad-close').click()
  await expect(page.getByRole('dialog', { name: 'Close the lobby?' })).toBeVisible()
  await page.getByTestId('squad-confirm').click()
  await expect(page.getByTestId('squad-ended')).toContainText('You closed Room KOPI')
  await shoot(page, info, 'ended')
  await page.getByRole('link', { name: 'Back to the map' }).click()
  await expect(page).toHaveURL(/\/browse/)
  await expect(page.getByTestId('squad-header-button')).toHaveText(/^\s*Room\s*$/)
})

test('a guest joins with a code and waits in the lobby', async ({ page }, info) => {
  const fake = await signedInWithSquad(page)
  fake.seed({ code: 'KOPI', members: [HOST()] })
  await page.goto('/squad/join?code=kopi')
  await expect(page.getByTestId('squad-code')).toHaveValue('KOPI')
  await page.getByTestId('squad-name').fill('Noah')
  await expect(page.getByTestId('squad-join')).toHaveText('Join as Noah')
  await shoot(page, info, 'guest-join')
  await page.getByTestId('squad-join').click()
  await expect(page).toHaveURL(/\/squad\/KOPI$/)
  await expect(page.getByTestId('squad-lobby')).toContainText('Waiting for Synthetic Damien')
  await expect(page.getByTestId('squad-start')).toHaveCount(0)
  await expect(page.getByTestId('squad-header-button')).toContainText('KOPI')
  await shoot(page, info, 'guest-lobby')
})

test('join refusals land on the right field: wrong code, taken name, full room', async ({
  page,
}) => {
  const fake = await signedInWithSquad(page)
  fake.seed({ code: 'KOPI', members: [HOST(), fakeMember('Synthetic Noah')] })
  fake.seed({ code: 'FULL', capacity: 2, members: [HOST(), fakeMember('Synthetic Ashley')] })
  await page.goto('/squad/join')
  const code = page.getByTestId('squad-code')
  await code.fill('ko pa')
  await expect(code).toHaveValue('KOPA')
  await page.getByTestId('squad-name').fill('Synthetic Noah')
  await page.getByTestId('squad-join').click()
  await expect(code).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('alert')).toContainText('No room with that code')

  await code.fill('KOPI')
  await page.getByTestId('squad-join').click()
  await expect(page.getByTestId('squad-name')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('alert')).toContainText('already called Synthetic Noah')

  await code.fill('FULL')
  await page.getByTestId('squad-name').fill('Noah T')
  await page.getByTestId('squad-join').click()
  await expect(page.getByTestId('squad-full')).toContainText('FULL is full · 2 of 2')
  await expect(page.getByRole('link', { name: 'Start my own room' })).toBeVisible()
})

test('a room already voting explains watch mode before joining as a spectator', async ({
  page,
}) => {
  const fake = await signedInWithSquad(page)
  fake.seed({ code: 'TEHC', status: 'LIVE', members: [HOST(), fakeMember('Synthetic Ashley')] })
  await page.goto('/squad/join?code=TEHC')
  await page.getByTestId('squad-join').click()
  await expect(page.getByTestId('squad-watch-note')).toContainText(
    "You'll watch: they're already stirring the pot",
  )
  await expect(page.getByTestId('squad-join')).toHaveText('Watch Room TEHC')
  await page.getByTestId('squad-join').click()
  await expect(page).toHaveURL(/\/squad\/TEHC$/)
})

test('signed out, joining asks to log in and comes back to the code', async ({ page }) => {
  await mockPublicApi(page)
  await mockSquadApi(page)
  await page.goto('/squad/join?code=KOPI')
  await expect(page.getByRole('heading', { name: 'Log in to join' })).toBeVisible()
  await expect(page.getByTestId('squad-login')).toHaveAttribute(
    'href',
    /^\/login\?redirect=(\/|%2F)squad(\/|%2F)join.*KOPI$/,
  )
  await expect(page.getByTestId('squad-code')).toHaveCount(0)
})
