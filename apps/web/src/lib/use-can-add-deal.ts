import { authClient } from '@web/lib/auth-client'
import { computed } from 'vue'

export const useCanAddDeal = () => {
  const session = authClient.useSession()
  return computed(() => session.value.data?.user.role !== 'MERCHANT')
}
