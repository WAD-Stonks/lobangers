import {
  CLUSTER_CLASS,
  createGroupIcon,
  createStackIcon,
  STACK_CLASS,
  stackRadiusFor,
} from '@web/modules/browse-map/cluster-icon'
import type { PlacedGroup } from '@web/modules/browse-map/declutter'
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
    expect(chip.querySelector(`.${CLUSTER_CLASS}__count`)?.textContent).toBe('12')
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

describe('createGroupIcon offset', () => {
  it('shifts the pill by its declutter offset while the group keeps its real centre', () => {
    const icon = createGroupIcon(group({ offset: { x: 0, y: -42 } }))
    expect(icon.options.iconAnchor).toEqual([0, 42])
  })
})

describe('createStackIcon', () => {
  it('counts the outlets sharing one spot', () => {
    const element = createStackIcon(3).createIcon()

    expect(element.querySelector(`.${STACK_CLASS}__chip`)?.textContent).toBe('3 places')
  })
})

describe('stackRadiusFor', () => {
  it('only stacks outlets in the same building, about 30 m apart', () => {
    // Around 4.8 m per pixel at zoom 15 and half that each zoom in.
    expect(stackRadiusFor(15)).toBe(8)
    expect(stackRadiusFor(16)).toBe(13)
    expect(stackRadiusFor(17)).toBe(25)
  })

  it('stays within a sensible pixel range', () => {
    expect(stackRadiusFor(11)).toBe(8)
    expect(stackRadiusFor(19)).toBe(40)
  })
})
