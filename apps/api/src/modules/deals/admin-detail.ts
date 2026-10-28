import {
  contentReady,
  currentScopeReceipt,
  physicalReady,
  physicalScope,
} from '@api/modules/deals/admin-policy'
import { summary } from '@api/modules/deals/admin-read'
import { type AdminDealRecord, loadAdminDeal } from '@api/modules/deals/admin-write'
import { hasVerifiedGeography, hasVerifiedOccupancy } from '@api/modules/deals/outlet-eligibility'
import { DomainError } from '@api/modules/domain-error'
import type { Database } from '@api/modules/platform-admin/transaction'
export const safeAdminLink = (value: string) => {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? value
      : null
  } catch {
    return null
  }
}
export const detailProjection = async (
  db: Pick<Database, 'venue' | 'adminEvidence' | 'merchant'>,
  deal: AdminDealRecord,
  input: { limit: number; outletCursor?: string } = { limit: 20 },
) => {
  const selectedVenueIds = deal.venues.map((link) => link.venueId)
  const candidates =
    deal.applicability === 'ALL_MERCHANT_OUTLETS' && deal.merchantId
      ? await db.venue.findMany({ where: { merchantId: deal.merchantId }, orderBy: { id: 'desc' } })
      : deal.venues.map((link) => link.venue).sort((a, b) => b.id.localeCompare(a.id))
  const page = candidates
    .filter((venue) => !input.outletCursor || venue.id < input.outletCursor)
    .slice(0, input.limit + 1)
  const receipt = await currentScopeReceipt(db, deal)
  const scopeConfirmed = !!receipt
  const valid = contentReady(deal)
  const physical = await physicalReady(db, deal)
  const blockers = [
    ...(deal.deletedAt ? ['DELETED_INVESTIGATION_ONLY'] : []),
    ...(!valid ? ['CONTENT_OR_SOURCE_NOT_READY'] : []),
    ...(!scopeConfirmed ? ['CURRENT_SCOPE_EVIDENCE_REQUIRED_FOR_PUBLICATION'] : []),
    ...(!physical ? ['COMPLETE_PHYSICAL_EVIDENCE_REQUIRED'] : []),
  ]
  const approvalReady =
    !deal.deletedAt && valid && (!physicalScope(deal) || (scopeConfirmed && physical))
  return {
    ...summary(deal),
    description: deal.description,
    terms: deal.terms,
    category: deal.category,
    cuisine: deal.cuisine,
    offerType: deal.offerType,
    priceMinor: deal.priceMinor,
    currency: deal.currency,
    discountPercent: deal.discountPercent,
    rawValidityText: deal.rawValidityText,
    applicability: deal.applicability,
    submittedById: deal.submittedById,
    reviewedById: deal.reviewedById,
    reviewedVersion: deal.reviewedVersion,
    reviewedAt: deal.reviewedAt?.toISOString() ?? null,
    reviewNote: deal.reviewNote,
    sources: deal.sources.map((source) => ({
      citationId: source.id,
      sourceUrl: safeAdminLink(source.sourceUrl),
      sourceContentHash: source.sourceContentHash,
      sourceContentSnapshot: source.sourceContentSnapshot,
      current:
        source.sourceContentHash === source.importedPost.contentHash &&
        !source.importedPost.errorCode,
    })),
    images: [
      ...deal.images.map((image) => ({ url: safeAdminLink(image.url), mimeType: image.mimeType })),
      ...deal.sources.flatMap((source) =>
        source.images.map((link) => ({
          url: link.image.hostedUrl
            ? safeAdminLink(link.image.hostedUrl)
            : safeAdminLink(link.sourceUrl),
          mimeType: link.image.mimeType,
        })),
      ),
    ],
    outlets: page.slice(0, input.limit).map((venue) => ({
      id: venue.id,
      name: venue.name,
      address: venue.address,
      merchantId: venue.merchantId,
      deletedAt: venue.deletedAt?.toISOString() ?? null,
      geographyReady: hasVerifiedGeography(venue),
      occupancyReady: hasVerifiedOccupancy(venue),
    })),
    outletCount: candidates.length,
    nextOutletCursor: page.length > input.limit ? (page[input.limit - 1]?.id ?? null) : null,
    selectedVenueIds: selectedVenueIds.length <= 100 ? selectedVenueIds : null,
    scopeEditable: selectedVenueIds.length <= 100,
    scopeConfirmed,
    blockers,
    approvalReady,
    publicationReady: approvalReady && scopeConfirmed,
    scopeEvidenceLabel: receipt
      ? deal.origin === 'USER_SUBMITTED'
        ? 'Submission evidence'
        : 'Pinned source evidence'
      : null,
  }
}
export const getAdminDealDetail = async (
  db: Database,
  id: string,
  query: { limit: number; outletCursor?: string },
) => {
  const deal = await loadAdminDeal(db, id)
  if (!deal) throw new DomainError('NOT_FOUND')
  return detailProjection(db, deal, query)
}
