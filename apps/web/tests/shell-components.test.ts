import { flushPromises, mount } from '@vue/test-utils'
import { createDefaultFilters } from '@web/modules/browse-map/filters'
import FilterSheet from '@web/modules/map-shell/FilterSheet.vue'
import HotCard from '@web/modules/map-shell/HotCard.vue'
import MapControls from '@web/modules/map-shell/MapControls.vue'
import QuickChips from '@web/modules/map-shell/QuickChips.vue'
import ShellPanel from '@web/modules/map-shell/ShellPanel.vue'
import { HAWKER_VENUE, KOPI, KOPI_VENUE, NOODLES } from '@web-tests/support/shell-fixtures'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('QuickChips', () => {
  it('toggles each chip with aria-pressed and emits new filters', async () => {
    const filters = createDefaultFilters()
    const wrapper = mount(QuickChips, { props: { filters } })
    const [underFive, ending] = wrapper.findAll('button')
    expect(underFive?.attributes('aria-pressed')).toBe('false')
    await underFive?.trigger('click')
    await ending?.trigger('click')
    const emitted = wrapper.emitted('apply') ?? []
    expect(emitted[0]?.[0]).toMatchObject({ priceMaxMinor: 500 })
    expect(emitted[1]?.[0]).toMatchObject({ ending: 'today' })
    expect(filters).toEqual(createDefaultFilters())

    await wrapper.setProps({ filters: { ...filters, priceMaxMinor: 500 } })
    expect(wrapper.findAll('button')[0]?.attributes('aria-pressed')).toBe('true')
    await wrapper.findAll('button')[0]?.trigger('click')
    expect(wrapper.emitted('apply')?.[2]?.[0]).toMatchObject({ priceMaxMinor: null })
  })

  it('badges All filters only with filters the chips do not cover', async () => {
    const wrapper = mount(QuickChips, {
      props: {
        filters: { ...createDefaultFilters(), priceMaxMinor: 500, categories: ['FOOD', 'DRINKS'] },
      },
    })
    expect(wrapper.get('[data-testid="filter-badge"]').text()).toBe('2 active')
    await wrapper.setProps({ filters: { ...createDefaultFilters(), priceMaxMinor: 500 } })
    expect(wrapper.find('[data-testid="filter-badge"]').exists()).toBe(false)
    await wrapper.get('[data-testid="all-filters"]').trigger('click')
    expect(wrapper.emitted('openSheet')).toHaveLength(1)
  })
})

describe('MapControls', () => {
  it('switches the toggle label with the view', async () => {
    const wrapper = mount(MapControls, { props: { view: 'map' } })
    expect(wrapper.get('[data-testid="panel-toggle"]').attributes('aria-label')).toBe('Show list')
    await wrapper.setProps({ view: 'list' })
    expect(wrapper.get('[data-testid="panel-toggle"]').attributes('aria-label')).toBe('Show map')
  })

  it('disables Near me while locating', async () => {
    const wrapper = mount(MapControls, { props: { view: 'map', locating: true } })
    expect(wrapper.get('[data-testid="near-me"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="near-me"]').attributes('aria-label')).toBe(
      'Finding your location',
    )
  })

  it('leaves zoom out on phones and emits each control', async () => {
    const phone = mount(MapControls, { props: { view: 'map', showZoom: false } })
    expect(phone.find('[aria-label="Zoom in"]').exists()).toBe(false)
    const desktop = mount(MapControls, { props: { view: 'map' } })
    await desktop.get('[aria-label="Zoom in"]').trigger('click')
    await desktop.get('[aria-label="Zoom out"]').trigger('click')
    await desktop.get('[data-testid="near-me"]').trigger('click')
    expect(desktop.emitted('zoomIn')).toHaveLength(1)
    expect(desktop.emitted('zoomOut')).toHaveLength(1)
    expect(desktop.emitted('nearMe')).toHaveLength(1)
  })
})

