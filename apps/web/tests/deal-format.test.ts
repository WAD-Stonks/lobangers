import {
  dealFreshness,
  formatCategory,
  formatEnding,
  formatMoreOutlets,
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

  it('labels a limited promotion without inventing an end date', () => {
    expect(formatValidity(null, 'Explicit source calendar: end unspecified.', true)).toBe(
      'Limited promotion',
    )
    expect(formatValidity('2026-12-31T15:59:59.000Z', null, true)).toBe('Until 31 Dec 2026')
  })
})

describe('formatCategory', () => {
  it('turns an upper-case category code into a readable word', () => {
    expect(formatCategory('DESSERT')).toBe('Dessert')
    expect(formatCategory('FAST_FOOD')).toBe('Fast food')
  })
})

describe('formatMoreOutlets', () => {
  it('names the other outlets, or nothing for a single outlet', () => {
    expect(formatMoreOutlets(1)).toBeNull()
    expect(formatMoreOutlets(2)).toBe('+1 more outlet')
    expect(formatMoreOutlets(60)).toBe('+59 more outlets')
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

  it('shows a limited promotion instead of a missing end date', () => {
    expect(formatEnding(null, now, true)).toBe('Limited promotion')
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
      label: 'Likely still on',
      tone: 'ok',
    })
    expect(dealFreshness({ validUntil: null, votes: votes(0, 2) }, now)).toEqual({
      label: 'Conflicting reports',
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

describe('limited promotions on the venue page and landing cards', () => {
  it('labels an imported offer with no end as a limited promotion', async () => {
    const { validityLabel } = await import('@web/modules/venues-feed/deal-format')
    const { promotionDates } = await import('@web/modules/landing/live-deals')
    expect(
      validityLabel({ validUntil: null, rawValidityText: 'While stocks last', limitedTime: true }),
    ).toBe('Limited promotion')
    expect(validityLabel({ validUntil: null, rawValidityText: null })).toBe('No end date listed')
    const pin = { validUntil: null, rawValidityText: 'While stocks last', limitedTime: true }
    expect(promotionDates(pin as Parameters<typeof promotionDates>[0])).toBe('Limited promotion')
  })
})

describe('dealNoticeTags', () => {
  it('tags limited promotions only, leaving unconfirmed outlets to quieter text', async () => {
    const { dealNoticeTags } = await import('@web/modules/browse-map/deal-format')
    const guessed = { validUntil: null, limitedTime: true, outletUnconfirmed: true }
    expect(dealNoticeTags(guessed)).toEqual([{ label: 'Limited promotion', tone: 'info' }])
    expect(dealNoticeTags({ validUntil: '2026-11-10T00:00:00.000Z', limitedTime: true })).toEqual(
      [],
    )
    expect(dealNoticeTags({ validUntil: null })).toEqual([])
  })
})

describe('offerTypeTag', () => {
  it('names a known offer type and drops the uninformative fallback', async () => {
    const { offerTypeTag } = await import('@web/modules/browse-map/deal-format')
    expect(offerTypeTag('FIXED_PRICE')).toBe('Fixed price')
    expect(offerTypeTag('OTHER')).toBeNull()
  })
})
