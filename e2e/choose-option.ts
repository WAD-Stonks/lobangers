import { expect, type Locator } from '@playwright/test'

export const chooseOption = async (combobox: Locator, value: string) => {
  if ((await combobox.getAttribute('aria-expanded')) !== 'true') await combobox.click()
  const listId = await combobox.getAttribute('aria-controls')
  await combobox.page().locator(`[id="${listId}"] [role="option"][data-value="${value}"]`).click()
}

export const listOptions = async (combobox: Locator) => {
  if ((await combobox.getAttribute('aria-expanded')) !== 'true') await combobox.click()
  const listId = await combobox.getAttribute('aria-controls')
  return combobox.page().locator(`[id="${listId}"] [role="option"]`)
}

export const expectChosen = (combobox: Locator, value: string) =>
  expect(combobox).toHaveAttribute('data-value', value)
