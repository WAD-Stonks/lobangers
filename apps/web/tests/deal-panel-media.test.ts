import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { KOPI_VENUE, makeDeal, mountShell, SIGNED_OUT } from '@web-tests/support/shell-fixtures'
import { afterEach, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const rest = vi.hoisted(() => ({ list: vi.fn(), bookmarks: vi.fn() }))
vi.mock('@web/lib/api-client', () => ({
  ApiClientError: class ApiClientError extends Error {},
  api: { deals: { list: rest.list }, account: { bookmarks: rest.bookmarks } },
}))
vi.mock('@web/lib/auth-client', () => ({
  authClient: { useSession: () => ref(SIGNED_OUT), getSession: async () => ({ data: null }) },
}))

let wrapper: VueWrapper | undefined
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

// Port of deleted DealDetail's media, facts, community and navigation regressions.
// Real current App/router/panel, synthetic API/session and stubbed layout-only map.
it('shows a guarded legacy poster in the current panel without losing facts, cuisine, reviews or route links', async () => {
  const otherVenue = { ...KOPI_VENUE, id: 'b'.repeat(24), name: 'Synthetic second outlet' }
  const deal = makeDeal({
    cuisine: 'JAPANESE',
    description: 'Synthetic one dollar kopi before 10am.',
    terms: 'Dine-in only',
    validUntil: '2099-12-31T00:00:00.000Z',
    votes: { alive: 3, dead: 1 },
    commentCount: 2,
    imageUrl: 'https://media.example.test/legacy.jpg',
    imageAltText: 'Synthetic legacy poster',
    images: [],
    venues: [KOPI_VENUE, otherVenue],
  })
  const toast = makeDeal({
    id: 'd'.repeat(24),
    title: 'Synthetic toast',
    images: [],
    venues: [KOPI_VENUE],
  })
  rest.list.mockResolvedValue({ items: [deal, toast], categories: ['DRINKS'] })
  rest.bookmarks.mockResolvedValue({ items: [], nextCursor: null })
  const mounted = await mountShell(`/deals/${deal.id}?at=${KOPI_VENUE.id}`)
  wrapper = mounted.wrapper
  const panel = wrapper.get('[data-testid="shell-panel"]')
  expect(panel.get('img').attributes('src')).toBe(deal.imageUrl)
  expect(panel.get('img').attributes('alt')).toBe(deal.imageAltText)
  expect(panel.get('img').attributes('referrerpolicy')).toBe('no-referrer')
  expect(panel.text()).toContain(deal.description)
  expect(panel.text()).toContain('Dine-in only')
  expect(panel.text()).toContain('31 Dec 2099')
  expect(panel.text()).toContain('Japanese')
  expect(panel.text()).toContain('3 of 4 people say it is still on')
  expect(panel.text()).toContain('2 comments')
  expect(panel.get('[data-testid="vote-alive"]').attributes('disabled')).toBeDefined()
  expect(panel.text()).toContain(otherVenue.name)
  const otherDeal = panel.get('[data-testid="same-outlet-rows"] a')
  expect(otherDeal.attributes('href')).toContain(`/deals/${toast.id}`)
  await panel.get('img').trigger('error')
  expect(panel.find('img').exists()).toBe(false)
  expect(panel.find('[data-testid="category-bubble"]').exists()).toBe(true)
  await otherDeal.trigger('click')
  await flushPromises()
  expect(mounted.router.currentRoute.value.params.dealId).toBe(toast.id)
  expect(wrapper.get('[data-testid="shell-panel"]').text()).not.toContain('Dine-in only')
  expect(wrapper.get('[data-testid="shell-panel"]').find('.deal-panel__media img').exists()).toBe(
    false,
  )
  await wrapper.get('.panel-frame__back').trigger('click')
  await flushPromises()
  expect(mounted.router.currentRoute.value.name).toBe('browse')
})

it('keeps a no-photo deal explicit through category art, empty review messaging and hidden empty sections', async () => {
  const deal = makeDeal({ votes: { alive: 0, dead: 0 }, commentCount: 0, terms: null, images: [] })
  rest.list.mockResolvedValue({ items: [deal], categories: ['DRINKS'] })
  rest.bookmarks.mockResolvedValue({ items: [], nextCursor: null })
  const mounted = await mountShell(`/deals/${deal.id}?at=${KOPI_VENUE.id}`)
  wrapper = mounted.wrapper
  const panel = wrapper.get('[data-testid="shell-panel"]')
  expect(panel.find('img').exists()).toBe(false)
  expect(panel.find('[data-testid="category-bubble"]').exists()).toBe(true)
  expect(panel.text()).toContain('No reports yet')
  expect(panel.text()).toContain('No comments yet')
  expect(panel.find('[data-testid="deal-terms"]').exists()).toBe(false)
  expect(panel.find('[data-testid="same-outlet-rows"]').exists()).toBe(false)
  expect(panel.find('[data-testid="deal-outlets"]').exists()).toBe(false)
})
