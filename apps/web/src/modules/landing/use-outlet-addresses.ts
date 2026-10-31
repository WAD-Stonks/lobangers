import type { DealVenuePin } from '@broke-oclock/contracts/deals'
import { api } from '@web/lib/api-client'
import { onBeforeUnmount, type Ref, ref, watch } from 'vue'

// Only visible/selected outlets are fetched. Cache by outlet ID, never by region or chain.
export function useOutletAddresses(outlets: Readonly<Ref<readonly DealVenuePin[]>>) {
  const addresses = ref<Record<string, string>>({})
  const requested = new Set<string>()
  let active = true
  watch(
    outlets,
    (venues) => {
      for (const venue of venues) {
        if (requested.has(venue.id)) continue
        requested.add(venue.id)
        void api.venues
          .get(venue.id)
          .then((result) => {
            if (active) addresses.value[venue.id] = result.venue.address.trim() || venue.name
          })
          .catch(() => {
            // The actual outlet name is preferable to an inferred neighbourhood.
          })
      }
    },
    { immediate: true },
  )
  onBeforeUnmount(() => {
    active = false
  })
  return {
    locationFor: (venue: DealVenuePin | undefined) =>
      venue ? addresses.value[venue.id] || venue.name : '',
  }
}
