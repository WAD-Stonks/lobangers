import type { AuthenticatedActor } from '@api/modules/account/security-access'
import { invalidateReview, mutateAdminDeal, requireEditable } from '@api/modules/deals/admin-write'
import { isSelectableCatalogueVenue } from '@api/modules/deals/outlet-eligibility'
import { DomainError } from '@api/modules/domain-error'
import type { Database } from '@api/modules/platform-admin/transaction'
import { activeVenue } from '@api/modules/platform-admin/venues'
import {
  type AdminDealScopeRequest,
  adminDealScopeRequestSchema,
} from '@broke-oclock/contracts/admin-deals'
export const correctAdminDealScope = (
  db: Database,
  actor: AuthenticatedActor,
  id: string,
  raw: AdminDealScopeRequest,
) => {
  const input = adminDealScopeRequestSchema.parse(raw)
  return mutateAdminDeal(db, actor, id, input, async (tx, deal) => {
    requireEditable(deal)
    if (deal.venues.length > 100)
      throw new DomainError(
        'PRECONDITION_FAILED',
        'Large existing scopes are read only; do not replace from a display subset',
      )
    if (
      deal.applicability === input.applicability &&
      deal.merchantId === input.merchantId &&
      JSON.stringify(deal.venues.map((v) => v.venueId).sort()) ===
        JSON.stringify([...input.venueIds].sort())
    )
      throw new DomainError('BAD_REQUEST', 'Scope has no changes')
    if (input.merchantId) {
      const merchant = await tx.merchant.findUnique({ where: { id: input.merchantId } })
      if (!merchant || merchant.deletedAt)
        throw new DomainError('PRECONDITION_FAILED', 'Active merchant required')
      await tx.merchant.update({
        where: { id: merchant.id },
        data: { updatedAt: new Date(Math.max(Date.now(), merchant.updatedAt.getTime() + 1)) },
      })
    }
    for (const venueId of input.venueIds) {
      const { venue } = await activeVenue(tx, venueId)
      if (venue.merchantId !== input.merchantId || !isSelectableCatalogueVenue(venue))
        throw new DomainError('PRECONDITION_FAILED', 'Current verified merchant occupancy required')
    }
    await tx.dealVenue.deleteMany({ where: { dealId: id } })
    if (input.venueIds.length)
      await tx.dealVenue.createMany({
        data: input.venueIds.map((venueId) => ({ dealId: id, venueId })),
      })
    return {
      data: {
        applicability: input.applicability,
        merchantId: input.merchantId,
        ...invalidateReview,
        contentVersion: deal.contentVersion + 1,
      },
      action: 'DEAL_OUTLETS_CHANGED',
      changedFields: ['applicability', 'merchantId', 'venueIds'],
    }
  })
}
