import type { VenueDealSummary } from '@broke-oclock/contracts/venues'
import { toVenueDealRows } from '@web/modules/venues-feed/venue-deal-rows'
import { HAWKER_VENUE, KOPI_VENUE, makeDeal } from '@web-tests/support/shell-fixtures'
import { describe, expect, it } from 'vitest'

const VENUE = { id: KOPI_VENUE.id, name: KOPI_VENUE.name }
const summary = (overrides: Partial<VenueDealSummary>): VenueDealSummary => ({
  id: 'c'.repeat(24),
  title: 'Synthetic iced kopi',
  category: 'DRINKS',
  offerType: 'FIXED_PRICE',
  priceMinor: 190,
  currency: 'SGD',
  discountPercent: null,
  validUntil: null,
  rawValidityText: null,
  imageUrl: null,
  ...overrides,
})

describe('toVenueDealRows', () => {
  it('reuses the loaded deal and outlet so cards match the browse list', () => {
    const loaded = makeDeal({ votes: { alive: 5, dead: 0 }, venues: [KOPI_VENUE, HAWKER_VENUE] })
    const pin = { ...KOPI_VENUE, deals: [loaded] }
    const rows = toVenueDealRows(VENUE, [summary({})], {
      deals: [loaded],
      pin,
      position: { lat: KOPI_VENUE.lat, lng: KOPI_VENUE.lng },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.deal).toBe(loaded)
    expect(rows[0]?.venue).toBe(pin)
    expect(rows[0]?.outletCount).toBe(2)
    expect(rows[0]?.distanceMetres).toBe(0)
    expect(rows[0]?.key).toBe(`${loaded.id}:${KOPI_VENUE.id}`)
  })

  it('builds a card from the venue summary when the map has not loaded that deal', () => {
    const rows = toVenueDealRows(
      VENUE,
      [
        summary({
          id: 'd'.repeat(24),
          title: 'Synthetic toast',
          imageUrl: 'https://example.test/toast.jpg',
          imageAltText: 'Toast',
          validUntil: '2099-01-01T00:00:00.000Z',
        }),
      ],
      { deals: [], pin: null, position: { lat: 1.3, lng: 103.8 } },
    )
    const row = rows[0]
    expect(row?.deal.title).toBe('Synthetic toast')
    expect(row?.deal.validUntil).toBe('2099-01-01T00:00:00.000Z')
    expect(row?.deal.images).toEqual([{ url: 'https://example.test/toast.jpg', alt: 'Toast' }])
    expect(row?.deal.votes).toEqual({ alive: 0, dead: 0 })
    expect(row?.venue.id).toBe(VENUE.id)
    expect(row?.venue.name).toBe(VENUE.name)
    expect(row?.outletCount).toBe(1)
    expect(row?.distanceMetres).toBeNull()
  })

  it('drops photos that are not served over https, as the deals contract requires', () => {
    const rows = toVenueDealRows(VENUE, [summary({ imageUrl: 'http://example.test/a.jpg' })], {
      deals: [],
      pin: null,
      position: null,
    })
    expect(rows[0]?.deal.images).toEqual([])
  })

  it('keeps the venue API order and does not mutate its inputs', () => {
    const summaries = Object.freeze([
      summary({ id: 'e'.repeat(24) }),
      summary({ id: 'f'.repeat(24) }),
    ])
    const rows = toVenueDealRows(VENUE, summaries, { deals: [], pin: null, position: null })
    expect(rows.map((row) => row.deal.id)).toEqual(['e'.repeat(24), 'f'.repeat(24)])
  })
})
