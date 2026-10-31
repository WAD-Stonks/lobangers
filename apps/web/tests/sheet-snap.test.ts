import { FLICK_VELOCITY, snapIndex } from '@web/modules/map-shell/sheet-snap'
import { describe, expect, it } from 'vitest'

// Peek, half and full heights of a 800px tall phone.
const HEIGHTS = [120, 400, 680]

describe('bottom sheet snapping', () => {
  it('uses the documented flick threshold', () => {
    expect(FLICK_VELOCITY).toBe(0.11)
  })

  it('snaps a slow drag to the nearest height', () => {
    expect(snapIndex(HEIGHTS, { height: 250, velocity: 0, start: 0 })).toBe(0)
    expect(snapIndex(HEIGHTS, { height: 300, velocity: 0.05, start: 0 })).toBe(1)
    expect(snapIndex(HEIGHTS, { height: 600, velocity: -0.1, start: 2 })).toBe(2)
  })

  it('moves exactly one height in the direction of a flick', () => {
    expect(snapIndex(HEIGHTS, { height: 140, velocity: 0.2, start: 0 })).toBe(1)
    expect(snapIndex(HEIGHTS, { height: 380, velocity: -0.5, start: 1 })).toBe(0)
  })

  it('stays within the first and last heights', () => {
    expect(snapIndex(HEIGHTS, { height: 700, velocity: 1, start: 2 })).toBe(2)
    expect(snapIndex(HEIGHTS, { height: 100, velocity: -1, start: 0 })).toBe(0)
  })
})
