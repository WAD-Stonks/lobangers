import {
  formatCount,
  formatDate,
  formatDateTime,
  formatDistance,
  formatMoneyMajor,
  formatMoneyMinor,
  formatRelativeTime,
} from '@web/lib/format'
import { describe, expect, it } from 'vitest'

describe('formatMoneyMinor', () => {
  it('formats minor units as Singapore dollars', () => {
    expect(formatMoneyMinor(500)).toBe('$5.00')
    expect(formatMoneyMinor(1299)).toBe('$12.99')
    expect(formatMoneyMinor(0)).toBe('$0.00')
  })

  it('respects another currency code', () => {
    expect(formatMoneyMinor(500, 'USD')).toContain('5.00')
  })
})

describe('formatMoneyMajor', () => {
  it('drops cents for whole amounts and keeps them otherwise', () => {
    expect(formatMoneyMajor(5)).toBe('$5')
    expect(formatMoneyMajor(4.5)).toBe('$4.50')
  })
})

describe('formatDistance', () => {
  it('rounds short distances to 10 metres', () => {
    expect(formatDistance(347)).toBe('350 m')
  })

  it('switches to kilometres with one decimal', () => {
    expect(formatDistance(1250)).toBe('1.3 km')
    expect(formatDistance(996)).toBe('1.0 km')
  })
})

describe('formatDate and formatDateTime', () => {
  const iso = '2026-12-31T07:05:00.000Z'

  it('shows the date in Singapore time', () => {
    expect(formatDate(iso)).toBe('31 Dec 2026')
    expect(formatDateTime(iso)).toMatch(/31 Dec 2026.*3:05/)
  })

  it('returns unreadable input unchanged', () => {
    expect(formatDate('not a date')).toBe('not a date')
    expect(formatDateTime('')).toBe('')
  })
})

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-11-02T12:00:00Z')

  it('describes recent times relatively', () => {
    expect(formatRelativeTime(now - 30_000, now)).toBe('Just now')
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5 min ago')
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe('3 hr ago')
  })

  it('falls back to a date after a day', () => {
    expect(formatRelativeTime(now - 2 * 86_400_000, now)).toBe('31 Oct 2026')
  })
})

describe('formatCount', () => {
  it('groups thousands', () => {
    expect(formatCount(2000)).toBe('2,000')
  })
})
