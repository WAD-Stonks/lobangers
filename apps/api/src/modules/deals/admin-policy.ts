import type { AdminDealRecord } from '@api/modules/deals/admin-write'
import {
  hasConfirmedOutletScope,
  hasVerifiedGeography,
  hasVerifiedOccupancy,
  outletScopeHash,
} from '@api/modules/deals/outlet-eligibility'
import { DomainError } from '@api/modules/domain-error'
import { hasCurrentSourceScope, isReviewReady } from '@api/modules/ingestion/review-policy'
import type { AccessTransaction, Database } from '@api/modules/platform-admin/transaction'
import { activeVenue } from '@api/modules/platform-admin/venues'
export const physicalScope = (deal: AdminDealRecord) =>
  deal.applicability === 'SELECTED_OUTLETS' || deal.applicability === 'ALL_MERCHANT_OUTLETS'
export const scopeTuple = (deal: AdminDealRecord) => ({
  ...deal,
  selectedVenueIds: deal.venues.map((v) => v.venueId),
})
export const contentReady = (deal: AdminDealRecord, now = new Date()) =>
  deal.origin === 'IMPORTED'
    ? isReviewReady(deal, now)
    : !!deal.submittedBy &&
      (!deal.validUntil || deal.validUntil > now) &&
      (!deal.validFrom || !deal.validUntil || deal.validFrom < deal.validUntil) &&
      (deal.offerType !== 'FIXED_PRICE' ||
        (deal.priceMinor != null && deal.priceMinor >= 0 && deal.priceMinor <= 1_000_000)) &&
      (deal.offerType !== 'PERCENT_OFF' ||
        (deal.discountPercent != null && deal.discountPercent > 0 && deal.discountPercent <= 100))
export const currentScopeReceipt = async (
  db: Pick<Database, 'adminEvidence'>,
  deal: AdminDealRecord,
) => {
  if (
    !hasConfirmedOutletScope(scopeTuple(deal)) ||
    deal.scopeConfirmation?.basis === 'LEGACY_RETAINED'
  )
    return null
  const ref = deal.scopeConfirmation?.evidenceRef ?? ''
  if (!/^admin-evidence:[a-f0-9]{24}$/.test(ref)) return null
  const receipt = await db.adminEvidence.findUnique({
    where: { id: ref.slice('admin-evidence:'.length) },
  })
  if (
    receipt?.subjectType !== 'DEAL' ||
    receipt.subjectId !== deal.id ||
    receipt.kind !== 'SCOPE' ||
    receipt.contentVersion !== deal.contentVersion ||
    receipt.subjectHash !== outletScopeHash(scopeTuple(deal)) ||
    receipt.basis !== deal.scopeConfirmation?.basis
  )
    return null
  if (deal.origin === 'IMPORTED') {
    if (
      !hasCurrentSourceScope(deal) ||
      !deal.sources.some(
        (s) =>
          s.id === receipt.citationId &&
          s.sourceContentHash === receipt.sourceContentHash &&
          s.sourceUrl === receipt.sourceUrl &&
          s.sourceContentHash === s.importedPost.contentHash &&
          !s.importedPost.errorCode,
      )
    )
      return null
  } else if (!deal.submittedBy || receipt.citationId !== null || !receipt.reference.trim())
    return null
  return receipt
}
export const completePhysicalCandidates = (db: Pick<Database, 'venue'>, deal: AdminDealRecord) =>
  deal.applicability === 'ALL_MERCHANT_OUTLETS' && deal.merchantId
    ? db.venue.findMany({
        where: {
          merchantId: deal.merchantId,
          OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
        },
      })
    : Promise.resolve(deal.venues.map((link) => link.venue))
export const physicalReady = async (
  db: Pick<Database, 'venue' | 'merchant'>,
  deal: AdminDealRecord,
) => {
  if (!physicalScope(deal)) return true
  if (!deal.merchantId) return false
  const merchant = await db.merchant.findUnique({ where: { id: deal.merchantId } })
  const venues = await completePhysicalCandidates(db, deal)
  return (
    !!merchant &&
    !merchant.deletedAt &&
    venues.length > 0 &&
    venues.every(
      (v) =>
        !v.deletedAt &&
        v.merchantId === deal.merchantId &&
        hasVerifiedGeography(v) &&
        hasVerifiedOccupancy(v),
    )
  )
}
export const fencePhysicalScope = async (tx: AccessTransaction, deal: AdminDealRecord) => {
  if (!physicalScope(deal)) return
  if (!deal.merchantId) throw new DomainError('PRECONDITION_FAILED', 'Merchant required')
  const merchant = await tx.merchant.findUnique({ where: { id: deal.merchantId } })
  if (!merchant || merchant.deletedAt)
    throw new DomainError('PRECONDITION_FAILED', 'Active merchant required')
  // Touch parent before querying dynamic membership: all catalogue writers must touch this parent too.
  await tx.merchant.update({
    where: { id: merchant.id },
    data: { updatedAt: new Date(Math.max(Date.now(), merchant.updatedAt.getTime() + 1)) },
  })
  const venues = await completePhysicalCandidates(tx, deal)
  if (!venues.length)
    throw new DomainError('PRECONDITION_FAILED', 'Complete physical scope required')
  for (const venue of venues) {
    const current = await activeVenue(tx, venue.id)
    if (current.venue.merchantId !== deal.merchantId)
      throw new DomainError('PRECONDITION_FAILED', 'Outlet merchant mismatch')
  }
  if (!(await physicalReady(tx, deal)))
    throw new DomainError(
      'PRECONDITION_FAILED',
      'Every outlet needs current geography and occupancy evidence',
    )
}
