import type { VenueDealSummary } from '@broke-oclock/contracts/venues'
import { mount } from '@vue/test-utils'
import VenueDealCard from '@web/modules/venues-feed/VenueDealCard.vue'
import { expect, it } from 'vitest'

const deal: VenueDealSummary = {
  id: '111111111111111111111111',
  title: 'Synthetic lunch offer',
  category: 'FOOD',
  offerType: 'OTHER',
  priceMinor: null,
  currency: 'SGD',
  discountPercent: null,
  validUntil: null,
  rawValidityText: null,
  imageUrl: 'https://media.example.test/poster.jpg',
  imageAltText: 'Synthetic lunch poster with terms',
}

it('renders the public imported-image description on venue/feed cards and replaces load failure', async () => {
  const w = mount(VenueDealCard, { props: { deal } })
  expect(w.get('img').attributes('alt')).toBe(deal.imageAltText)
  expect(w.get('img').attributes('loading')).toBe('lazy')
  await w.get('img').trigger('error')
  expect(w.find('img').exists()).toBe(false)
  expect(w.text()).toContain('Image unavailable')
  await w.setProps({ deal: { ...deal, imageUrl: 'javascript:alert(1)', imageAltText: null } })
  expect(w.find('img').exists()).toBe(false)
  expect(w.text()).toContain('No photo')
  await w.setProps({ deal: { ...deal, imageAltText: '  ' } })
  expect(w.get('img').attributes('alt')).toBe(deal.title)
  w.unmount()
})
