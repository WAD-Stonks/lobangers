import type { DealPin } from '@broke-oclock/contracts/deals'
import { api } from '@web/lib/api-client'
import { onBeforeUnmount, onMounted, ref } from 'vue'

export type LandingDealsStatus = 'loading' | 'ready' | 'error'

// The page reads the same public contract as the existing Leaflet discovery map.
export function useLandingDeals() {
  const deals = ref<DealPin[]>([])
  const status = ref<LandingDealsStatus>('loading')
  let active = true
  let version = 0
  const retry = async () => {
    const request = ++version
    status.value = 'loading'
    try {
      const response = await api.deals.list({ validNow: 'true' })
      if (!active || request !== version) return
      deals.value = response.items
      status.value = 'ready'
    } catch {
      if (active && request === version) status.value = 'error'
    }
  }
  onMounted(() => {
    void retry()
  })
  onBeforeUnmount(() => {
    active = false
  })
  return { deals, status, retry }
}
