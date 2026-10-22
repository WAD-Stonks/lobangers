import { hasConfirmedOutletScope } from '@api/modules/deals/outlet-eligibility'
import {
  isCurrentApproval,
  type PublicOutletScopeRow,
  publicOutletScopeSelect,
  publicVenuesFor,
} from '@api/modules/deals/public-deals'

export const publicDealVisibilitySelect = {
  ...publicOutletScopeSelect,
  reviewStatus: true,
  deletedAt: true,
  publishedAt: true,
  reviewedVersion: true,
} as const

// Single definition of "a signed-in user may see this deal's content".
export type DealVisibilityFields = PublicOutletScopeRow & {
  reviewStatus: string
  deletedAt: Date | null
  publishedAt: Date | null
  contentVersion: number
  reviewedVersion: number | null
}

// A deal is public only when ALL of these are true (see docs/database-schema.md).
export const isPubliclyVisible = (deal: DealVisibilityFields): boolean => {
  if (deal.reviewStatus !== 'APPROVED') return false // staff must have approved it
  if (deal.deletedAt) return false // not deleted
  if (!deal.publishedAt) return false // has been published
  if (!isCurrentApproval(deal)) return false // approved text is the current text
  if (deal.applicability === 'ONLINE' || deal.applicability === 'NO_FIXED_LOCATION') {
    return (
      (!deal.merchantId || (!!deal.merchant && deal.merchant.deletedAt == null)) &&
      hasConfirmedOutletScope({
        ...deal,
        selectedVenueIds: deal.venues.map((link) => link.venueId),
      })
    )
  }
  return publicVenuesFor(deal).length > 0
}
