import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'

const id = '0123456789abcdef01234567'
const rest = vi.hoisted(() => ({
  merchants: vi.fn(),
  merchant: vi.fn(),
  patchMerchant: vi.fn(),
  archiveMerchant: vi.fn(),
  createMerchant: vi.fn(),
}))
vi.mock('@web/lib/api-client', () => ({ api: { adminCatalogue: rest } }))
const row = {
  id,
  name: 'Synthetic mounted merchant',
  version: 7,
  archived: false,
  venueCount: 2,
  dealCount: 3,
}
const clickButton = async (wrapper: ReturnType<typeof mount>, text: string) => {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === text)
  if (!button) throw new Error(`Missing button: ${text}`)
  await button.trigger('click')
}
beforeEach(() => {
  vi.resetAllMocks()
  rest.merchants.mockResolvedValue({ items: [row], nextCursor: null })
  rest.merchant.mockResolvedValue(row)
  rest.patchMerchant.mockResolvedValue({ id, version: 8 })
})
it('mounts directory, reads exact detail, confirms immutable versioned payload and locks unknown outcomes', async () => {
  const { default: Panel } = await import('@web/modules/admin-catalogue/CataloguePanel.vue')
  const wrapper = mount(Panel)
  await flushPromises()
  await wrapper.get('button[data-open-row="Synthetic mounted merchant"]').trigger('click')
  await flushPromises()
  await wrapper.get('[name="merchantName"]').setValue('Synthetic spelling correction')
  await wrapper.get('[name="note"]').setValue('Reviewed exact target')
  await wrapper.get('[name="confirmed"]').setValue(true)
  rest.patchMerchant.mockRejectedValueOnce(new Error('Synthetic unknown response'))
  await wrapper.get('form:has([name="merchantName"])').trigger('submit')
  await flushPromises()
  expect(rest.patchMerchant).toHaveBeenCalledWith(id, {
    name: 'Synthetic spelling correction',
    expectedVersion: 7,
    note: 'Reviewed exact target',
    confirmed: true,
  })
  expect(wrapper.text()).toContain('The outcome could not be confirmed')
  expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined()
  expect(rest.archiveMerchant).not.toHaveBeenCalled()
  wrapper.unmount()
})
it('reports server role denial and fences the late directory response on unmount', async () => {
  const { default: Panel } = await import('@web/modules/admin-catalogue/CataloguePanel.vue')
  rest.merchants.mockRejectedValueOnce({ code: 'FORBIDDEN' })
  const wrapper = mount(Panel)
  await flushPromises()
  expect(wrapper.emitted('denied')).toEqual([['FORBIDDEN']])
  expect(wrapper.find('[name="merchantName"]').exists()).toBe(false)
  wrapper.unmount()
})

it.each(['UNKNOWN', 'CONFLICT'])(
  'retains mounted %s identity lock through same-version reload and selection until newer detail',
  async (outcome) => {
    const { default: Panel } = await import('@web/modules/admin-catalogue/CataloguePanel.vue')
    rest.patchMerchant.mockRejectedValueOnce(
      outcome === 'CONFLICT' ? { code: outcome } : new Error('Synthetic timeout'),
    )
    const w = mount(Panel)
    const open = async () => {
      await w.get('button[data-open-row="Synthetic mounted merchant"]').trigger('click')
      await flushPromises()
    }
    const submit = async () => {
      await w.get('[name="merchantName"]').setValue('Corrected')
      await w.get('[name="note"]').setValue('Reviewed')
      await w.get('[name="confirmed"]').setValue(true)
      await w.get('form:has([name="merchantName"])').trigger('submit')
      await flushPromises()
    }
    try {
      await flushPromises()
      await open()
      await submit()
      await clickButton(w, 'Reload target detail')
      await flushPromises()
      await submit()
      expect(
        rest.patchMerchant,
        'unchanged authoritative detail must not permit replay',
      ).toHaveBeenCalledTimes(1)
      expect(w.get('fieldset').attributes('disabled')).toBeDefined()
      expect(w.text()).toContain(
        outcome === 'CONFLICT' ? 'changed' : 'outcome could not be confirmed',
      )
      await w.get('form.row').trigger('submit')
      await flushPromises()
      await open()
      await submit()
      expect(rest.patchMerchant).toHaveBeenCalledTimes(1)
      rest.merchant.mockResolvedValue({ ...row, version: 8 })
      await clickButton(w, 'Reload target detail')
      await flushPromises()
      expect(w.get<HTMLTextAreaElement>('[name="note"]').element.value).toBe('')
      expect(w.get('fieldset').attributes('disabled')).toBeUndefined()
      await submit()
      expect(rest.patchMerchant).toHaveBeenCalledTimes(2)
      expect(rest.patchMerchant.mock.calls[1]?.[1].expectedVersion).toBe(8)
    } finally {
      w.unmount()
    }
  },
)
it('retains an unknown merchant creation when another create form is opened', async () => {
  const { default: Panel } = await import('@web/modules/admin-catalogue/CataloguePanel.vue')
  rest.createMerchant.mockRejectedValue(new Error('Synthetic timeout'))
  const w = mount(Panel)
  try {
    await flushPromises()
    const start = async () => {
      await clickButton(w, 'New merchant')
      await flushPromises()
    }
    await start()
    await w.get('[name="merchantName"]').setValue('Unknown created merchant')
    await w.get('[name="note"]').setValue('Reviewed creation')
    await w.get('[name="confirmed"]').setValue(true)
    await w.get('form:has([name="merchantName"])').trigger('submit')
    await flushPromises()
    await start()
    await w.get('[name="merchantName"]').setValue('Unknown created merchant')
    await w.get('[name="note"]').setValue('Fresh consent cannot erase unknown creation')
    await w.get('[name="confirmed"]').setValue(true)
    expect(w.get('fieldset').attributes('disabled')).toBeDefined()
    await w.get('form:has([name="merchantName"])').trigger('submit')
    await flushPromises()
    expect(w.text()).toContain('audit')
    expect(w.text()).toContain('Unknown created merchant')
    expect(rest.createMerchant).toHaveBeenCalledTimes(1)
    await w.get('button[data-open-row="Synthetic mounted merchant"]').trigger('click')
    await flushPromises()
    expect(w.get('fieldset').attributes('disabled')).toBeUndefined()
  } finally {
    w.unmount()
  }
})

