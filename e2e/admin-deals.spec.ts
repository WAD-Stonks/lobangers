import { expect, type Page, test } from '@playwright/test'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { adminDeal, at, fakeAdminDeals } from './admin-deal-fixtures'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { chooseOption } from './choose-option'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { hex } from './fake-backend'

const SUBMITTED = adminDeal(hex(91), 'Synthetic 1for1 chikcen rice')
const APPROVED = adminDeal(hex(92), 'Synthetic kopi O promo', {
  reviewStatus: 'APPROVED',
  publication: 'PUBLISHED',
  publishedAt: at,
  reviewedVersion: 1,
})
const fakeDeals = (page: Page) => fakeAdminDeals(page, [SUBMITTED, APPROVED])

const selectDeal = async (page: Page, title: string) => {
  await page.getByTestId('select-deal').filter({ hasText: title }).click()
  await expect(page.getByRole('heading', { level: 2, name: title })).toBeFocused()
}
const workspaceTab = (page: Page, name: string) =>
  page.getByRole('tablist', { name: 'Deal workspace' }).getByRole('tab', { name })
const consent = async (page: Page, note: string) => {
  await page.getByLabel('Required reason').fill(note)
  await page.getByRole('checkbox', { name: /^I confirm/ }).check()
}
const message = (page: Page) =>
  page.getByRole('status').filter({ hasText: /Saved\.|changed|rejected/ })

test('an admin corrects a community deal, approves it and it is published', async ({ page }) => {
  const { backend } = await fakeDeals(page)
  await page.goto('/admin/deals')

  await chooseOption(page.getByRole('combobox', { name: 'Review' }), 'PENDING')
  await page.getByTestId('reload-list').click()
  await expect(page.getByTestId('select-deal')).toHaveCount(1)
  await selectDeal(page, SUBMITTED.title)

  await workspaceTab(page, 'Content').click()
  await page.getByLabel(/^Title/).fill('Synthetic 1-for-1 chicken rice')
  await consent(page, 'Fixed the spelling in the title.')
  await page.getByTestId('save-content').click()
  await expect(message(page)).toHaveText(
    'Saved. Review the actual state below; approval does not always publish.',
  )
  await expect(
    page.getByRole('heading', { level: 2, name: 'Synthetic 1-for-1 chicken rice' }),
  ).toBeVisible()
  expect(backend.callsTo('PATCH', /\/content$/).at(-1)?.body).toEqual({
    expectedContentVersion: 1,
    expectedOperationVersion: 0,
    note: 'Fixed the spelling in the title.',
    changes: { title: 'Synthetic 1-for-1 chicken rice' },
  })

  await workspaceTab(page, 'Review').click()
  await expect(page.getByText('This approval will publish the deal.')).toBeVisible()
  await consent(page, 'Matches the poster photo.')
  await page.getByTestId('save-operation').click()
  await expect(message(page)).toBeVisible()
  expect(backend.callsTo('POST', /\/review$/).at(-1)?.body).toEqual({
    expectedContentVersion: 2,
    expectedOperationVersion: 0,
    note: 'Matches the poster photo.',
    decision: 'APPROVE',
  })

  await chooseOption(page.getByRole('combobox', { name: 'Review' }), 'APPROVED')
  await page.getByTestId('reload-list').click()
  await expect(
    page.getByTestId('select-deal').filter({ hasText: 'Synthetic 1-for-1 chicken rice' }),
  ).toBeVisible()
})

test('an admin cannot overwrite a deal someone else changed until they refresh it', async ({
  page,
}) => {
  const { backend, changeBehindTheAdminsBack } = await fakeDeals(page)
  await page.goto('/admin/deals')
  await selectDeal(page, SUBMITTED.title)

  changeBehindTheAdminsBack(SUBMITTED.id, 'Synthetic 1-for-1 chicken rice (fixed)')
  await workspaceTab(page, 'Content').click()
  await page.getByLabel(/^Title/).fill('Synthetic chicken rice deal')
  await consent(page, 'Fixing the title.')
  await page.getByTestId('save-content').click()
  await expect(message(page)).toContainText('Deal changed or the outcome is unknown.')
  await expect(page.getByTestId('save-content')).toBeDisabled()

  await page.getByTestId('refresh-deal').click()
  await expect(
    page.getByRole('heading', { level: 2, name: 'Synthetic 1-for-1 chicken rice (fixed)' }),
  ).toBeVisible()
  await workspaceTab(page, 'Content').click()
  await expect(page.getByLabel(/^Title/)).toHaveValue('Synthetic 1-for-1 chicken rice (fixed)')
  await page.getByLabel(/^Description/).fill('Buy one plate, get one free. Weekdays only.')
  await consent(page, 'Added the weekday condition.')
  await page.getByTestId('save-content').click()
  await expect(message(page)).toHaveText(
    'Saved. Review the actual state below; approval does not always publish.',
  )
  expect(backend.callsTo('PATCH', /\/content$/).at(-1)?.body).toMatchObject({
    expectedContentVersion: 2,
  })
})
