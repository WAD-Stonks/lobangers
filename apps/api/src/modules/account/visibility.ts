import { hasConfirmedOutletScope } from '@api/modules/deals/outlet-eligibility'
import {
  isCurrentApproval,
  mapVenuesFor,
  type PublicOutletScopeRow,
  publicOutletScopeSelect,
} from '@api/modules/deals/public-deals'

export const publicDealVisibilitySelect = {
  ...publicOutletScopeSelect,
  reviewStatus: true,
  deletedAt: true,
  publishedAt: true,
  reviewedVersion: true,
  terms: true,
} as const

export type DealVisibilityFields = PublicOutletScopeRow & {
  reviewStatus: string
  deletedAt: Date | null
  publishedAt: Date | null
  contentVersion: number
  reviewedVersion: number | null
  terms?: string | null
}

export const isPubliclyVisible = (deal: DealVisibilityFields): boolean => {
  if (deal.reviewStatus !== 'APPROVED') return false
  if (deal.deletedAt) return false
  if (!deal.publishedAt) return false
  if (!isCurrentApproval(deal)) return false
  if (deal.applicability === 'ONLINE' || deal.applicability === 'NO_FIXED_LOCATION') {
    return (
      (!deal.merchantId || (!!deal.merchant && deal.merchant.deletedAt == null)) &&
      hasConfirmedOutletScope({
        ...deal,
        selectedVenueIds: deal.venues.map((link) => link.venueId),
      })
    )
  }
  return mapVenuesFor(deal).venues.length > 0
}
