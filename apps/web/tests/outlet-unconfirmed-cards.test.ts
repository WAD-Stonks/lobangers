import type { DealPin } from '@broke-oclock/contracts/deals'
import { mount, RouterLinkStub } from '@vue/test-utils'
import DealCard from '@web/modules/browse-map/DealCard.vue'
import { OUTLET_NOT_CONFIRMED } from '@web/modules/browse-map/deal-format'
import HotCard from '@web/modules/map-shell/HotCard.vue'
import { describe, expect, it } from 'vitest'

// A guessed outlet must carry its warning on every surface that names it, not only rows and the panel.
const venue = { id: '222222222222222222222222', name: 'Synthetic outlet', lat: 1.32, lng: 103.93 }

const dealWith = (outletUnconfirmed: boolean | undefined): DealPin => ({
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
  ...(outletUnconfirmed === undefined ? {} : { outletUnconfirmed }),
})

const mountCard = (deal: DealPin) =>
  mount(DealCard, {
    props: {
      row: {
        key: 'synthetic',
        deal,
        venue: { ...venue, deals: [deal] },
        distanceMetres: 400,
        outletCount: 1,
      },
      to: `/deals/${deal.id}`,
    },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })

const mountHot = (deal: DealPin) =>
  mount(HotCard, {
    props: {
      deals: [{ deal, venue: { ...venue, deals: [deal] }, distanceMetres: 400 }],
      reducedMotion: true,
    },
  })

describe('list card', () => {
  it('warns when the outlet is a guess', () => {
    const wrapper = mountCard(dealWith(true))
    expect(wrapper.get('[data-testid="outlet-unconfirmed"]').text()).toBe(OUTLET_NOT_CONFIRMED)
    wrapper.unmount()
  })

  it('stays quiet for a confirmed outlet', () => {
    for (const flag of [false, undefined]) {
      const wrapper = mountCard(dealWith(flag))
      expect(wrapper.find('[data-testid="outlet-unconfirmed"]').exists()).toBe(false)
      wrapper.unmount()
    }
  })
})

describe('ending-soon hero', () => {
  it('warns when the outlet is a guess', () => {
    const wrapper = mountHot(dealWith(true))
    expect(wrapper.get('[data-testid="outlet-unconfirmed"]').text()).toBe(OUTLET_NOT_CONFIRMED)
    wrapper.unmount()
  })

  it('stays quiet for a confirmed outlet', () => {
    const wrapper = mountHot(dealWith(false))
    expect(wrapper.find('[data-testid="outlet-unconfirmed"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
