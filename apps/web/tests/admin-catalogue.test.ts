import type { createAdminCatalogueClient } from '@broke-oclock/api-client/admin-catalogue'
import { mount } from '@vue/test-utils'
import { useCatalogue } from '@web/modules/admin-catalogue/use-catalogue'
import { expect, it, vi } from 'vitest'

const id = '0123456789abcdef01234567'
const other = '1123456789abcdef01234567'
const row = {
  id,
  name: 'Synthetic merchant',
  version: 7,
  archived: false,
  venueCount: 2,
  dealCount: 3,
}
const fixture = () => {
  const calls = {
    merchants: vi.fn().mockResolvedValue({ items: [row], nextCursor: null }),
    merchant: vi.fn().mockResolvedValue(row),
    patchMerchant: vi.fn().mockResolvedValue({ id, version: 8 }),
    archiveMerchant: vi.fn().mockResolvedValue({ id, version: 8 }),
    createMerchant: vi.fn().mockResolvedValue({ id, version: 1 }),
  }
  return {
    calls,
    state: useCatalogue(calls as unknown as ReturnType<typeof createAdminCatalogueClient>),
  }
}
it('captures immutable target/version, exact confirmed payload and reloads authoritative detail', async () => {
  const { state, calls } = fixture()
  await state.select('merchants', id)
  await state.write('patch', {
    name: 'Synthetic corrected spelling',
    note: 'Reviewed name correction',
    confirmed: true,
  })
  expect(calls.patchMerchant).toHaveBeenCalledWith(id, {
    name: 'Synthetic corrected spelling',
    note: 'Reviewed name correction',
    confirmed: true,
    expectedVersion: 7,
  })
  expect(calls.merchant).toHaveBeenCalledTimes(2)
})
it('locks stale outcomes through unchanged reload and unlocks only newer exact detail', async () => {
  const { state, calls } = fixture()
  await state.select('merchants', id)
  calls.patchMerchant.mockRejectedValueOnce({ code: 'CONFLICT' })
  await state.write('patch', { name: 'Synthetic correction', note: 'Reviewed', confirmed: true })
  expect(state.locked.value).toBe(true)
  await state.write('archive', { note: 'Must not replay', confirmed: true })
  expect(calls.archiveMerchant).not.toHaveBeenCalled()
  await state.select('merchants', id)
  expect(state.locked.value).toBe(true)
  calls.merchant.mockResolvedValueOnce({ ...row, version: 8 })
  await state.select('merchants', id)
  expect(state.locked.value).toBe(false)
})
it('fences late target reads and synchronously erases sensitive state on close', async () => {
  const { state, calls } = fixture()
  let release!: (value: typeof row) => void
  calls.merchant.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  const pending = state.select('merchants', id)
  calls.merchant.mockResolvedValueOnce({ ...row, id: other })
  await state.select('merchants', other)
  release({ ...row, id })
  await pending
  expect(state.selected.value?.row.id).toBe(other)
  const generation = state.selected.value
  state.close()
  expect(state.selected.value).toBeNull()
  expect(state.items.value).toEqual([])
  expect(generation).not.toBeNull()
})
it('mounted merchant editor sends only reviewed name correction and explicit reason/target confirmation', async () => {
  const { default: MerchantEditor } = await import(
    '@web/modules/admin-catalogue/MerchantEditor.vue'
  )
  const wrapper = mount(MerchantEditor, { props: { merchant: row, disabled: false } })
  await wrapper.get('[name="merchantName"]').setValue('Synthetic corrected spelling')
  await wrapper.get('[name="note"]').setValue('Reviewed spelling against source')
  await wrapper.get('[name="confirmed"]').setValue(true)
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('save')?.[0]).toEqual([
    {
      name: 'Synthetic corrected spelling',
      note: 'Reviewed spelling against source',
      confirmed: true,
    },
  ])
  expect(wrapper.text()).toContain('No merging, rebranding or reparenting')
  wrapper.unmount()
})

it('binds catalogue locks to kind and target and preserves captured outlet-create parent context', async () => {
  const calls = {
    merchant: vi.fn().mockImplementation(async (target: string) => ({ ...row, id: target })),
    venue: vi.fn().mockResolvedValue({ ...row, parentArchived: false }),
    patchMerchant: vi.fn().mockRejectedValue(new Error('Unknown merchant write')),
    createVenue: vi.fn().mockRejectedValue(new Error('Unknown outlet creation')),
  }
  const state = useCatalogue(calls as unknown as ReturnType<typeof createAdminCatalogueClient>)
  await state.select('merchants', id)
  await state.write('patch', { name: 'Correction', note: 'Reviewed', confirmed: true })
  await state.select('merchants', other)
  expect(state.locked.value).toBe(false)
  await state.select('venues', id)
  expect(state.locked.value).toBe(false)
  await state.select('merchants', id)
  expect(state.locked.value).toBe(true)
  state.start(row)
  await state.write('create', {
    name: 'Uncertain outlet',
    address: '1 Synthetic Road',
    postalCode: '123456',
    area: 'Synthetic',
    latitude: 1.3,
    longitude: 103.8,
    geographyPrecision: 'PROPERTY',
    catalogueKey: 'Synthetic key',
    note: 'Reviewed bounded creation',
    confirmed: true,
  })
  expect(calls.createVenue).toHaveBeenCalledWith(
    expect.objectContaining({ merchantId: id, expectedMerchantVersion: 7 }),
  )
  state.start({ ...row, id: other })
  expect(state.locked.value).toBe(false)
  state.start({ ...row, version: 8 })
  expect(state.locked.value).toBe(true)
  expect(state.message.value).toContain('audit')
  state.close()
  state.start(row)
  expect(state.locked.value).toBe(false)
  state.dispose()
})
