import { expect, type Page } from '@playwright/test'

// Presentation-only actions. Never replace native identity, HTTP, payloads or fixture state.
export async function openAdminNavigation(page: Page) {
  const trigger = page.getByRole('button', { name: 'Open navigation', exact: true })
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    await expect(trigger).toBeVisible()
    if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
    await expect(page.getByRole('dialog', { name: 'Administration navigation' })).toBeVisible()
  }
  const navigation = page.getByRole('navigation', { name: 'Administration', exact: true })
  await expect(navigation).toBeVisible()
  return navigation
}

export async function openAdminAccount(page: Page) {
  const trigger = page.getByRole('button', { name: 'Admin account', exact: true })
  await expect(trigger).toBeVisible()
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByTestId('admin-sign-out')).toBeVisible()
}

export async function chooseAccountsWorkspace(
  page: Page,
  name: 'Directory' | 'Merchant requests' | 'Account activity',
) {
  const tab = page
    .getByRole('tablist', { name: 'Accounts workspace', exact: true })
    .getByRole('tab', { name, exact: true })
  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel', { name, exact: true })).toBeVisible()
}

export async function chooseAccountDetail(page: Page, name: 'Access' | 'Security') {
  const tab = page
    .getByRole('tablist', { name: 'Account detail views', exact: true })
    .getByRole('tab', { name, exact: true })
  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel', { name, exact: true })).toBeVisible()
}
