import {
  clashes,
  codeIsActive,
  codesExpireAt,
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

  it('keeps a draft a draft until Go live, even after its saved time passes', () => {
    expect(displayStatus(drop({ status: 'DRAFT', startsAt: at(30), endsAt: at(60) }), NOW)).toBe(
      'DRAFT',
    )
    expect(displayStatus(drop({ status: 'DRAFT', endsAt: at(-1) }), NOW)).toBe('DRAFT')
    expect(displayStatus(drop({ status: 'PENDING' }), NOW)).toBe('DRAFT')
    expect(displayStatus(drop({ status: 'SENT_BACK' }), NOW)).toBe('DRAFT')
    expect(displayStatus(drop({ status: 'STOPPED' }), NOW)).toBe('STOPPED')
    expect(displayStatus(drop({ status: 'ENDED_EARLY' }), NOW)).toBe('ENDED')
  })

  it('files each status under one admin tab, and drafts under none', () => {
    expect(viewOf('DRAFT')).toBeNull()
    expect(viewOf('SCHEDULED')).toBe('scheduled')
    expect(viewOf('LIVE')).toBe('live')
    expect(viewOf('ENDED')).toBe('ended')
    expect(viewOf('STOPPED')).toBe('ended')
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

describe('codesExpireAt', () => {
  const closes = new Date('2026-11-01T10:30:00.000Z')

  it('counts from when claiming closes', () => {
    expect(codesExpireAt(closes, 'TWO_HOURS').toISOString()).toBe('2026-11-01T12:30:00.000Z')
    expect(codesExpireAt(closes, 'THREE_DAYS').toISOString()).toBe('2026-11-04T10:30:00.000Z')
    expect(codesExpireAt(closes, 'SEVEN_DAYS').toISOString()).toBe('2026-11-08T10:30:00.000Z')
  })

  it('ends a same-day code at 11:59 pm Singapore time', () => {
    expect(codesExpireAt(closes, 'END_OF_DAY').toISOString()).toBe('2026-11-01T15:59:59.999Z')
    const lateNight = new Date('2026-11-01T17:00:00.000Z')
    expect(codesExpireAt(lateNight, 'END_OF_DAY').toISOString()).toBe('2026-11-02T15:59:59.999Z')
  })
})

describe('codeIsActive', () => {
  const claimed = (overrides: Partial<Parameters<typeof codeIsActive>[0]> = {}) => ({
    status: 'APPROVED' as const,
    endsAt: at(-5),
    codesExpireAt: at(60),
    ...overrides,
  })

  it('keeps a code good after claiming closes, until it expires', () => {
    expect(codeIsActive(claimed(), NOW)).toBe(true)
    expect(codeIsActive(claimed({ codesExpireAt: at(0) }), NOW)).toBe(false)
  })

  it('keeps codes from a drop the merchant ended early', () => {
    expect(codeIsActive(claimed({ status: 'ENDED_EARLY' }), NOW)).toBe(true)
  })

  it('cancels codes when an admin removes the drop', () => {
    expect(codeIsActive(claimed({ status: 'STOPPED' }), NOW)).toBe(false)
  })

  it('ends older codes with their window, as before', () => {
    expect(codeIsActive(claimed({ codesExpireAt: null }), NOW)).toBe(false)
    expect(codeIsActive(claimed({ codesExpireAt: null, endsAt: at(5) }), NOW)).toBe(true)
    expect(
      codeIsActive(claimed({ codesExpireAt: null, endsAt: at(5), status: 'ENDED_EARLY' }), NOW),
    ).toBe(false)
  })
})
