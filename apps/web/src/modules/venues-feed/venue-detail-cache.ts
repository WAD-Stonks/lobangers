import type { VenueDetailResponse } from '@broke-oclock/contracts/venues'
import { api } from '@web/lib/api-client'

// Venue details are public and slow to assemble, and the map, landing cards and venue panel all
// ask for the same outlets. A recent copy answers at once; requests already in flight are shared.
export const VENUE_DETAIL_FRESH_MS = 30_000

type Entry = { readonly data: VenueDetailResponse; readonly fetchedAt: number }

const entries = new Map<string, Entry>()
const pending = new Map<string, Promise<VenueDetailResponse>>()

// The last copy, fresh or stale, for showing straight away while a newer one loads.
export const cachedVenueDetail = (venueId: string): VenueDetailResponse | null =>
  entries.get(venueId)?.data ?? null

export const fetchVenueDetail = (venueId: string): Promise<VenueDetailResponse> => {
  const entry = entries.get(venueId)
  if (entry && Date.now() - entry.fetchedAt < VENUE_DETAIL_FRESH_MS)
    return Promise.resolve(entry.data)
  const inFlight = pending.get(venueId)
  if (inFlight) return inFlight
  const request = api.venues
    .get(venueId)
    .then((data) => {
      entries.set(venueId, { data, fetchedAt: Date.now() })
      return data
    })
    .catch((failure: unknown) => {
      // A venue that now fails, often because it was removed, must not reappear from cache.
      entries.delete(venueId)
      throw failure
    })
    .finally(() => pending.delete(venueId))
  pending.set(venueId, request)
  return request
}

export const clearVenueDetailCache = (): void => {
  entries.clear()
  pending.clear()
}
