import type { DealPin } from '@broke-oclock/contracts/deals'
import { flushPromises, mount } from '@vue/test-utils'
import App from '@web/App.vue'
import { authGuard } from '@web/router/guards'
import routes from '@web/router/routes'
import { createMemoryHistory, createRouter } from 'vue-router'

// Synthetic deals for the map-shell tests. Not real outlets or prices.
export const KOPI_VENUE = {
  id: 'a'.repeat(24),
  name: 'Synthetic Kopi Corner',
  lat: 1.2966,
  lng: 103.8502,
}
export const HAWKER_VENUE = {
  id: 'b'.repeat(24),
  name: 'Synthetic Hawker Centre',
  lat: 1.3008,
  lng: 103.8551,
}

export const makeDeal = (overrides: Partial<DealPin>): DealPin => ({
  id: 'c'.repeat(24),
  title: 'Synthetic iced kopi',
  category: 'DRINKS',
  cuisine: null,
  label: '$1.90',
  description: 'Synthetic deal for tests.',
  offerType: 'FIXED_PRICE',
  priceMinor: 190,
  discountPercent: null,
  terms: null,
  validUntil: null,
  rawValidityText: null,
  votes: { alive: 3, dead: 0 },
  commentCount: 0,
  venues: [KOPI_VENUE],
  ...overrides,
})

export const KOPI = makeDeal({})
export const NOODLES = makeDeal({
  id: 'd'.repeat(24),
  title: 'Synthetic noodle set',
  category: 'FOOD',
  label: '$6.50',
  priceMinor: 650,
  validUntil: '2099-01-01T00:00:00.000Z',
  venues: [HAWKER_VENUE],
})
export const RICE = makeDeal({
  id: 'e'.repeat(24),
  title: 'Synthetic chicken rice',
  category: 'FOOD',
  label: '20% off',
  offerType: 'PERCENT_OFF',
  priceMinor: null,
  discountPercent: 20,
  validUntil: '2099-01-02T00:00:00.000Z',
  venues: [HAWKER_VENUE],
})
export const DEALS = [KOPI, NOODLES, RICE]
export const DEALS_RESPONSE = { items: DEALS, categories: ['DRINKS', 'FOOD'] }

export const SIGNED_OUT = { data: null, isPending: false }
export const SIGNED_IN = {
  data: { user: { id: 'f'.repeat(24), name: 'Synthetic Student', role: 'USER' }, session: {} },
  isPending: false,
}

// Mounts the whole app at a path with the real routes. Leaflet needs a layout engine, so the
// map itself is stubbed; the browser suite covers it.
export const mountShell = async (path: string) => {
  const router = createRouter({ history: createMemoryHistory(), routes })
  router.beforeEach(authGuard)
  await router.push(path)
  await router.isReady()
  const wrapper = mount(App, {
    attachTo: document.body,
    global: { plugins: [router], stubs: { DealMap: true, SplashScreen: true } },
  })
  await flushPromises()
  return { router, wrapper }
}
