import type { OfferType } from '@web/modules/add-deal/add-deal-api'
import type { ShellIconName } from '@web/modules/map-shell/ShellIcon.vue'

// The four offer types as icon tiles, shared by the visitor's Add a deal form and the merchant
// dashboard's deal form.
export const OFFER_TILES: readonly { value: OfferType; label: string; icon: ShellIconName }[] = [
  { value: 'BUY_ONE_GET_ONE', label: '1-for-1', icon: 'gift' },
  { value: 'PERCENT_OFF', label: 'Discount', icon: 'percent' },
  { value: 'FIXED_PRICE', label: 'Fixed price', icon: 'tag' },
  { value: 'OTHER', label: 'Others', icon: 'more' },
]
