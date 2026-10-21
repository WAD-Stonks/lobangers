import { mount } from '@vue/test-utils'
import TicketLoader from '@web/components/TicketLoader.vue'
import { TICKET_ICON_PATHS } from '@web/components/ticket-icon'
import { describe, expect, it } from 'vitest'

describe('ticket loader', () => {
  it('draws the Lucide ticket outline as a decorative icon', () => {
    const wrapper = mount(TicketLoader)

    const svg = wrapper.get('[data-testid="ticket-loader"] svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('stroke')).toBe('currentColor')
    expect(svg.findAll('path').map((path) => path.attributes('d'))).toEqual(TICKET_ICON_PATHS)
  })

  it('casts a ground shadow under the ticket', () => {
    const wrapper = mount(TicketLoader)

    expect(wrapper.find('.ticket-loader__shadow').exists()).toBe(true)
  })
})
