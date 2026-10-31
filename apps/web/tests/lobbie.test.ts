import type { AssistantChatBody, AssistantChatResponse } from '@broke-oclock/contracts/assistant'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { filterTokens } from '@web/modules/lobbie/filter-labels'
import { createLobbieChat, LOBBIE_GREETING } from '@web/modules/lobbie/use-lobbie-chat'
import {
  DEALS_RESPONSE,
  HAWKER_VENUE,
  KOPI,
  KOPI_VENUE,
  mountShell,
  NOODLES,
  RICE,
  SIGNED_OUT,
} from '@web-tests/support/shell-fixtures'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const rest = vi.hoisted(() => ({ list: vi.fn(), chat: vi.fn(), bookmarks: vi.fn() }))
vi.mock('@web/lib/api-client', () => ({
  ApiClientError: class ApiClientError extends Error {
    constructor(readonly code: string) {
      super(code)
    }
  },
  api: {
    deals: { list: rest.list },
    assistant: { chat: rest.chat },
    account: { bookmarks: rest.bookmarks },
  },
}))
vi.mock('@web/lib/auth-client', () => ({
  authClient: {
    useSession: () => ref(SIGNED_OUT),
    getSession: async () => ({ data: null }),
    signOut: vi.fn(),
  },
}))

const NO_FILTERS = {
  maxPriceMinor: 0,
  endingToday: false,
  maxWalkMinutes: 0,
  categories: [],
  cuisines: [],
}
const reply = (overrides: Partial<AssistantChatResponse> = {}): AssistantChatResponse => ({
  reply: 'Shiok, here are some lobangs!',
  deals: [],
  filters: NO_FILTERS,
  ...overrides,
})

