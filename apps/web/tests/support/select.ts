import { flushPromises, type VueWrapper } from '@vue/test-utils'

export const chooseOption = async (wrapper: VueWrapper, selector: string, value: string) => {
  const trigger = wrapper.get(selector)
  if (trigger.attributes('aria-expanded') !== 'true') await trigger.trigger('click')
  const listbox = document.getElementById(trigger.attributes('aria-controls') ?? '')
  const option = [...(listbox?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])].find(
    (element) => element.dataset.value === value,
  )
  if (!option) throw new Error(`No option "${value}" in ${selector}`)
  option.click()
  await flushPromises()
}

export const selectedValue = (wrapper: VueWrapper, selector: string) =>
  wrapper.get(selector).attributes('data-value')

export const optionLabels = async (wrapper: VueWrapper, selector: string) => {
  const trigger = wrapper.get(selector)
  await trigger.trigger('click')
  const listbox = document.getElementById(trigger.attributes('aria-controls') ?? '')
  const labels = [...(listbox?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])].map(
    (option) => option.textContent?.trim() ?? '',
  )
  await trigger.trigger('keydown', { key: 'Escape' })
  return labels
}
