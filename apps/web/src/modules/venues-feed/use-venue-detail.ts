import type { VenueDetailResponse } from '@broke-oclock/contracts/venues'
import { ApiClientError } from '@web/lib/api-client'
import { cachedVenueDetail, fetchVenueDetail } from '@web/modules/venues-feed/venue-detail-cache'
import { type Ref, ref, watch } from 'vue'

export type VenueLoadState = 'loading' | 'ready' | 'not-found' | 'error'

const failureState = (failure: unknown): VenueLoadState => {
  const code = failure instanceof ApiClientError ? failure.code : null
  return code === 'NOT_FOUND' || code === 'BAD_REQUEST' ? 'not-found' : 'error'
}

export function useVenueDetails(venueIds: Readonly<Ref<readonly string[]>>) {
  const state = ref<VenueLoadState>('loading')
  const details = ref<readonly VenueDetailResponse[]>([])
  let latestRequest = 0

  const load = async () => {
    const request = ++latestRequest
    const ids = venueIds.value
    const cached = ids.map(cachedVenueDetail)
    const allCached = cached.every((detail) => detail !== null)
    details.value = allCached ? (cached as VenueDetailResponse[]) : []
    state.value = allCached && ids.length > 0 ? 'ready' : 'loading'
    const results = await Promise.allSettled(ids.map(fetchVenueDetail))
    if (request !== latestRequest) return
    const loaded = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    )
    const failed = results.find((result) => result.status === 'rejected')
    details.value = loaded
    if (loaded.length > 0) state.value = 'ready'
    else state.value = failed ? failureState(failed.reason) : 'not-found'
  }

  watch(venueIds, () => void load(), { immediate: true })
  return { state, details, reload: load }
}
