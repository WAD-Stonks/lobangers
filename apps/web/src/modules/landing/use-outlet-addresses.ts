import type { DealVenuePin } from '@broke-oclock/contracts/deals'
import { fetchVenueDetail } from '@web/modules/venues-feed/venue-detail-cache'
import { onBeforeUnmount, type Ref, ref, watch } from 'vue'

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
        void fetchVenueDetail(venue.id)
          .then((result) => {
            if (active) addresses.value[venue.id] = result.venue.address.trim() || venue.name
          })
          .catch(() => {})
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
