import type { VenueDetailResponse } from '@broke-oclock/contracts/venues'
import {
  cachedVenueDetail,
  clearVenueDetailCache,
  fetchVenueDetail,
  VENUE_DETAIL_FRESH_MS,
} from '@web/modules/venues-feed/venue-detail-cache'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const rest = vi.hoisted(() => ({ venue: vi.fn() }))
vi.mock('@web/lib/api-client', () => ({ api: { venues: { get: rest.venue } } }))

const venueId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const detail = (name: string): VenueDetailResponse => ({
  venue: {
    id: venueId,
    name,
    address: '1 Example Street',
    area: null,
    postalCode: null,
    merchantName: 'Synthetic Kopi',
  },
  deals: [],
  pastDeals: [],
})

beforeEach(() => {
  clearVenueDetailCache()
  rest.venue.mockReset()
  vi.useFakeTimers()
})

afterEach(() => vi.useRealTimers())

it('shares one request between callers asking for the same venue at once', async () => {
  rest.venue.mockResolvedValue(detail('First'))

  const [first, second] = await Promise.all([fetchVenueDetail(venueId), fetchVenueDetail(venueId)])

  expect(first).toEqual(detail('First'))
  expect(second).toBe(first)
  expect(rest.venue).toHaveBeenCalledTimes(1)
})

it('answers from the cache while fresh and asks again once it goes stale', async () => {
  rest.venue.mockResolvedValueOnce(detail('First')).mockResolvedValueOnce(detail('Second'))
  expect(cachedVenueDetail(venueId)).toBeNull()

  await fetchVenueDetail(venueId)
  vi.advanceTimersByTime(VENUE_DETAIL_FRESH_MS - 1)
  expect(await fetchVenueDetail(venueId)).toEqual(detail('First'))
  expect(rest.venue).toHaveBeenCalledTimes(1)

  vi.advanceTimersByTime(1)
  expect(cachedVenueDetail(venueId)).toEqual(detail('First'))
  expect(await fetchVenueDetail(venueId)).toEqual(detail('Second'))
  expect(cachedVenueDetail(venueId)).toEqual(detail('Second'))
  expect(rest.venue).toHaveBeenCalledTimes(2)
})

it('forgets a venue whose refresh fails, so a removed venue is never shown again', async () => {
  const failure = new Error('NOT_FOUND')
  rest.venue.mockResolvedValueOnce(detail('First')).mockRejectedValueOnce(failure)
  await fetchVenueDetail(venueId)
  vi.advanceTimersByTime(VENUE_DETAIL_FRESH_MS)

  await expect(fetchVenueDetail(venueId)).rejects.toBe(failure)

  expect(cachedVenueDetail(venueId)).toBeNull()
  rest.venue.mockResolvedValueOnce(detail('Back'))
  expect(await fetchVenueDetail(venueId)).toEqual(detail('Back'))
})
