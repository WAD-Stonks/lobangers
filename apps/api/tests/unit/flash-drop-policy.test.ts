import {
  clashes,
  displayStatus,
  distanceMetres,
  newClaimCode,
  scheduleWindow,
  viewOf,
} from '@api/modules/flash-drops/policy'
import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-11-01T10:00:00.000Z')
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)
const drop = (overrides: Partial<Parameters<typeof displayStatus>[0]> = {}) => ({
  status: 'APPROVED' as const,
  startsAt: at(-10),
  endsAt: at(20),
  claimedCount: 3,
  codeLimit: 40,
  ...overrides,
})

describe('displayStatus', () => {
  it('reads an approved drop by the clock', () => {
    expect(displayStatus(drop({ startsAt: at(5), endsAt: at(35) }), NOW)).toBe('SCHEDULED')
    expect(displayStatus(drop(), NOW)).toBe('LIVE')
    expect(displayStatus(drop({ endsAt: at(0) }), NOW)).toBe('ENDED')
  })

  it('ends a drop the moment its last code is claimed', () => {
    expect(displayStatus(drop({ claimedCount: 40 }), NOW)).toBe('ENDED')
  })

  it('keeps review outcomes, and closes a drop nobody reviewed in time', () => {
    expect(displayStatus(drop({ status: 'PENDING', startsAt: at(30), endsAt: at(60) }), NOW)).toBe(
      'IN_REVIEW',
    )
    expect(displayStatus(drop({ status: 'PENDING', endsAt: at(-1) }), NOW)).toBe('ENDED')
    expect(displayStatus(drop({ status: 'SENT_BACK' }), NOW)).toBe('SENT_BACK')
    expect(displayStatus(drop({ status: 'STOPPED' }), NOW)).toBe('STOPPED')
    expect(displayStatus(drop({ status: 'ENDED_EARLY' }), NOW)).toBe('ENDED')
  })

  it('files each status under one admin tab', () => {
    expect(viewOf('IN_REVIEW')).toBe('review')
    expect(viewOf('SCHEDULED')).toBe('scheduled')
    expect(viewOf('LIVE')).toBe('live')
    expect(['ENDED', 'SENT_BACK', 'STOPPED'].map((s) => viewOf(s as never))).toEqual([
      'ended',
      'ended',
      'ended',
    ])
  })
})

describe('clashes', () => {
  const here = { lat: 1.3236, lng: 103.9273, startsAt: at(0), endsAt: at(30), radiusMetres: 500 }

  it('flags drops whose circles touch while both are running', () => {
    const nearby = { ...here, lat: 1.3266, radiusMetres: 300 }
    expect(distanceMetres(here, nearby)).toBeLessThan(800)
    expect(clashes(here, nearby)).toBe(true)
  })

  it('ignores drops far apart or at different times', () => {
    expect(clashes(here, { ...here, lat: 1.36 })).toBe(false)
    expect(clashes(here, { ...here, startsAt: at(30), endsAt: at(60) })).toBe(false)
  })
})

describe('scheduleWindow', () => {
  it('starts now when asked for the moment just gone, and runs for the chosen length', () => {
    const window = scheduleWindow(at(-0.5).toISOString(), 30, NOW)
    expect(window.startsAt).toEqual(NOW)
    expect(window.endsAt).toEqual(at(30))
  })

  it('refuses the past and anything more than a week out', () => {
    expect(() => scheduleWindow(at(-5).toISOString(), 30, NOW)).toThrow(/past/)
    expect(() => scheduleWindow(at(8 * 24 * 60).toISOString(), 30, NOW)).toThrow(/week/)
  })
})

describe('newClaimCode', () => {
  it('uses easy-to-read characters only', () => {
    let seed = 0
    const code = newClaimCode((max) => (seed++ * 7) % max)
    expect(code).toMatch(/^LB-[A-HJ-NP-Z2-9]{6}$/)
  })
})
