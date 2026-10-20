import {
  dealFreshness,
  formatCategory,
  formatEnding,
  formatOtherOutlets,
  formatValidity,
  priceText,
  termsList,
} from '@web/modules/browse-map/deal-format'
import { describe, expect, it } from 'vitest'

describe('formatValidity', () => {
  it('shows the end date in Singapore time when one is known', () => {
    expect(formatValidity('2026-12-31T15:59:59.000Z', null)).toBe('Until 31 Dec 2026')
  })

  it('falls back to the raw validity text, then to a no-end-date note', () => {
    expect(formatValidity(null, 'Weekdays before 11am')).toBe('Weekdays before 11am')
    expect(formatValidity(null, null)).toBe('No end date given')
  })

  it('prefers the raw text when the stored date is unreadable', () => {
    expect(formatValidity('not-a-date', 'While stocks last')).toBe('While stocks last')
  })
})

describe('formatCategory', () => {
  it('turns an upper-case category code into a readable word', () => {
    expect(formatCategory('DESSERT')).toBe('Dessert')
    expect(formatCategory('FAST_FOOD')).toBe('Fast food')
  })
})

describe('formatOtherOutlets', () => {
  it('counts the outlets other than the one being viewed', () => {
    expect(formatOtherOutlets(1)).toBeNull()
    expect(formatOtherOutlets(2)).toBe('Also at 1 other outlet')
    expect(formatOtherOutlets(4)).toBe('Also at 3 other outlets')
  })
})

describe('formatEnding', () => {
  const now = new Date('2026-10-20T02:00:00.000Z') // 10am in Singapore

  it('gives the time for deals ending today and the day otherwise', () => {
    expect(formatEnding('2026-10-20T14:00:00.000Z', now)).toMatch(/^Ends today, 10:00\s?pm$/i)
    expect(formatEnding('2026-10-24T04:00:00.000Z', now)).toBe('Ends Sat, 24 Oct')
  })

  it('handles missing, broken and past end dates', () => {
    expect(formatEnding(null, now)).toBe('No end date given')
    expect(formatEnding('not a date', now)).toBe('No end date given')
    expect(formatEnding('2026-10-19T02:00:00.000Z', now)).toBe('Ended')
  })
})

describe('dealFreshness and priceText', () => {
  const now = new Date('2026-10-20T02:00:00.000Z')
  const votes = (alive: number, dead: number) => ({ alive, dead })

  it('puts ending today first, then confirmations and reports', () => {
    expect(
      dealFreshness({ validUntil: '2026-10-20T10:00:00.000Z', votes: votes(5, 0) }, now),
    ).toEqual({ label: 'Ends today', tone: 'end' })
    expect(dealFreshness({ validUntil: null, votes: votes(5, 1) }, now)).toEqual({
      label: '5 confirmed',
      tone: 'ok',
    })
    expect(dealFreshness({ validUntil: null, votes: votes(0, 2) }, now)).toEqual({
      label: 'Reported ended',
      tone: 'end',
    })
    expect(dealFreshness({ validUntil: null, votes: votes(0, 0) }, now)).toEqual({
      label: 'Unverified',
      tone: 'new',
    })
  })

  it('drops a label that only repeats the title', () => {
    expect(priceText({ label: '$3', title: 'Kopi' })).toBe('$3')
    expect(priceText({ label: 'Kopi', title: ' Kopi ' })).toBeNull()
  })
})

describe('termsList', () => {
  it('splits fine print into one point per sentence or clause, without trailing punctuation', () => {
    expect(
      termsList('Tuesdays only, while stocks last. Up to two sets per order; dine-in only.'),
    ).toEqual(['Tuesdays only, while stocks last', 'Up to two sets per order', 'Dine-in only'])
  })

  it('keeps prices and times that contain dots or colons intact', () => {
    expect(termsList('Usually S$2.90 each. Sessions at 2:30pm.')).toEqual([
      'Usually S$2.90 each',
      'Sessions at 2:30pm',
    ])
  })

  it('returns no points for missing or blank terms', () => {
    expect(termsList(null)).toEqual([])
    expect(termsList('  ')).toEqual([])
  })
})