it('opens the editor in the inspector, focuses it and returns to the same directory record', async () => {
  const { default: Panel } = await import('@web/modules/admin-catalogue/CataloguePanel.vue')
  const wrapper = mount(Panel, { attachTo: document.body })
  try {
    await flushPromises()
    await wrapper.get('[data-open-row="Synthetic mounted merchant"]').trigger('click')
    await flushPromises()
    const heading = wrapper.get('[data-testid="catalogue-detail-heading"]')
    expect(heading.text()).toBe(row.name)
    expect(document.activeElement).toBe(heading.element)
    expect(wrapper.find('.admin-record-workspace-detail .catalogue-editor').exists()).toBe(true)
    expect(wrapper.find('.admin-record-workspace-list .catalogue-editor').exists()).toBe(false)
    await clickButton(wrapper, '← Back to results')
    expect(wrapper.find('[name="merchantName"]').exists()).toBe(false)
    expect(document.activeElement).toBe(
      wrapper.get('[data-open-row="Synthetic mounted merchant"]').element,
    )
  } finally {
    wrapper.unmount()
  }
})

it('fences a late detail when returning to the directory before the read finishes', async () => {
  const { default: Panel } = await import('@web/modules/admin-catalogue/CataloguePanel.vue')
  let release!: (value: typeof row) => void
  rest.merchant.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  const wrapper = mount(Panel)
  try {
    await flushPromises()
    await wrapper.get('[data-open-row="Synthetic mounted merchant"]').trigger('click')
    await clickButton(wrapper, '← Back to results')
    release(row)
    await flushPromises()
    expect(wrapper.find('[name="merchantName"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="catalogue-detail-heading"]').exists()).toBe(false)
  } finally {
    wrapper.unmount()
  }
})

it('keeps unknown-result locks after closing and reopening the inspector', async () => {
  const { default: Panel } = await import('@web/modules/admin-catalogue/CataloguePanel.vue')
  rest.patchMerchant.mockRejectedValueOnce(new Error('Synthetic unknown result'))
  const wrapper = mount(Panel)
  try {
    await flushPromises()
    await wrapper.get('[data-open-row="Synthetic mounted merchant"]').trigger('click')
    await flushPromises()
    await wrapper.get('[name="merchantName"]').setValue('Corrected name')
    await wrapper.get('[name="note"]').setValue('Reviewed correction')
    await wrapper.get('[name="confirmed"]').setValue(true)
    await wrapper.get('form:has([name="merchantName"])').trigger('submit')
    await flushPromises()
    await clickButton(wrapper, '← Back to results')
    await wrapper.get('[data-open-row="Synthetic mounted merchant"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('outcome could not be confirmed')
    expect(rest.patchMerchant).toHaveBeenCalledTimes(1)
  } finally {
    wrapper.unmount()
  }
})
