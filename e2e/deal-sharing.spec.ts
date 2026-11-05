import { expect, type Page, test } from '@playwright/test'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { DEALS, VENUES } from './community-fixtures'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { account, fakeBackend } from './fake-backend'

const MEMBER = account('USER', { name: 'Synthetic Priya' })
const BOBA = DEALS[2] as { id: string; title: string }

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

const searchFor = async (page: Page, text: string) => {
  const search = page.getByRole('banner').getByRole('searchbox', { name: 'Search deals' })
  await search.fill(text)
  await search.press('Enter')
}
const saveButtons = (page: Page) => page.getByRole('button', { name: /^Save / })

test('a visitor searches for a dish, clears the search and gets every deal back', async ({
  page,
}) => {
  await fakeBackend(page)
  await page.goto('/deals')
  await expect(page.getByTestId('splash-screen')).toBeHidden()
  await expect(saveButtons(page)).toHaveCount(DEALS.length)

  await searchFor(page, 'prata')
  await expect(page).toHaveURL(/[?&]q=prata/)
  await expect(saveButtons(page)).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Save Synthetic plain prata' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save Synthetic prata kosong set' })).toBeVisible()

  await searchFor(page, 'nothing-like-this')
  await expect(saveButtons(page)).toHaveCount(0)

  await page.getByRole('banner').getByRole('button', { name: 'Clear search' }).click()
  await expect(page).not.toHaveURL(/[?&]q=/)
  await expect(saveButtons(page)).toHaveCount(DEALS.length)
})

test('a member shares a deal and a signed-out friend opens the link', async ({ page, browser }) => {
  await fakeBackend(page, { user: MEMBER })
  await page.goto('/deals')
  await expect(page.getByTestId('splash-screen')).toBeHidden()

  await page
    .getByRole('link', { name: new RegExp(BOBA.title) })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: BOBA.title })).toBeVisible()
  await page.getByTestId('share-deal').click()
  const menu = page.getByRole('menu', { name: `Share ${BOBA.title}` })
  await expect(menu.getByRole('menuitem')).toHaveCount(3)
  await menu.getByRole('menuitem', { name: 'Copy link' }).click()
  await expect(page.getByTestId('toast')).toHaveText('Link copied')
  await expect(menu).toHaveCount(0)

  const link = await page.evaluate(() => navigator.clipboard.readText())
  expect(new URL(link).pathname).toBe(`/deals/${BOBA.id}`)
  await page.getByTestId('share-deal').click()
  const whatsApp = await menu.getByRole('menuitem', { name: 'WhatsApp' }).getAttribute('href')
  expect(whatsApp).toMatch(/^https:\/\/wa\.me\/\?text=/)
  expect(new URL(whatsApp ?? '').searchParams.get('text')).toContain(link)

  const friend = await browser.newPage()
  await fakeBackend(friend)
  await friend.goto(link)
  await expect(friend.getByRole('heading', { name: BOBA.title })).toBeVisible()
  await expect(friend.getByText(VENUES.boba.name).first()).toBeVisible()
  await expect(friend.getByRole('button', { name: /Account menu/ })).toHaveCount(0)
  await friend.close()
})

test('an unknown deal link explains that the deal is gone', async ({ page }) => {
  await fakeBackend(page)
  await page.goto(`/deals/${'e9'.repeat(12)}`)
  await expect(page.getByTestId('splash-screen')).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Deal not found' })).toBeVisible()
  await expect(page.getByText('This deal has ended or is no longer listed.')).toBeVisible()
})
