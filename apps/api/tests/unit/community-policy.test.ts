import { communityStatus, DEFAULT_COMMUNITY_POLICY } from '@broke-oclock/contracts/community-policy'
import { describe, expect, it } from 'vitest'

describe('approved community policy', () => {
  const status = (alive: number, dead: number, validUntil: string | null = null) =>
    communityStatus({ alive, dead }, validUntil, new Date('2026-10-22T00:00:00Z'))
  it('requires three positive voters and at least 80% positive recent votes', () => {
    expect(DEFAULT_COMMUNITY_POLICY).toEqual({ minAlive: 3, positivePercent: 80, windowHours: 24 })
    expect(status(0, 0)).toBe('NO_RECENT_REPORTS')
    expect(status(2, 0)).toBe('UNCERTAIN')
    expect(status(3, 0)).toBe('LIKELY_STILL_ON')
    expect(status(3, 1)).toBe('UNCERTAIN')
    expect(status(4, 1)).toBe('LIKELY_STILL_ON')
    expect(status(0, 8)).toBe('UNCERTAIN')
  })
  it('never labels an expired deal likely still on', () => {
    expect(status(100, 0, '2026-10-22T00:00:00Z')).toBe('EXPIRED')
  })
})
