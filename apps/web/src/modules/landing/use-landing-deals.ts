import type { DealPin } from '@broke-oclock/contracts/deals'
import { api } from '@web/lib/api-client'
import { onBeforeUnmount, onMounted, ref } from 'vue'

export type LandingDealsStatus = 'loading' | 'ready' | 'error'

// The page reads the same public contract as the existing Leaflet discovery map.
export function useLandingDeals() {
  const deals = ref<DealPin[]>([])
  const status = ref<LandingDealsStatus>('loading')
  let active = true
  onMounted(async () => {
    try {
      const response = await api.deals.list({ validNow: 'true' })
      if (!active) return
      deals.value = response.items
      status.value = 'ready'
    } catch {
      if (active) status.value = 'error'
    }
  })
  onBeforeUnmount(() => {
    active = false
  })
  return { deals, status }
}
