import { CLUSTER_CLASS, createGroupIcon } from '@web/modules/browse-map/cluster-icon'
import type { PlacedGroup } from '@web/modules/browse-map/declutter'
import { DEAL_PIN_CLASS } from '@web/modules/browse-map/map-config'
import { describe, expect, it } from 'vitest'

const group = (overrides: Partial<PlacedGroup>): PlacedGroup => ({
  key: 'area:Orchard',
  kind: 'area',
  label: 'Orchard',
  dealCount: 12,
  centre: { lat: 1.3, lng: 103.8 },
  venues: [],
  compact: false,
  offset: { x: 0, y: 0 },
  ...overrides,
})

const venue = (
  id: string,
  title: string,
  label: string,
  priceMinor: number | null,
  category = 'FOOD',
) => ({
  id,
  name: `Synthetic ${id}`,
  lat: 1.3,
  lng: 103.8,
  deals: [{ title, label, priceMinor, category, offerType: 'FIXED_PRICE', discountPercent: null }],
})

const chipOf = (icon: ReturnType<typeof createGroupIcon>) =>
  icon.createIcon().querySelector(`.${CLUSTER_CLASS}__chip`) as HTMLElement

describe('createGroupIcon', () => {
  it('draws a pill with the area name and deal count, never parsing HTML', () => {
    const icon = createGroupIcon(group({ label: 'Orchard <b>' }))
    const chip = chipOf(icon)

    expect(icon.options.className).toBe(CLUSTER_CLASS)
    // Zero-size anchor: the pill centres itself on the point, whatever its width.
    expect(icon.options.iconSize).toEqual([0, 0])
    expect(chip.querySelector(`.${CLUSTER_CLASS}__name`)?.textContent).toBe('Orchard <b>')
    expect(chip.querySelector(`.${CLUSTER_CLASS}__count`)?.textContent).toBe('12 deals')
    expect(chip.querySelector('b')).toBeNull()
    expect(chip.getAttribute('aria-label')).toBe('12 deals in Orchard <b>')
  })

  it('marks the kind so "Near you" and regions can be styled apart', () => {
    expect(chipOf(createGroupIcon(group({ kind: 'near', label: 'Near you' }))).classList).toContain(
      `${CLUSTER_CLASS}__chip--near`,
    )
    expect(chipOf(createGroupIcon(group({ kind: 'region', label: 'East' }))).classList).toContain(
      `${CLUSTER_CLASS}__chip--region`,
    )
  })

  it('says walking distance for "Near you"', () => {
    const chip = chipOf(createGroupIcon(group({ kind: 'near', label: 'Near you', dealCount: 4 })))
    expect(chip.getAttribute('aria-label')).toBe('4 deals within a 10-minute walk')
  })

  it('drops the name on a compact dot but keeps it for screen readers', () => {
    const chip = chipOf(createGroupIcon(group({ compact: true, label: 'Bugis', dealCount: 3 })))

    expect(chip.classList).toContain(`${CLUSTER_CLASS}__chip--compact`)
    expect(chip.querySelector(`.${CLUSTER_CLASS}__name`)).toBeNull()
    expect(chip.getAttribute('aria-label')).toBe('3 deals in Bugis')
  })

  it('uses the singular for one deal', () => {
    expect(chipOf(createGroupIcon(group({ dealCount: 1 }))).getAttribute('aria-label')).toBe(
      '1 deal in Orchard',
    )
  })
})

describe('group foods and prices', () => {
  const venues = [
    venue('a', 'Kopi O', '$1.20', 120, 'DRINKS'),
    venue('b', 'Chicken rice', '$3.50', 350),
    venue('c', 'Kaya toast', '1-for-1', null, 'BAKERY'),
    venue('d', 'Laksa', '$4', 400),
  ] as never

  it('shows only the most common food inside the oval', () => {
    const chip = chipOf(createGroupIcon(group({ venues })))
    const foods = chip.querySelectorAll(`.${CLUSTER_CLASS}__fan .food-sprite`)
    expect(foods).toHaveLength(1)
  })

  it('leads with the cheapest price in the group', () => {
    const chip = chipOf(createGroupIcon(group({ venues, dealCount: 4 })))
    expect(chip.querySelector(`.${CLUSTER_CLASS}__count`)?.textContent).toBe('4 deals · from $1.20')
  })

  it('keeps one food and the bare count on a compact dot', () => {
    const chip = chipOf(createGroupIcon(group({ venues, compact: true, dealCount: 4 })))
    expect(chip.querySelectorAll('.food-sprite')).toHaveLength(1)
    expect(chip.querySelector(`.${CLUSTER_CLASS}__count`)?.textContent).toBe('4')
  })
})

describe('createGroupIcon offset', () => {
  it('shifts the pill by its declutter offset while the group keeps its real centre', () => {
    const icon = createGroupIcon(group({ offset: { x: 0, y: -42 } }))
    expect(icon.options.iconAnchor).toEqual([0, 42])
  })
})

describe('mall markers', () => {
  it('draw a pin with a building and the deal count, and no food', () => {
    const icon = createGroupIcon(
      group({
        kind: 'place',
        compact: true,
        label: 'Plaza Singapura',
        dealCount: 2,
        venues: [venue('a', 'Salmon sushi', 'Free', null)] as never,
      }),
    )
    const stack = icon.createIcon().querySelector(`.${DEAL_PIN_CLASS}__stack`) as HTMLElement
    expect(icon.options.className).toContain(DEAL_PIN_CLASS)
    expect(stack.querySelector('.food-sprite')).toBeNull()
    expect(stack.querySelector(`.${DEAL_PIN_CLASS}__building`)).not.toBeNull()
    expect(stack.querySelector(`.${DEAL_PIN_CLASS}__badge`)?.textContent).toBe('2 deals')
    expect(stack.querySelector(`.${DEAL_PIN_CLASS}__dot`)).not.toBeNull()
    expect(stack.getAttribute('aria-label')).toContain('Plaza Singapura')
  })
})

describe('stack dots', () => {
  it('draw a stack like any other compact cluster: one food and the deal count', () => {
    const chip = chipOf(createGroupIcon(group({ kind: 'stack', compact: true, dealCount: 5 })))
    expect(chip.classList).toContain(`${CLUSTER_CLASS}__chip--compact`)
    expect(chip.querySelector(`.${CLUSTER_CLASS}__count`)?.textContent).toBe('5')
  })
})
