import type { VenueDetailResponse } from '@broke-oclock/contracts/venues'
import { ApiClientError } from '@web/lib/api-client'
import { cachedVenueDetail, fetchVenueDetail } from '@web/modules/venues-feed/venue-detail-cache'
import { type Ref, ref, watch } from 'vue'

export type VenueLoadState = 'loading' | 'ready' | 'not-found' | 'error'

// Loads the venue for the current route, showing a cached copy at once when there is one.
// Only the latest venue's answer is applied, so fast tab or pin changes never show a stale one.
export function useVenueDetail(venueId: Readonly<Ref<string>>) {
  const state = ref<VenueLoadState>('loading')
  const detail = ref<VenueDetailResponse | null>(null)
  let latestRequest = 0

  const load = async () => {
    const request = ++latestRequest
    const cached = cachedVenueDetail(venueId.value)
    detail.value = cached
    state.value = cached ? 'ready' : 'loading'
    try {
      const data = await fetchVenueDetail(venueId.value)
      if (request !== latestRequest) return
      detail.value = data
      state.value = 'ready'
    } catch (failure) {
      if (request !== latestRequest) return
      const code = failure instanceof ApiClientError ? failure.code : null
      detail.value = null
      state.value = code === 'NOT_FOUND' || code === 'BAD_REQUEST' ? 'not-found' : 'error'
    }
  }

  watch(venueId, () => void load(), { immediate: true })
  return { state, detail, reload: load }
}
