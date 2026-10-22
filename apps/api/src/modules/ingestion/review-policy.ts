import {
  hasConfirmedOutletScope,
  hasVerifiedGeography,
  hasVerifiedOccupancy,
  type OutletPolicyVenue,
  type OutletScopeDeal,
} from '@api/modules/deals/outlet-eligibility'
import { DomainError } from '@api/modules/domain-error'
import { MONEYDIGEST_SOURCE } from '@api/modules/ingestion/source'
import type { AccessTransaction } from '@api/modules/platform-admin/transaction'
import { activeRecord, activeVenue } from '@api/modules/platform-admin/venues'
export const importedDealScope = {
  origin: 'IMPORTED' as const,
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
  sources: {
    some: {
      importedPost: {
        source: {
          OR: [
            { provider: MONEYDIGEST_SOURCE.provider, externalId: MONEYDIGEST_SOURCE.externalId },
            { provider: 'WORDPRESS' as const, externalId: 'scoobifydaily.wordpress.com' },
            { provider: 'TELEGRAM' as const, externalId: 'ThisCounted' },
            { provider: 'TELEGRAM' as const, url: { startsWith: 'https://t.me/s/' } },
          ],
        },
      },
    },
  },
}
type ScopeReviewDeal = Omit<OutletScopeDeal, 'selectedVenueIds'> & {
  venues: { venueId: string }[]
  sources: {
    sourceUrl: string
    sourceContentHash: string
    importedPost: { contentHash: string; errorCode: string | null }
  }[]
}

// A stored receipt must still bind a pinned, unchanged source; UI/search inputs are not proof.
export const hasCurrentSourceScope = (deal: ScopeReviewDeal): boolean =>
  hasConfirmedOutletScope({ ...deal, selectedVenueIds: deal.venues.map((link) => link.venueId) }) &&
  deal.scopeConfirmation?.basis !== 'LEGACY_RETAINED' &&
  deal.sources.some(
    (source) =>
      source.sourceContentHash === deal.scopeConfirmation?.sourceContentHash &&
      source.sourceUrl === deal.scopeConfirmation?.sourceUrl &&
      source.sourceContentHash === source.importedPost.contentHash &&
      !source.importedPost.errorCode,
  )

// The complete selected edge set, never the bounded display list, drives readiness.
export const hasVerifiedPhysicalScope = (
  deal: ScopeReviewDeal,
  venues: readonly OutletPolicyVenue[],
  merchantActive: boolean,
): boolean => {
  if (
    !merchantActive ||
    !hasCurrentSourceScope(deal) ||
    !deal.merchantId ||
    (deal.applicability !== 'SELECTED_OUTLETS' && deal.applicability !== 'ALL_MERCHANT_OUTLETS') ||
    !venues.length
  )
    return false
  const ids = new Set(venues.map((venue) => venue.id))
  if (
    deal.applicability === 'SELECTED_OUTLETS' &&
    deal.venues.some((link) => !ids.has(link.venueId))
  )
    return false
  return venues.every(
    (venue) =>
      venue.deletedAt == null &&
      venue.merchantId === deal.merchantId &&
      hasVerifiedGeography(venue) &&
      hasVerifiedOccupancy(venue),
  )
}

// Physical approval requires source scope plus current write-fenced outlet authority.
// Nonspatial content review and rejection do not require map points.
export const requireSelectedOutletAuthority = async (
  tx: AccessTransaction,
  deal: ScopeReviewDeal,
) => {
  if (deal.applicability !== 'SELECTED_OUTLETS' && deal.applicability !== 'ALL_MERCHANT_OUTLETS')
    return
  if (!hasCurrentSourceScope(deal))
    throw new DomainError('PRECONDITION_FAILED', 'Current source-confirmed outlet scope required')
  if (!deal.merchantId)
    throw new DomainError('PRECONDITION_FAILED', 'Physical outlet merchant required')
  const links =
    deal.applicability === 'SELECTED_OUTLETS'
      ? deal.venues
      : (
          await tx.venue.findMany({
            where: { ...activeRecord, merchantId: deal.merchantId },
            select: { id: true },
          })
        ).map((venue) => ({ venueId: venue.id }))
  if (!links.length) throw new DomainError('PRECONDITION_FAILED', 'Physical outlets required')
  const fencedVenues: OutletPolicyVenue[] = []
  for (const link of links) {
    const { venue, merchant } = await activeVenue(tx, link.venueId)
    if (merchant.id !== deal.merchantId)
      throw new DomainError('PRECONDITION_FAILED', 'Selected outlet merchant mismatch')
    fencedVenues.push(venue)
  }
  if (!hasVerifiedPhysicalScope(deal, fencedVenues, true))
    throw new DomainError(
      'PRECONDITION_FAILED',
      'Verified current geography and occupancy required',
    )
}
export const isReviewReady = (
  deal: {
    validFrom: Date | null
    validUntil: Date | null
    offerType: string
    priceMinor: number | null
    discountPercent: number | null
    sources: {
      sourceContentHash: string
      importedPost: { contentHash: string; errorCode: string | null }
    }[]
  },
  now: Date,
) =>
  Boolean(
    deal.validFrom &&
      deal.validUntil &&
      deal.validUntil > now &&
      deal.validFrom < deal.validUntil &&
      deal.sources.length &&
      deal.sources.every(
        (source) =>
          source.sourceContentHash === source.importedPost.contentHash &&
          !source.importedPost.errorCode,
      ) &&
      (deal.offerType !== 'FIXED_PRICE' || (deal.priceMinor !== null && deal.priceMinor >= 0)) &&
      (deal.offerType !== 'PERCENT_OFF' ||
        (deal.discountPercent !== null && deal.discountPercent > 0 && deal.discountPercent <= 100)),
  )
