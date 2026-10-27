import type { DealPin } from '@broke-oclock/contracts/deals'
import { mount, RouterLinkStub } from '@vue/test-utils'
import DealRowList from '@web/modules/browse-map/DealRowList.vue'
import { expect, it } from 'vitest'

it('shows the public imported thumbnail on browse and venue rows without changing deal selection', async () => {
  const venue = { id: '222222222222222222222222', name: 'Synthetic outlet', lat: 1.32, lng: 103.93 }
  const deal: DealPin = {
    id: '111111111111111111111111',
    title: 'Synthetic offer',
    description: 'Synthetic',
    category: 'FOOD',
    cuisine: null,
    images: [],
    label: 'Offer',
    offerType: 'OTHER',
    priceMinor: null,
    discountPercent: null,
    terms: null,
    validUntil: null,
    rawValidityText: null,
    votes: { alive: 0, dead: 0 },
    commentCount: 0,
    venues: [venue],
    imageUrl: 'https://media.example.test/poster.jpg',
    imageAltText: 'Synthetic offer poster',
  }
  const wrapper = mount(DealRowList, {
    props: {
      rows: [
        {
          key: 'synthetic',
          deal,
          venue: { ...venue, deals: [deal] },
          distanceMetres: 400,
          outletCount: 1,
        },
      ],
      to: () => `/deals/${deal.id}?at=${venue.id}`,
      currentKey: 'synthetic',
    },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  expect(wrapper.get('img').attributes('src')).toBe(deal.imageUrl)
  expect(wrapper.get('img').attributes('alt')).toBe(deal.imageAltText)
  expect(wrapper.getComponent(RouterLinkStub).props('to')).toBe(`/deals/${deal.id}?at=${venue.id}`)
  expect(wrapper.get('a').attributes('aria-current')).toBe('true')
  expect(wrapper.text()).toContain('min')
  await wrapper.get('a').trigger('focus')
  expect(wrapper.emitted('hover')).toEqual([[venue.id]])
  await wrapper.get('a').trigger('blur')
  expect(wrapper.emitted('hover')?.at(-1)).toEqual([null])
  expect(wrapper.get('img').attributes('referrerpolicy')).toBe('no-referrer')
  await wrapper.get('img').trigger('error')
  expect(wrapper.find('img').exists()).toBe(false)
  expect(wrapper.text()).toContain('Image unavailable')
  wrapper.unmount()
})
