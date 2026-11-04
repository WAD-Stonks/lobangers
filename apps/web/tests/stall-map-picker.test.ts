import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import StallMapPicker from '@web/modules/add-deal/StallMapPicker.vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ searchPlaces: vi.fn(), addStallFromPlace: vi.fn() }))

vi.mock('@web/modules/add-deal/add-deal-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@web/modules/add-deal/add-deal-api')>()),
  searchPlaces: api.searchPlaces,
  addStallFromPlace: api.addStallFromPlace,
}))

enableAutoUnmount(afterEach)

const listedStall = {
  id: 'a'.repeat(24),
  name: 'Synthetic Kopi Bedok',
  merchantName: 'Synthetic Kopi',
  address: '1 Synthetic Rd',
}
const newPlace = {
  placeId: 'SyntheticPlace_New',
  name: 'Synthetic Noodle House',
  address: '2 Synthetic Rd, Singapore 000002',
  latitude: 1.3,
  longitude: 103.85,
  stall: null,
}
const listedPlace = {
  ...newPlace,
  placeId: 'SyntheticPlace_Old',
  name: listedStall.name,
  stall: listedStall,
}

beforeEach(() => {
  api.searchPlaces.mockResolvedValue([newPlace, listedPlace])
})
afterEach(() => {
  vi.clearAllMocks()
})

const mountPicker = (props = {}) =>
  mount(StallMapPicker, {
    attachTo: document.body,
    props: { initialSearch: 'synthetic', chosenIds: [], ...props },
  })
const placeButton = (wrapper: ReturnType<typeof mountPicker>, name: string) => {
  const button = wrapper.findAll('.stall-map__place').find((row) => row.text().includes(name))
  if (!button) throw new Error(`No place ${name}`)
  return button
}

describe('stall map picker', () => {
  it('searches straight away with what was typed, and lists every place found', async () => {
    const wrapper = mountPicker()
    await flushPromises()
    expect(api.searchPlaces).toHaveBeenCalledWith('synthetic')
    expect(wrapper.findAll('.stall-map__place')).toHaveLength(2)
    expect(placeButton(wrapper, listedStall.name).text()).toContain('Listed')
  })

  it('adds a new place under its Google Maps name, without asking for one', async () => {
    api.addStallFromPlace.mockResolvedValue({ ...listedStall, id: 'b'.repeat(24) })
    const wrapper = mountPicker()
    await flushPromises()
    await placeButton(wrapper, newPlace.name).trigger('click')
    expect(wrapper.find('input[type="text"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Confirm shop name')

    await wrapper.get('.stall-map__confirm .lb-btn').trigger('click')
    await flushPromises()
    expect(api.addStallFromPlace).toHaveBeenCalledWith(newPlace.placeId, newPlace.name)
    expect(wrapper.emitted('add')?.[0]).toEqual([{ ...listedStall, id: 'b'.repeat(24) }])
    expect(wrapper.find('.stall-map__confirm').exists()).toBe(true)

    await wrapper.setProps({ chosenIds: ['b'.repeat(24)] })
    expect(placeButton(wrapper, newPlace.name).text()).toContain('Already added')
  })

  it('reuses a listed stall without adding it again', async () => {
    const wrapper = mountPicker()
    await flushPromises()
    await placeButton(wrapper, listedStall.name).trigger('click')
    await wrapper.get('.stall-map__confirm .lb-btn').trigger('click')
    expect(api.addStallFromPlace).not.toHaveBeenCalled()
    expect(wrapper.emitted('add')?.[0]).toEqual([listedStall])
  })

  it('asks for more letters, and explains a failed search', async () => {
    const wrapper = mountPicker({ initialSearch: '' })
    await wrapper.get('#place-search').setValue('x')
    await wrapper.get('#place-search').trigger('keydown.enter')
    expect(wrapper.text()).toContain('Type at least 2 letters')
    expect(api.searchPlaces).not.toHaveBeenCalled()

    api.searchPlaces.mockRejectedValue(new Error('offline'))
    await wrapper.get('#place-search').setValue('synthetic')
    await wrapper.get('#place-search').trigger('keydown.enter')
    await flushPromises()
    expect(wrapper.text()).toContain('Could not search the map. Please try again.')
  })

  it('will not add a listed stall that is already on the deal', async () => {
    const wrapper = mountPicker({ chosenIds: [listedStall.id] })
    await flushPromises()
    expect(placeButton(wrapper, listedStall.name).text()).toContain('Already added')
    await placeButton(wrapper, listedStall.name).trigger('click')
    const button = wrapper.get('.stall-map__confirm .lb-btn')
    expect(button.text()).toBe('Already added')
    expect(button.attributes('disabled')).toBeDefined()
    await button.trigger('click')
    expect(wrapper.emitted('add')).toBeUndefined()
  })
})
