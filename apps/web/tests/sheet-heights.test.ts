import { SHEET_FULL, sheetHeights } from '@web/modules/map-shell/use-shell-layout'
import { describe, expect, it } from 'vitest'

describe('bottom sheet heights', () => {
  it('stops below the header at full, then can cover the whole screen', () => {
    const heights = sheetHeights(800, 120, 0.58)
    expect(heights).toHaveLength(4)
    expect(heights[SHEET_FULL]).toBe(800 - 120 - 8)
    expect(heights.at(-1)).toBe(800)
  })

  it('can sit flush against the header, for the All deals list where no map shows behind it', () => {
    const heights = sheetHeights(800, 120, 0.58, null, 0)
    expect(heights[SHEET_FULL]).toBe(800 - 120)
  })

  it('keeps every height strictly taller than the one before', () => {
    const heights = sheetHeights(320, 300, 0.58)
    for (let i = 1; i < heights.length; i++) expect(heights[i]).toBeGreaterThan(heights[i - 1] ?? 0)
  })
})