describe('HotCard', () => {
  const deals = [
    { deal: NOODLES, venue: { ...HAWKER_VENUE, deals: [NOODLES] }, distanceMetres: null },
    { deal: KOPI, venue: { ...KOPI_VENUE, deals: [KOPI] }, distanceMetres: null },
  ]

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('moves with the dots and stops with the pause button', async () => {
    const wrapper = mount(HotCard, { props: { deals } })
    expect(wrapper.get('[data-testid="hot-position"]').text()).toBe('1 of 2')
    await wrapper.findAll('.hot-hero__dot')[1]?.trigger('click')
    expect(wrapper.get('[data-testid="hot-position"]').text()).toBe('2 of 2')

    await wrapper.get('[data-testid="hot-pause"]').trigger('click')
    expect(wrapper.get('[data-testid="hot-pause"]').attributes('aria-label')).toBe(
      'Play ending-soon deals',
    )
    await vi.advanceTimersByTimeAsync(10_000)
    expect(wrapper.get('[data-testid="hot-position"]').text()).toBe('2 of 2')
  })

  it("tints the hero with the shown deal's category and shows its 3D food", async () => {
    const wrapper = mount(HotCard, { props: { deals } })
    expect(wrapper.get('[data-testid="hot-card"]').attributes('style')).toContain('--tint-')
    expect(wrapper.find('.hot-hero__food .food-sprite').exists()).toBe(true)
    await wrapper.get('.hot-hero__food').trigger('click')
    expect(wrapper.emitted('open')?.[0]?.[0]).toMatchObject({ deal: { id: NOODLES.id } })
  })

  it('opens the shown deal', async () => {
    const wrapper = mount(HotCard, { props: { deals } })
    await wrapper.get('[data-testid="hot-open"]').trigger('click')
    expect(wrapper.emitted('open')?.[0]?.[0]).toMatchObject({ deal: { id: NOODLES.id } })
  })

  it('drops the pause button and progress bar with reduced motion', () => {
    const wrapper = mount(HotCard, { props: { deals, reducedMotion: true } })
    expect(wrapper.find('[data-testid="hot-pause"]').exists()).toBe(false)
    expect(wrapper.find('.hot-hero__bar').exists()).toBe(false)
  })
})

describe('FilterSheet', () => {
  const props = {
    open: false,
    breakpoint: 'tablet' as const,
    filters: createDefaultFilters(),
    categories: ['FOOD', 'DRINKS'],
    cuisines: ['JAPANESE' as const],
    countFor: () => 7,
    locationKnown: false,
  }

  it('is a modal dialog on tablet and phone, and a popover on desktop', async () => {
    const wrapper = mount(FilterSheet, { props: { ...props, open: true }, attachTo: document.body })
    expect(wrapper.get('[role="dialog"]').attributes('aria-modal')).toBe('true')
    await wrapper.setProps({ breakpoint: 'desktop' })
    expect(wrapper.get('[role="dialog"]').attributes('aria-modal')).toBeUndefined()
    wrapper.unmount()
  })

  it('traps Tab inside on tablet', async () => {
    const wrapper = mount(FilterSheet, { props, attachTo: document.body })
    await wrapper.setProps({ open: true })
    await flushPromises()
    const buttons = wrapper.findAll('button')
    const first = buttons[0]?.element as HTMLElement
    const last = buttons.at(-1)?.element as HTMLElement
    expect(document.activeElement).toBe(first)
    last.focus()
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(first)
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
    wrapper.unmount()
  })

  it('shows the live count, adds one history entry per session, and clears to defaults', async () => {
    const wrapper = mount(FilterSheet, { props })
    await wrapper.setProps({
      open: true,
      filters: { ...createDefaultFilters(), q: 'kopi', walkMinutes: 5 },
    })
    expect(wrapper.get('[data-testid="filter-show"]').text()).toBe('Show 7 deals')
    const food = wrapper.findAll('button').find((button) => button.text().startsWith('Food'))
    await food?.trigger('click')
    await wrapper.get('[data-testid="filter-clear"]').trigger('click')
    const emitted = wrapper.emitted('apply') ?? []
    expect(emitted[0]?.[1]).toBe('push')
    expect(emitted[1]?.[1]).toBe('replace')
    expect(emitted[1]?.[0]).toEqual({ ...createDefaultFilters(), q: 'kopi' })
  })

  it('offers the cuisines on the loaded deals and hides the group when there are none', async () => {
    const wrapper = mount(FilterSheet, { props: { ...props, open: true } })
    expect(wrapper.text()).toContain('Cuisine')
    const japanese = wrapper
      .findAll('button')
      .find((button) => button.text().startsWith('Japanese'))
    await japanese?.trigger('click')
    expect(wrapper.emitted('apply')?.[0]?.[0]).toEqual({
      ...createDefaultFilters(),
      cuisines: ['JAPANESE'],
    })
    await wrapper.setProps({ cuisines: [] })
    expect(wrapper.text()).not.toContain('Cuisine')
  })

  it('hides walking distance until the visitor is located', async () => {
    const wrapper = mount(FilterSheet, { props: { ...props, open: true } })
    expect(wrapper.text()).not.toContain('Walking distance')
    await wrapper.setProps({ locationKnown: true })
    expect(wrapper.text()).toContain('Walking distance')
  })
})

