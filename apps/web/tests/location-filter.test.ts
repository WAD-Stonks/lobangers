import { mount } from '@vue/test-utils'
import LocationFilter from '@web/modules/browse-map/LocationFilter.vue'
import { locationLabel, matchesLocation } from '@web/modules/browse-map/location-filter'
import { defined } from '@web-tests/support/defined'
import { describe, expect, it } from 'vitest'

describe('location selection', () => {
  it('matches regions and towns by coordinates even if the venue name omits its town', () => {
    const north = { name: 'Cafe', lat: 1.436, lng: 103.786 }
    const east = { name: 'Cafe', lat: 1.324, lng: 103.93 }
    expect(matchesLocation(north, 'region:North')).toBe(true)
    expect(matchesLocation(east, 'region:North')).toBe(false)
    expect(matchesLocation(east, 'town:Bedok')).toBe(true)
    expect(matchesLocation(north, 'town:Bedok')).toBe(false)
    expect(matchesLocation({ name: 'Cafe', lat: 1.249, lng: 103.83 }, 'region:South')).toBe(true)
    expect(locationLabel('town:Bedok')).toBe('Bedok')
  })

  it('lets visitors choose a region or search and select a town', async () => {
    const wrapper = mount(LocationFilter, { props: { modelValue: '' } })
    await defined(wrapper.findAll('button').find((button) => button.text() === 'North')).trigger(
      'click',
    )
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['region:North'])
    await wrapper.get('input').setValue('bedok')
    expect(wrapper.findAll('.location-filter__towns button')).toHaveLength(1)
    await wrapper.get('.location-filter__towns button').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual(['town:Bedok'])
    await wrapper.setProps({ modelValue: 'town:Bedok' })
    expect(wrapper.get('.location-filter__towns button').attributes('aria-pressed')).toBe('true')
    await defined(wrapper.findAll('button').find((button) => button.text() === 'Anywhere')).trigger(
      'click',
    )
    expect(wrapper.emitted('update:modelValue')?.[2]).toEqual([''])
  })
})
