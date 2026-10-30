import type { AuthenticatedActor } from '@api/modules/account/security-access'
import { isSelectableCatalogueVenue } from '@api/modules/deals/outlet-eligibility'
import { DomainError } from '@api/modules/domain-error'
import { fenceDraftEvidence } from '@api/modules/ingestion/draft-evidence'
import { importedDealScope } from '@api/modules/ingestion/review-policy'
import { appendAdminAudit } from '@api/modules/platform-admin/audit'
import { legacyVersionWhere, normalizeVersion } from '@api/modules/platform-admin/operation-version'
import {
  accessTransaction,
  type Database,
  requireCurrentAdmin,
} from '@api/modules/platform-admin/transaction'
import { activeVenue } from '@api/modules/platform-admin/venues'
import type { IngestionOutletAssociationRequest } from '@broke-oclock/contracts/ingestion'

export const associateDraftOutlet = async (
  db: Database,
  actor: AuthenticatedActor,
  dealId: string,
  input: IngestionOutletAssociationRequest,
  now: Date,
) =>
  accessTransaction(db, async (tx) => {
    const admin = await requireCurrentAdmin(tx, actor)
    const expectedOperationVersion = input.expectedOperationVersion ?? 0
    const deal = await tx.deal.findFirst({
      where: { ...importedDealScope, id: dealId },
      include: { sources: { include: { importedPost: true } }, venues: true },
    })
    if (!deal) throw new DomainError('NOT_FOUND')
    if (
      normalizeVersion(deal.operationVersion) !== expectedOperationVersion ||
      deal.reviewStatus !== 'PENDING' ||
      deal.contentVersion !== input.expectedContentVersion ||
      deal.publishedAt
    )
      throw new DomainError('CONFLICT', 'Draft changed or already reviewed')
    const unassociated =
      deal.applicability === 'NO_FIXED_LOCATION' &&
      deal.venues.length === 0 &&
      deal.merchantId === null
    const single =
      deal.applicability === 'SELECTED_OUTLETS' &&
      deal.venues.length === 1 &&
      deal.merchantId !== null
    if (!unassociated && !single)
      throw new DomainError('PRECONDITION_FAILED', 'Unsupported outlet association state')
    const existingLink = deal.venues[0]
    if (single && existingLink) {
      const previous = await activeVenue(tx, existingLink.venueId)
      if (previous.merchant.id !== deal.merchantId)
        throw new DomainError('PRECONDITION_FAILED', 'Inconsistent outlet merchant')
      if (previous.venue.id === input.venueId)
        throw new DomainError('PRECONDITION_FAILED', 'Outlet selection is unchanged')
    }
    const { venue, merchant } = await activeVenue(tx, input.venueId)
    if (!isSelectableCatalogueVenue(venue))
      throw new DomainError('PRECONDITION_FAILED', 'Verified current outlet occupancy required')
    await fenceDraftEvidence(tx, deal.sources, now, true)
    const changed = await tx.deal.updateMany({
      where: {
        ...importedDealScope,
        id: deal.id,
        contentVersion: input.expectedContentVersion,
        reviewStatus: 'PENDING',
        AND: [
          legacyVersionWhere('operationVersion', expectedOperationVersion),
          { OR: [{ publishedAt: null }, { publishedAt: { isSet: false } }] },
        ],
      },
      data: {
        operationVersion: expectedOperationVersion + 1,
        merchantId: merchant.id,
        applicability: 'SELECTED_OUTLETS',
        contentVersion: { increment: 1 },
        scopeConfirmation: { unset: true },
        reviewedVersion: null,
        reviewedById: null,
        reviewedAt: null,
        reviewNote: null,
        publishedAt: null,
      },
    })
    if (changed.count !== 1) throw new DomainError('CONFLICT', 'Draft changed or already reviewed')
    if (single && existingLink) {
      const deleted = await tx.dealVenue.deleteMany({
        where: { id: existingLink.id, dealId: deal.id, venueId: existingLink.venueId },
      })
      if (deleted.count !== 1) throw new DomainError('CONFLICT', 'Outlet association changed')
    }
    await tx.dealVenue.create({ data: { dealId: deal.id, venueId: venue.id } })
    await appendAdminAudit(tx, admin, {
      action: 'DEAL_OUTLETS_CHANGED',
      subjectType: 'DEAL',
      subjectId: deal.id,
      note: 'Associate imported draft outlet',
      details: {
        operationVersionBefore: expectedOperationVersion,
        operationVersionAfter: expectedOperationVersion + 1,
        contentVersionBefore: deal.contentVersion,
        contentVersionAfter: deal.contentVersion + 1,
        changedFields: ['applicability', 'merchantId', 'venueIds'],
      },
    })
    return {
      id: deal.id,
      operationVersion: expectedOperationVersion + 1,
      contentVersion: deal.contentVersion + 1,
      reviewStatus: 'PENDING' as const,
      applicability: 'SELECTED_OUTLETS' as const,
      merchantId: merchant.id,
      outlet: {
        id: venue.id,
        name: venue.name,
        address: venue.address,
        merchantName: merchant.name,
      },
    }
  })