// A promise the test resolves by hand, to look at the chat while Lobbie is "typing".
const deferred = <T>() => {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('filterTokens', () => {
  it('lists each active filter with the filters left once it is removed', () => {
    expect(filterTokens(NO_FILTERS)).toEqual([])
    const active = {
      maxPriceMinor: 450,
      endingToday: true,
      maxWalkMinutes: 15,
      categories: ['DRINKS' as const, 'DESSERT' as const],
      cuisines: ['JAPANESE' as const],
    }
    const tokens = filterTokens(active)
    expect(tokens.map((token) => token.label)).toEqual([
      'Up to $4.50',
      'Ending today',
      'Within 15 min walk',
      'Drinks',
      'Dessert',
      'Japanese',
    ])
    expect(tokens[0]?.next).toEqual({ ...active, maxPriceMinor: 0 })
    expect(tokens[3]?.next.categories).toEqual(['DESSERT'])
    expect(tokens[5]?.next.cuisines).toEqual([])
  })
})

describe('createLobbieChat', () => {
  it('opens with the greeting and sends only real turns, with the visitor position', async () => {
    const send = vi.fn(async (_body: AssistantChatBody) => reply({ deals: [KOPI] }))
    const position = ref({ lat: 1.2966, lng: 103.8502 })
    const chat = createLobbieChat({ position, send })
    expect(chat.entries.value).toEqual([
      expect.objectContaining({ role: 'assistant', text: LOBBIE_GREETING }),
    ])

    const asked = chat.ask('  Cheap eats near me  ')
    expect(chat.pending.value).toBe(true)
    // A second question while Lobbie is typing is ignored.
    await chat.ask('and another')
    await asked
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({
      messages: [{ role: 'user', text: 'Cheap eats near me' }],
      position: { lat: 1.2966, lng: 103.8502 },
      filters: NO_FILTERS,
    })
    expect(chat.pending.value).toBe(false)
    expect(chat.entries.value.map((entry) => entry.role)).toEqual([
      'assistant',
      'user',
      'assistant',
    ])

    await chat.ask('Anything cheaper?')
    expect(send.mock.calls[1]?.[0].messages).toEqual([
      { role: 'user', text: 'Cheap eats near me' },
      { role: 'assistant', text: 'Shiok, here are some lobangs!' },
      { role: 'user', text: 'Anything cheaper?' },
    ])
  })

  it('shows friendly errors, which are never sent back as history', async () => {
    const { ApiClientError } = await import('@web/lib/api-client')
    const send = vi
      .fn()
      .mockRejectedValueOnce(
        new (ApiClientError as unknown as new (code: string) => Error)('TOO_MANY_REQUESTS'),
      )
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(reply())
    const chat = createLobbieChat({ position: ref(null), send })

    await chat.ask('one')
    await chat.ask('two')
    const [busy, failed] = chat.entries.value.filter(
      (entry) => entry.role === 'assistant' && entry.failed,
    )
    expect(busy?.text).toContain('My claws are full')
    expect(failed?.text).toContain("couldn't fetch deals")

    await chat.ask('three')
    expect(send.mock.calls[2]?.[0].messages).toEqual([
      { role: 'user', text: 'one' },
      { role: 'user', text: 'two' },
      { role: 'user', text: 'three' },
    ])
  })

  it('pins each pick at its nearest outlet, sharing a pin when two picks share an outlet', async () => {
    const chat = createLobbieChat({
      position: ref({ lat: HAWKER_VENUE.lat, lng: HAWKER_VENUE.lng }),
      send: async () => reply({ deals: [NOODLES, KOPI, RICE] }),
    })
    expect(chat.resultPins.value).toEqual([])
    await chat.ask('lunch')
    expect(chat.rowsFor([NOODLES, KOPI, RICE]).map((row) => row.deal.id)).toEqual([
      NOODLES.id,
      KOPI.id,
      RICE.id,
    ])
    expect(chat.resultPins.value.map((pin) => [pin.id, pin.deals.map((deal) => deal.id)])).toEqual([
      [HAWKER_VENUE.id, [NOODLES.id, RICE.id]],
      [KOPI_VENUE.id, [KOPI.id]],
    ])
  })

  it('carries filters between questions, and removing or clearing them sticks', async () => {
    const UNDER_FIVE_DRINKS = { ...NO_FILTERS, maxPriceMinor: 500, categories: ['DRINKS' as const] }
    const send = vi
      .fn(async (_body: AssistantChatBody) => reply())
      .mockResolvedValueOnce(reply({ filters: UNDER_FIVE_DRINKS }))
      .mockResolvedValueOnce(reply({ filters: UNDER_FIVE_DRINKS }))
    const chat = createLobbieChat({ position: ref(null), send })

    await chat.ask('drinks under $5')
    expect(chat.activeFilters.value).toEqual(UNDER_FIVE_DRINKS)
    await chat.ask('near Bugis?')
    expect(send.mock.calls[1]?.[0].filters).toEqual(UNDER_FIVE_DRINKS)

    const [price] = filterTokens(chat.activeFilters.value)
    if (!price) throw new Error('expected a price token')
    chat.removeFilter(price)
    expect(chat.activeFilters.value).toEqual({ ...NO_FILTERS, categories: ['DRINKS'] })
    expect(chat.entries.value.at(-1)).toMatchObject({ role: 'notice', text: 'Removed “Up to $5”' })
    await chat.ask('anything else?')
    expect(send.mock.calls[2]?.[0]).toMatchObject({
      filters: { ...NO_FILTERS, categories: ['DRINKS'] },
      messages: [
        { role: 'user', text: 'drinks under $5' },
        { role: 'assistant', text: 'Shiok, here are some lobangs!' },
        { role: 'user', text: 'near Bugis?' },
        { role: 'assistant', text: 'Shiok, here are some lobangs!' },
        { role: 'user', text: 'anything else?' },
      ],
    })

    // Clearing all also starts Lobbie's memory afresh; the chat on screen stays.
    chat.clearFilters()
    expect(chat.activeFilters.value).toEqual(NO_FILTERS)
    await chat.ask('dessert?')
    expect(send.mock.calls[3]?.[0]).toMatchObject({
      filters: NO_FILTERS,
      messages: [{ role: 'user', text: 'dessert?' }],
    })
    expect(chat.entries.value.filter((entry) => entry.role === 'user')).toHaveLength(4)
  })
})

describe('Ask Lobbie panel', () => {
  let mounted: VueWrapper[] = []
  const mountAt = async (path: string) => {
    const result = await mountShell(path)
    mounted.push(result.wrapper)
    return result
  }
  const map = (wrapper: VueWrapper) => wrapper.findComponent({ name: 'DealMap' })

  beforeEach(() => {
    rest.list.mockReset().mockResolvedValue(DEALS_RESPONSE)
    rest.chat.mockReset()
    rest.bookmarks.mockReset().mockResolvedValue({ items: [], nextCursor: null })
  })
  afterEach(() => {
    for (const wrapper of mounted) wrapper.unmount()
    mounted = []
  })

  it('opens from the chip beside All filters, and the chip closes it again', async () => {
    const { router, wrapper } = await mountAt(
      '/browse?max=500&when=today&cat=DRINKS&q=kopi&sort=ending',
    )
    const chip = wrapper.get('[data-testid="ask-lobbie"]')
    expect(chip.text()).toBe('Ask Lobbie for Lobangs')
    expect(chip.element.previousElementSibling?.getAttribute('data-testid')).toBe('all-filters')
    // The sparkle is one path; the cross shown while the chat is open is two strokes.
    const iconPaths = () => wrapper.findAll('[data-testid="ask-lobbie"] svg path').length
    expect(iconPaths()).toBe(1)

    await chip.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('lobbie')
    // The chips and the filter sheet are cleared; the search text and sort stay.
    expect(router.currentRoute.value.query).toEqual({ q: 'kopi', sort: 'ending' })
    const chipPressed = (label: string) =>
      wrapper
        .findAll('[data-testid="quick-chips"] button')
        .find((button) => button.text().includes(label))
        ?.attributes('aria-pressed')
    expect(chipPressed('Under $5')).toBe('false')
    expect(chipPressed('Ending today')).toBe('false')
    expect(wrapper.find('[data-testid="filter-badge"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="ask-lobbie"]').attributes('aria-expanded')).toBe('true')
    expect(iconPaths()).toBe(2)
    expect(wrapper.get('[data-testid="lobbie-message"]').text()).toContain(LOBBIE_GREETING)
    expect(
      wrapper.findAll('[data-testid="lobbie-suggestion"]').map((button) => button.text()),
    ).toEqual(['Cheap eats near me', 'Lunch under $5', 'Deals ending today'])

    await wrapper.get('[data-testid="ask-lobbie"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('browse')
    expect(iconPaths()).toBe(1)
  })

  it('asks a suggestion, shows typing with the box disabled, then lists and frames the deals', async () => {
    const answer = deferred<AssistantChatResponse>()
    rest.chat.mockReturnValue(answer.promise)
    const { router, wrapper } = await mountAt('/ask-lobbie')
    expect(map(wrapper).props('framed')).toBe(false)

    await wrapper.findAll('[data-testid="lobbie-suggestion"]')[1]?.trigger('click')
    await flushPromises()
    expect(rest.chat).toHaveBeenCalledWith({
      messages: [{ role: 'user', text: 'Lunch under $5' }],
      position: null,
      filters: NO_FILTERS,
    })
    const messages = wrapper.findAll('[data-testid="lobbie-message"]')
    expect(messages.at(-1)?.text()).toContain('Lunch under $5')
    expect(messages.at(-1)?.classes()).toContain('lobbie__entry--user')
    expect(wrapper.find('[data-testid="lobbie-suggestion"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="lobbie-typing"]').text()).toContain('Lobbie is typing')
    expect(wrapper.get('[data-testid="lobbie-input"]').attributes('disabled')).toBeDefined()

    answer.resolve(reply({ deals: [RICE], filters: { ...NO_FILTERS, maxPriceMinor: 500 } }))
    await flushPromises()
    expect(wrapper.find('[data-testid="lobbie-typing"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="lobbie-input"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).toContain('Shiok, here are some lobangs!')
    expect(wrapper.text()).toContain('Up to $5')
    expect(
      wrapper
        .findAll('[data-testid="lobbie-deals"] .deal-rows__title')
        .map((title) => title.text()),
    ).toEqual([RICE.title])
    expect(map(wrapper).props('framed')).toBe(true)
    expect(map(wrapper).props('pins')).toEqual([expect.objectContaining({ id: HAWKER_VENUE.id })])

    // A deal opened from the chat comes back to the chat, which kept the conversation.
    await wrapper.get('[data-testid="lobbie-deals"] a').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('deal')
    expect(map(wrapper).props('framed')).toBe(false)
    expect(wrapper.get('.panel-frame__back').text()).toBe('Back to Lobbie')
    await wrapper.get('.panel-frame__back').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('lobbie')
    expect(wrapper.text()).toContain('Lunch under $5')
    expect(map(wrapper).props('framed')).toBe(true)
  })

  it('sends typed questions and keeps the map as it was when Lobbie finds nothing', async () => {
    rest.chat.mockResolvedValue(reply({ reply: 'Aiyo, nothing like that yet.' }))
    const { wrapper } = await mountAt('/ask-lobbie')
    const send = wrapper.get('[data-testid="lobbie-send"]')
    expect(send.attributes('disabled')).toBeDefined()

    await wrapper.get('[data-testid="lobbie-input"]').setValue('vegan ramen in Jurong')
    expect(send.attributes('disabled')).toBeUndefined()
    await wrapper.get('[data-testid="lobbie-composer"]').trigger('submit')
    await flushPromises()
    expect(rest.chat).toHaveBeenCalledWith({
      messages: [{ role: 'user', text: 'vegan ramen in Jurong' }],
      position: null,
      filters: NO_FILTERS,
    })
    expect((wrapper.get('[data-testid="lobbie-input"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.text()).toContain('Aiyo, nothing like that yet.')
    expect(map(wrapper).props('framed')).toBe(false)
    expect(map(wrapper).props('pins')).toHaveLength(2)
  })

  it('shows the active filters above the box, removes one, and clears them all', async () => {
    rest.chat.mockResolvedValue(
      reply({
        deals: [KOPI],
        filters: { ...NO_FILTERS, maxPriceMinor: 500, endingToday: true },
      }),
    )
    const { wrapper } = await mountAt('/ask-lobbie')
    expect(wrapper.find('[data-testid="lobbie-active-filters"]').exists()).toBe(false)

    await wrapper.findAll('[data-testid="lobbie-suggestion"]')[1]?.trigger('click')
    await flushPromises()
    const pills = () =>
      wrapper.findAll('[data-testid="lobbie-active-filters"] button').map((pill) => pill.text())
    expect(pills()).toEqual(['Up to $5', 'Ending today', 'Clear all'])

    await wrapper.get('[aria-label="Remove filter Up to $5"]').trigger('click')
    expect(pills()).toEqual(['Ending today', 'Clear all'])
    expect(wrapper.get('[data-testid="lobbie-notice"]').text()).toBe('Removed “Up to $5”')

    await wrapper.get('[data-testid="lobbie-clear-filters"]').trigger('click')
    expect(wrapper.find('[data-testid="lobbie-active-filters"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="lobbie-notice"]').at(-1)?.text()).toBe(
      'Cleared all filters',
    )
    // Lobbie's last picks stay on the map until the next question.
    expect(map(wrapper).props('framed')).toBe(true)
  })
})
