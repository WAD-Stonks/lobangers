import type { DealPin } from '@broke-oclock/contracts/deals'
import {
  endsWithin,
  filterDeals,
  filterVenues,
  isEndingToday,
  isVerified,
  sortRows,
  uniqueDealCount,
  walkMinutesFor,
} from '@web/modules/browse-map/apply-filters'
import { createDefaultFilters } from '@web/modules/browse-map/filters'
import { toDealRows, toVenuePins } from '@web/modules/browse-map/load-deals'
import { describe, expect, it } from 'vitest'

// Synthetic fixtures. 20 Oct 2026, 10:00 in Singapore (UTC+8).
const NOW = new Date('2026-10-20T02:00:00.000Z')
const NEAR = { id: 'a'.repeat(24), name: 'Kopi Corner', lat: 1.2966, lng: 103.8502 }
const FAR = { id: 'b'.repeat(24), name: 'Bedok Laksa', lat: 1.3248, lng: 103.9293 }

const deal = (overrides: Partial<DealPin>): DealPin => ({
  id: 'c'.repeat(24),
  title: 'Iced kopi peng',
  category: 'DRINKS',
  cuisine: 'CAFE',
  label: '$1.90',
  description: 'Synthetic deal.',
  offerType: 'FIXED_PRICE',
  priceMinor: 190,
  discountPercent: null,
  terms: null,
  validUntil: null,
  rawValidityText: null,
  votes: { alive: 0, dead: 0 },
  commentCount: 0,
  images: [],
  venues: [NEAR],
  ...overrides,
})

const KOPI = deal({})
const LAKSA = deal({
  id: 'd'.repeat(24),
  title: 'Laksa lunch set',
  category: 'FOOD',
  cuisine: null,
  label: '20% off',
  offerType: 'PERCENT_OFF',
  priceMinor: null,
  validUntil: '2026-10-20T12:00:00.000Z',
  venues: [FAR],
})
const SET = deal({
  id: 'e'.repeat(24),
  title: 'Chicken rice set',
  category: 'FOOD',
  cuisine: 'CHINESE',
  priceMinor: 650,
  label: '$6.50',
  validUntil: '2026-10-24T12:00:00.000Z',
  venues: [NEAR, FAR],
})
const ALL = [KOPI, LAKSA, SET]
const base = createDefaultFilters()
const ctx = { now: NOW, position: null, area: null }

describe('deal-level filters', () => {
  it('searches titles, labels and outlet names, ignoring case', () => {
    expect(filterDeals(ALL, { ...base, q: 'LUNCH' }, ctx)).toEqual([LAKSA])
    expect(filterDeals(ALL, { ...base, q: '20% off' }, ctx)).toEqual([LAKSA])
    expect(filterDeals(ALL, { ...base, q: 'kopi corner' }, ctx)).toEqual([KOPI, SET])
  })

  it('keeps deals without a fixed price under a price cap, like the API', () => {
    expect(filterDeals(ALL, { ...base, priceMaxMinor: 500 }, ctx)).toEqual([KOPI, LAKSA])
  })

  it('matches any selected category and deal type', () => {
    expect(filterDeals(ALL, { ...base, categories: ['FOOD'] }, ctx)).toEqual([LAKSA, SET])
    expect(filterDeals(ALL, { ...base, offerTypes: ['PERCENT_OFF'] }, ctx)).toEqual([LAKSA])
  })

  it('matches any selected cuisine, leaving out deals with no cuisine', () => {
    expect(filterDeals(ALL, { ...base, cuisines: ['CHINESE'] }, ctx)).toEqual([SET])
    expect(filterDeals(ALL, { ...base, cuisines: ['CAFE', 'CHINESE'] }, ctx)).toEqual([KOPI, SET])
  })

  it('narrows to deals ending today or this week in Singapore time', () => {
    expect(filterDeals(ALL, { ...base, ending: 'today' }, ctx)).toEqual([LAKSA])
    expect(filterDeals(ALL, { ...base, ending: 'week' }, ctx)).toEqual([LAKSA, SET])
  })
})

describe('venue-level filters', () => {
  const pins = toVenuePins(ALL)

  it('ignores walking distance until the visitor is located', () => {
    expect(filterVenues(pins, { ...base, walkMinutes: 5 }, ctx)).toHaveLength(2)
  })

  it('keeps outlets within the walking time', () => {
    const located = { ...ctx, position: { lat: 1.2963, lng: 103.8502 } }
    const kept = filterVenues(pins, { ...base, walkMinutes: 5 }, located)
    expect(kept.map((pin) => pin.id)).toEqual([NEAR.id])
  })

  it('keeps outlets inside the searched area', () => {
    const area = { south: 1.29, west: 103.84, north: 1.3, east: 103.86 }
    expect(filterVenues(pins, base, { ...ctx, area }).map((pin) => pin.id)).toEqual([NEAR.id])
  })
})

describe('helpers', () => {
  it('rounds walking time up to whole minutes, at least one', () => {
    expect(walkMinutesFor(0)).toBe(1)
    expect(walkMinutesFor(81)).toBe(2)
  })

  it('treats a deal as verified when more people say it is on than gone', () => {
    expect(isVerified({ alive: 0, dead: 0 })).toBe(false)
    expect(isVerified({ alive: 2, dead: 1 })).toBe(true)
    expect(isVerified({ alive: 1, dead: 1 })).toBe(false)
  })

  it('knows when a deal ends today', () => {
    expect(isEndingToday(LAKSA, NOW)).toBe(true)
    expect(isEndingToday(SET, NOW)).toBe(false)
    expect(endsWithin(KOPI, 'week', NOW)).toBe(false)
    expect(endsWithin(KOPI, 'any', NOW)).toBe(true)
  })

  it('counts each deal once however many outlets carry it', () => {
    expect(uniqueDealCount(toVenuePins(ALL))).toBe(3)
  })

  it('sorts rows by end date or keeps API order for newest', () => {
    const rows = toDealRows(toVenuePins(ALL), null)
    const ending = sortRows(rows, 'ending')
    expect(ending.map((row) => row.deal.id)).toEqual([LAKSA.id, SET.id, KOPI.id])
    expect(sortRows(rows, 'newest')).toEqual(rows)
    expect(rows.map((row) => row.deal.id)[0]).toBe(KOPI.id)
  })
})