describe('ShellPanel', () => {
  const HEIGHTS = [120, 400, 680]

  it('renders a side panel on desktop and a sheet with a handle below', async () => {
    const side = mount(ShellPanel, { props: { mode: 'side' } })
    expect(side.classes()).toContain('shell-panel--side')
    expect(side.find('[data-testid="sheet-handle"]').exists()).toBe(false)
    const sheet = mount(ShellPanel, { props: { mode: 'sheet', heights: HEIGHTS, snap: 1 } })
    expect(sheet.classes()).toContain('shell-panel--sheet')
    expect(sheet.attributes('style')).toContain('translateY(280px)')
  })

  const drag = async (
    wrapper: ReturnType<typeof mount>,
    moves: readonly { y: number; t: number }[],
  ) => {
    const handle = wrapper.get('[data-testid="sheet-handle"]')
    const element = handle.element as HTMLElement
    element.setPointerCapture = vi.fn()
    const [start, ...rest] = moves
    const event = (type: string, y: number, t: number) => {
      const e = new MouseEvent(type, { clientY: y, button: 0, bubbles: true }) as MouseEvent & {
        pointerId: number
      }
      Object.defineProperty(e, 'timeStamp', { value: t })
      Object.defineProperty(e, 'pointerId', { value: 1 })
      element.dispatchEvent(e)
    }
    event('pointerdown', start?.y ?? 0, start?.t ?? 0)
    for (const move of rest) event('pointermove', move.y, move.t)
    const last = moves.at(-1)
    event('pointerup', last?.y ?? 0, last?.t ?? 0)
    await flushPromises()
  }

  it('moves one height on a quick flick', async () => {
    const wrapper = mount(ShellPanel, { props: { mode: 'sheet', heights: HEIGHTS, snap: 0 } })
    await drag(wrapper, [
      { y: 700, t: 0 },
      { y: 690, t: 10 },
      { y: 660, t: 20 },
    ])
    expect(wrapper.emitted('update:snap')?.[0]).toEqual([1])
  })

  it('snaps a slow drag to the nearest height', async () => {
    const wrapper = mount(ShellPanel, { props: { mode: 'sheet', heights: HEIGHTS, snap: 0 } })
    await drag(wrapper, [
      { y: 700, t: 0 },
      { y: 500, t: 2000 },
      { y: 150, t: 6000 },
    ])
    expect(wrapper.emitted('update:snap')?.[0]).toEqual([2])
  })

  it('steps up on a tap and moves with the arrow keys', async () => {
    const wrapper = mount(ShellPanel, { props: { mode: 'sheet', heights: HEIGHTS, snap: 0 } })
    await drag(wrapper, [{ y: 700, t: 0 }])
    expect(wrapper.emitted('update:snap')?.[0]).toEqual([1])
    await wrapper.get('[data-testid="sheet-handle"]').trigger('keydown', { key: 'ArrowUp' })
    expect(wrapper.emitted('update:snap')?.[1]).toEqual([1])
  })
})
