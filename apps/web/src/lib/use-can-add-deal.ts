import { authClient } from '@web/lib/auth-client'
import { computed } from 'vue'

// "Add a deal" (Share) is for visitors, users and admins. Merchants add and edit their deals from
// the merchant dashboard instead, so they are offered that wherever others see Add a deal.
export const useCanAddDeal = () => {
  const session = authClient.useSession()
  return computed(() => session.value.data?.user.role !== 'MERCHANT')
}
