import { flushPromises, mount } from '@vue/test-utils'
import { createDefaultFilters } from '@web/modules/browse-map/filters'
import DiscoveryQuickFilters from '@web/modules/map-shell/DiscoveryQuickFilters.vue'
import FilterSheet from '@web/modules/map-shell/FilterSheet.vue'
import MapControls from '@web/modules/map-shell/MapControls.vue'
import QuickChips from '@web/modules/map-shell/QuickChips.vue'
import ShellPanel from '@web/modules/map-shell/ShellPanel.vue'
import { defined } from '@web-tests/support/defined'
import { describe, expect, it, vi } from 'vitest'

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

  it('updates the badge for all selections and hides it when filters are cleared', async () => {
    const wrapper = mount(QuickChips, {
      props: {
        filters: { ...createDefaultFilters(), priceMaxMinor: 500, categories: ['FOOD', 'DRINKS'] },
      },
    })
    expect(wrapper.get('[data-testid="filter-badge"]').text()).toBe('3 active')
    await wrapper.setProps({ filters: { ...createDefaultFilters(), priceMaxMinor: 500 } })
    expect(wrapper.get('[data-testid="filter-badge"]').text()).toBe('1 active')
    await wrapper.setProps({ filters: createDefaultFilters() })
    expect(wrapper.find('[data-testid="filter-badge"]').exists()).toBe(false)
    await wrapper.get('[data-testid="all-filters"]').trigger('click')
    expect(wrapper.emitted('openSheet')).toHaveLength(1)
  })
})

