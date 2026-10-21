import type { DealPin } from '@broke-oclock/contracts/deals'
import { mount, RouterLinkStub } from '@vue/test-utils'
import DealOutlets from '@web/modules/browse-map/DealOutlets.vue'
import { KOPI } from '@web-tests/support/shell-fixtures'
import { describe, expect, it } from 'vitest'

// Seven outlets in a line going east from the visitor, listed farthest first.
const OUTLETS = Array.from({ length: 7 }, (_, index) => ({
  id: `outlet-${6 - index}`,
  name: `Outlet ${6 - index}`,
  lat: 1.3,
  lng: 103.8 + (6 - index) * 0.01,
}))
const CHAIN: DealPin = { ...KOPI, venues: OUTLETS }
const HERE = { lat: 1.3, lng: 103.8 }

const mountOutlets = (props: { deal?: DealPin; currentVenueId?: string; position?: typeof HERE | null }) =>
  mount(DealOutlets, {
    props: {
      deal: props.deal ?? CHAIN,
      currentVenueId: props.currentVenueId ?? 'outlet-0',
      position: props.position === undefined ? HERE : props.position,
      to: (venueId: string) => `/deals/${CHAIN.id}?at=${venueId}`,
    },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })

const names = (wrapper: ReturnType<typeof mountOutlets>) =>
  wrapper.findAll('.deal-outlets__name').map((name) => name.text())

describe('DealOutlets', () => {
  it('lists the nearest five, nearest first, and expands to all', async () => {
    const wrapper = mountOutlets({})
    expect(names(wrapper)).toEqual(['Outlet 0', 'Outlet 1', 'Outlet 2', 'Outlet 3', 'Outlet 4'])
    expect(wrapper.text()).toContain('Outlets near you')

    await wrapper.get('[data-testid="deal-outlets-more"]').trigger('click')
    expect(names(wrapper)).toHaveLength(7)
    expect(wrapper.find('[data-testid="deal-outlets-more"]').exists()).toBe(false)
  })

  it('keeps the outlet being viewed in the short list and marks it', () => {
    const wrapper = mountOutlets({ currentVenueId: 'outlet-6' })
    expect(names(wrapper)).toEqual(['Outlet 0', 'Outlet 1', 'Outlet 2', 'Outlet 3', 'Outlet 6'])
    const current = wrapper.get('[aria-current="location"]')
    expect(current.text()).toContain('Outlet 6')
    expect(current.findComponent(RouterLinkStub).props('to')).toBe(`/deals/${CHAIN.id}?at=outlet-6`)
  })

  it('keeps the API order without a position and hides for a single outlet', () => {
    expect(names(mountOutlets({ position: null }))[0]).toBe('Outlet 6')
    const single = mountOutlets({ deal: { ...KOPI, venues: [OUTLETS[0]!] } })
    expect(single.find('[data-testid="deal-outlets"]').exists()).toBe(false)
  })
})
