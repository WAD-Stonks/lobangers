import {
  BANNER_LIFE_MS,
  FIRST_IDLE_MS,
  isDue,
  nextBannerDrop,
  REPEAT_IDLE_MS,
} from '@web/modules/flash-drop/banner-schedule'
import {
  codesLeftText,
  countdown,
  distanceText,
  formatCents,
  radiusText,
  savingText,
} from '@web/modules/flash-drop/flash-format'
import { describe, expect, it } from 'vitest'

const NOW = Date.parse('2026-11-01T10:00:00.000Z')
const inMinutes = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString()
const drop = (id: string, lat: number, overrides: Record<string, unknown> = {}) =>
  ({
    id,
    lat,
    lng: 103.9,
    endsAt: inMinutes(30),
    codesLeft: 5,
    ...overrides,
  }) as never

describe('flash format', () => {
  it('formats prices, savings, codes and radius', () => {
    expect(formatCents(150)).toBe('$1.50')
    expect(savingText(150, 400)).toBe('−63%')
    expect(savingText(150, null)).toBeNull()
    expect(savingText(400, 400)).toBeNull()
    expect(codesLeftText({ codesLeft: 1 })).toBe('1 code left')
    expect(codesLeftText({ codesLeft: 12 })).toBe('12 codes left')
    expect(radiusText(500)).toBe('500\u00a0m')
    expect(radiusText(1000)).toBe('1\u00a0km')
    expect(radiusText(1500)).toBe('1.5\u00a0km')
    expect(distanceText(347)).toBe('350\u00a0m')
    expect(distanceText(1260)).toBe('1.3\u00a0km')
  })

  it('counts down in minutes, then hours, and never below zero', () => {
    expect(countdown(inMinutes(29.5), NOW)).toBe('29:30')
    expect(countdown(inMinutes(62), NOW)).toBe('1:02:00')
    expect(countdown(inMinutes(-1), NOW)).toBe('0:00')
  })
})

describe('banner schedule', () => {
  it('waits longer between banners than before the first', () => {
    expect(isDue(NOW, NOW - FIRST_IDLE_MS + 1, 0)).toBe(false)
    expect(isDue(NOW, NOW - FIRST_IDLE_MS, 0)).toBe(true)
    expect(isDue(NOW, NOW - FIRST_IDLE_MS, 1)).toBe(false)
    expect(isDue(NOW, NOW - REPEAT_IDLE_MS, 1)).toBe(true)
    expect(BANNER_LIFE_MS).toBe(5000)
  })

  it('takes turns through live drops with codes left, nearest first', () => {
    const drops = [drop('far', 1.4), drop('near', 1.31), drop('gone', 1.3, { codesLeft: 0 })]
    const user = { lat: 1.3, lng: 103.9 }
    expect((nextBannerDrop(drops, user, NOW, 0) as { id: string }).id).toBe('near')
    expect((nextBannerDrop(drops, user, NOW, 1) as { id: string }).id).toBe('far')
    expect((nextBannerDrop(drops, user, NOW, 2) as { id: string }).id).toBe('near')
    expect(nextBannerDrop([drop('over', 1.3, { endsAt: inMinutes(-1) })], user, NOW, 0)).toBeNull()
  })
})