describe('DiscoveryQuickFilters', () => {
  const props = {
    filters: { ...createDefaultFilters(), q: 'lunch', cuisines: ['JAPANESE' as const] },
    categories: ['DRINKS', 'MEALS'],
    cuisines: ['JAPANESE' as const, 'CHINESE' as const],
    countFor: (filters: ReturnType<typeof createDefaultFilters>) =>
      filters.priceMaxMinor === 500 ? 2 : 4,
    locationKnown: false,
    sheetOpen: false,
  }

  it('updates the quick-filter badge as selections are added and removed', async () => {
    const wrapper = mount(DiscoveryQuickFilters, {
      props: { ...props, filters: createDefaultFilters() },
    })
    expect(wrapper.find('[data-testid="filter-badge"]').exists()).toBe(false)
    await wrapper.setProps({
      filters: { ...createDefaultFilters(), priceMaxMinor: 500, ending: 'today' },
    })
    expect(wrapper.get('[data-testid="filter-badge"]').text()).toBe('2 active')
    await wrapper.setProps({ filters: { ...createDefaultFilters(), ending: 'today' } })
    expect(wrapper.get('[data-testid="filter-badge"]').text()).toBe('1 active')
    await wrapper.setProps({ filters: createDefaultFilters() })
    expect(wrapper.find('[data-testid="filter-badge"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('offers categories in the quick bar and applies them without changing other filters', async () => {
    const wrapper = mount(DiscoveryQuickFilters, { props })
    expect(wrapper.find('[data-testid="quick-offer"]').exists()).toBe(false)
    await wrapper.get('[data-testid="quick-category"]').trigger('click')
    const drinks = defined(wrapper.findAll('button').find((button) => button.text() === 'Drinks'))
    await drinks.trigger('click')
    expect(drinks.attributes('aria-pressed')).toBe('true')
    expect(wrapper.emitted('apply')).toBeUndefined()
    await wrapper.get('[data-testid="quick-filter-apply"]').trigger('click')
    const applied = { ...props.filters, categories: ['DRINKS'] }
    expect(wrapper.emitted('apply')?.[0]?.[0]).toEqual(applied)
    await wrapper.setProps({ filters: applied })
    expect(wrapper.get('[data-testid="quick-category"]').text()).toContain('Category · 1')
    await wrapper.get('[data-testid="quick-category"]').trigger('click')
    await defined(wrapper.findAll('button').find((button) => button.text() === 'Clear')).trigger(
      'click',
    )
    expect(wrapper.emitted('apply')?.[1]?.[0]).toEqual({ ...props.filters, categories: [] })
    wrapper.unmount()
  })

  it('previews price edits and applies them while preserving the other filters', async () => {
    const wrapper = mount(DiscoveryQuickFilters, { props })
    await wrapper.get('[data-testid="quick-price"]').trigger('click')
    await wrapper.get('input[type="number"]').setValue('5')
    expect(wrapper.emitted('apply')).toBeUndefined()
    expect(wrapper.get('[data-testid="quick-filter-apply"]').text()).toBe('Show 2 deals')
    await wrapper.get('[data-testid="quick-filter-apply"]').trigger('click')
    expect(wrapper.emitted('apply')?.[0]?.[0]).toEqual({ ...props.filters, priceMaxMinor: 500 })
    expect(wrapper.find('[data-testid="quick-filter-popover"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('discards uncommitted edits on Escape and clears only the open filter', async () => {
    const wrapper = mount(DiscoveryQuickFilters, { props, attachTo: document.body })
    await wrapper.get('[data-testid="quick-cuisine"]').trigger('click')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Chinese')
      ?.trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.emitted('apply')).toBeUndefined()
    expect(document.activeElement).toBe(wrapper.get('[data-testid="quick-cuisine"]').element)
    await wrapper.get('[data-testid="quick-cuisine"]').trigger('click')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Clear')
      ?.trigger('click')
    expect(wrapper.emitted('apply')?.[0]?.[0]).toEqual({ ...props.filters, cuisines: [] })
    expect(wrapper.find('[data-testid="quick-walk"]').exists()).toBe(false)
    await wrapper.setProps({ locationKnown: true })
    expect(wrapper.find('[data-testid="quick-walk"]').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('MapControls', () => {
  it('disables Near me while locating', async () => {
    const wrapper = mount(MapControls, { props: { locating: true } })
    expect(wrapper.get('[data-testid="near-me"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="near-me"]').attributes('aria-label')).toBe(
      'Finding your location',
    )
  })

  it('leaves zoom out on phones and emits each control', async () => {
    const phone = mount(MapControls, { props: { showZoom: false } })
    expect(phone.find('[aria-label="Zoom in"]').exists()).toBe(false)
    const desktop = mount(MapControls, { props: {} })
    await desktop.get('[aria-label="Zoom in"]').trigger('click')
    await desktop.get('[aria-label="Zoom out"]').trigger('click')
    await desktop.get('[data-testid="near-me"]').trigger('click')
    expect(desktop.emitted('zoomIn')).toHaveLength(1)
    expect(desktop.emitted('zoomOut')).toHaveLength(1)
    expect(desktop.emitted('nearMe')).toHaveLength(1)
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

  it('is a modal dialog with a backdrop on every screen size', async () => {
    const wrapper = mount(FilterSheet, { props: { ...props, open: true }, attachTo: document.body })
    expect(wrapper.get('[role="dialog"]').attributes('aria-modal')).toBe('true')
    await wrapper.setProps({ breakpoint: 'desktop' })
    expect(wrapper.get('[role="dialog"]').attributes('aria-modal')).toBe('true')
    await wrapper.get('[data-testid="filter-backdrop"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('plots actual fixed prices and highlights bars as the budget changes', async () => {
    const wrapper = mount(FilterSheet, {
      props: { ...props, open: true, priceValues: [190, 200, 500, 650, 2000] },
    })
    const chart = wrapper.get('[data-testid="price-histogram"]')
    expect(chart.attributes('aria-label')).toBe('Price distribution of 5 fixed-price deals')
    const first = chart.get('[title="Under $2.50: 2 deals"]')
    expect(first.attributes('style')).toContain('height: 100%')
    expect(chart.get('[title="$15+: 1 deal"]').classes()).toContain('is-selected')
    await wrapper.get('#filter-budget').setValue('5')
    expect(chart.get('[title="$5.00–$5.50: 1 deal"]').classes()).toContain('is-selected')
    expect(chart.get('[title="$6.50–$7.00: 1 deal"]').classes()).not.toContain('is-selected')
    expect(chart.get('[title="$15+: 1 deal"]').classes()).not.toContain('is-selected')
    expect(wrapper.get('#filter-budget').attributes('aria-valuetext')).toBe('Up to $5.00')
    wrapper.unmount()
  })

  it.each(['desktop', 'tablet', 'phone'] as const)('traps Tab inside on %s', async (breakpoint) => {
    const wrapper = mount(FilterSheet, { props: { ...props, breakpoint }, attachTo: document.body })
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

  it('keeps selections in draft but applies Clear all immediately with one history entry', async () => {
    const wrapper = mount(FilterSheet, { props })
    await wrapper.setProps({
      open: true,
      filters: { ...createDefaultFilters(), q: 'kopi', walkMinutes: 5 },
    })
    expect(wrapper.get('[data-testid="filter-show"]').text()).toBe('Show 7 deals')
    const food = wrapper.findAll('button').find((button) => button.text().startsWith('Food'))
    await food?.trigger('click')
    expect(wrapper.emitted('apply')).toBeUndefined()
    await wrapper.get('[data-testid="filter-clear"]').trigger('click')
    expect(wrapper.get('[data-testid="filter-show"]').text()).toBe('Show 7 deals')
    expect(wrapper.emitted('close')).toHaveLength(1)
    const emitted = wrapper.emitted('apply') ?? []
    expect(emitted).toHaveLength(1)
    expect(emitted[0]?.[1]).toBe('push')
    expect(emitted[0]?.[0]).toEqual(createDefaultFilters())
  })

  it('offers the cuisines on the loaded deals and hides the group when there are none', async () => {
    const wrapper = mount(FilterSheet, { props: { ...props, open: true } })
    expect(wrapper.text()).toContain('Cuisine')
    const japanese = wrapper
      .findAll('button')
      .find((button) => button.text().startsWith('Japanese'))
    await japanese?.trigger('click')
    expect(wrapper.emitted('apply')).toBeUndefined()
    await wrapper.get('[data-testid="filter-show"]').trigger('click')
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
