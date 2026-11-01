import { createHash } from 'node:crypto'
import type {
  DealApplicability,
  OutletGeographyPrecision,
  OutletScopeConfirmation,
  OutletVerificationEvidence,
} from '@broke-oclock/db/client'

/** Server-owned stored identity. Optional null/unset metadata is equally unknown. */
export type OutletPolicyVenue = {
  id: string
  merchantId: string
  name: string
  address: string
  postalCode?: string | null
  latitude: number
  longitude: number
  catalogueKey?: string | null
  geographyPrecision?: OutletGeographyPrecision | null
  geographyEvidence?: OutletVerificationEvidence | null
  occupancyEvidence?: OutletVerificationEvidence | null
  deletedAt?: Date | null
}

export type OutletScopeDeal = {
  id: string
  merchantId?: string | null
  applicability: DealApplicability
  contentVersion: number
  scopeConfirmation?: OutletScopeConfirmation | null
  /** Complete edge set, including deleted/unverified venues; never a display subset. */
  selectedVenueIds: readonly string[]
}

const hash = (tuple: readonly unknown[]) =>
  createHash('sha256').update(JSON.stringify(tuple)).digest('hex')

const venueTuple = (venue: OutletPolicyVenue) => [
  venue.id,
  venue.merchantId,
  venue.name,
  venue.address,
  venue.postalCode ?? null,
  venue.latitude,
  venue.longitude,
  venue.catalogueKey ?? null,
  venue.geographyPrecision ?? null,
]

export const outletScopeHash = (deal: OutletScopeDeal): string =>
  hash([
    'outlet-scope:v1',
    deal.applicability,
    deal.merchantId ?? null,
    [...new Set(deal.selectedVenueIds)].sort(),
  ])

export const geographySubjectHash = (venue: OutletPolicyVenue): string =>
  hash(['outlet-geography:v1', ...venueTuple(venue)])

const nonemptyReceipt = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 2048

const validDate = (value: unknown): value is Date =>
  value instanceof Date && Number.isFinite(value.getTime())

const geographyProviders = new Set([
  'ONEMAP',
  'GOOGLE_PLACES',
  'OFFICIAL_MERCHANT',
  'OFFICIAL_PROPERTY',
  'ADMIN',
])

const currentProof = (
  evidence: OutletVerificationEvidence | null | undefined,
  subjectHash: string,
): evidence is OutletVerificationEvidence =>
  !!evidence && evidence.subjectHash === subjectHash && nonemptyReceipt(evidence.reference)

const hasCoordinates = (venue: OutletPolicyVenue): boolean =>
  Number.isFinite(venue.latitude) &&
  Math.abs(venue.latitude) <= 90 &&
  Number.isFinite(venue.longitude) &&
  Math.abs(venue.longitude) <= 180

// General geographic validity, deliberately not Singapore-only evidence matching.
const hasUsablePoint = (venue: OutletPolicyVenue): boolean =>
  hasCoordinates(venue) &&
  (venue.geographyPrecision === 'PROPERTY' || venue.geographyPrecision === 'OUTLET')

export const hasVerifiedGeography = (venue: OutletPolicyVenue): boolean => {
  const evidence = venue.geographyEvidence
  return (
    hasUsablePoint(venue) &&
    currentProof(evidence, geographySubjectHash(venue)) &&
    evidence.state === 'VERIFIED' &&
    geographyProviders.has(evidence.provider) &&
    validDate(evidence.verifiedAt)
  )
}

export const hasConfirmedOutletScope = (deal: OutletScopeDeal): boolean => {
  const confirmation = deal.scopeConfirmation
  if (
    !confirmation ||
    !nonemptyReceipt(confirmation.evidenceRef) ||
    !Number.isSafeInteger(deal.contentVersion) ||
    deal.contentVersion < 1 ||
    !deal.selectedVenueIds.every(nonemptyReceipt) ||
    confirmation.contentVersion !== deal.contentVersion ||
    confirmation.scopeHash !== outletScopeHash(deal) ||
    !Array.isArray(confirmation.retainedVenueIds) ||
    !confirmation.retainedVenueIds.every(nonemptyReceipt) ||
    (confirmation.reasonCode != null &&
      (!nonemptyReceipt(confirmation.reasonCode) || confirmation.reasonCode.length > 128))
  )
    return false
  if (confirmation.basis === 'LEGACY_RETAINED') {
    const retained = confirmation.retainedVenueIds
    if (deal.applicability === 'ONLINE' || deal.applicability === 'NO_FIXED_LOCATION') {
      return deal.selectedVenueIds.length === 0 && retained.length === 0
    }
    if (!nonemptyReceipt(deal.merchantId) || retained.length === 0) return false
    if (deal.applicability === 'ALL_MERCHANT_OUTLETS') return deal.selectedVenueIds.length === 0
    return (
      deal.applicability === 'SELECTED_OUTLETS' &&
      retained.every((id) => deal.selectedVenueIds.includes(id))
    )
  }
  if (
    confirmation.retainedVenueIds.length !== 0 ||
    (confirmation.confirmedAt != null && !validDate(confirmation.confirmedAt))
  )
    return false
  if (confirmation.basis === 'SOURCE_NONSPATIAL') {
    return (
      (deal.applicability === 'ONLINE' || deal.applicability === 'NO_FIXED_LOCATION') &&
      deal.selectedVenueIds.length === 0
    )
  }
  if (!nonemptyReceipt(deal.merchantId)) return false
  if (confirmation.basis === 'SOURCE_ALL') {
    return (
      (deal.applicability === 'ALL_MERCHANT_OUTLETS' && deal.selectedVenueIds.length === 0) ||
      (deal.applicability === 'SELECTED_OUTLETS' && deal.selectedVenueIds.length > 0)
    )
  }
  return (
    confirmation.basis === 'SOURCE_SELECTED' &&
    deal.applicability === 'SELECTED_OUTLETS' &&
    deal.selectedVenueIds.length > 0
  )
}

const occupancyProviders = new Set(['OFFICIAL_MERCHANT', 'OFFICIAL_PROPERTY', 'ADMIN'])

export const hasVerifiedOccupancy = (venue: OutletPolicyVenue): boolean => {
  const evidence = venue.occupancyEvidence
  return (
    hasUsablePoint(venue) &&
    currentProof(evidence, occupancySubjectHash(venue)) &&
    evidence.state === 'VERIFIED' &&
    occupancyProviders.has(evidence.provider) &&
    validDate(evidence.verifiedAt)
  )
}

/** Selection for NEW associations/claims, not a historical-grant revocation policy. */
export const isSelectableCatalogueVenue = (venue: OutletPolicyVenue): boolean =>
  venue.deletedAt == null && hasVerifiedOccupancy(venue)

const hasRetainedProof = (
  evidence: OutletVerificationEvidence | null | undefined,
  subjectHash: string,
): boolean =>
  currentProof(evidence, subjectHash) &&
  evidence.state === 'LEGACY_RETAINED' &&
  evidence.provider === 'DATABASE_SNAPSHOT'

/** Pure projection only: callers own approval/time/role policy and authoritative loading. */
export const eligibleVenuesForScope = <Venue extends OutletPolicyVenue>(
  deal: OutletScopeDeal,
  candidateVenues: readonly Venue[],
  merchantActive: boolean,
): Venue[] => {
  if (
    !merchantActive ||
    !hasConfirmedOutletScope(deal) ||
    (deal.applicability !== 'SELECTED_OUTLETS' && deal.applicability !== 'ALL_MERCHANT_OUTLETS')
  )
    return []
  const selected = new Set(deal.selectedVenueIds)
  const legacy = deal.scopeConfirmation?.basis === 'LEGACY_RETAINED'
  const retained = new Set(deal.scopeConfirmation?.retainedVenueIds)
  const seen = new Set<string>()
  return candidateVenues.filter((venue) => {
    if (
      seen.has(venue.id) ||
      venue.deletedAt != null ||
      venue.merchantId !== deal.merchantId ||
      (deal.applicability === 'SELECTED_OUTLETS' && !selected.has(venue.id)) ||
      !hasUsablePoint(venue)
    )
      return false
    if (legacy) {
      if (
        !retained.has(venue.id) ||
        !(
          hasVerifiedGeography(venue) ||
          hasRetainedProof(venue.geographyEvidence, geographySubjectHash(venue))
        ) ||
        !(
          hasVerifiedOccupancy(venue) ||
          hasRetainedProof(venue.occupancyEvidence, occupancySubjectHash(venue))
        )
      )
        return false
    } else if (!hasVerifiedGeography(venue) || !hasVerifiedOccupancy(venue)) return false
    seen.add(venue.id)
    return true
  })
}

/**
 * Map fallback for a deal whose outlets are unconfirmed: every live outlet it could cover, at
 * its stored coordinates, without proof. Callers must flag the result as unconfirmed.
 */
export const possibleVenuesForScope = <Venue extends OutletPolicyVenue>(
  deal: OutletScopeDeal,
  candidateVenues: readonly Venue[],
  merchantActive: boolean,
): Venue[] => {
  if (
    !merchantActive ||
    !nonemptyReceipt(deal.merchantId) ||
    (deal.applicability !== 'SELECTED_OUTLETS' && deal.applicability !== 'ALL_MERCHANT_OUTLETS')
  )
    return []
  const selected = new Set(deal.selectedVenueIds)
  const seen = new Set<string>()
  return candidateVenues.filter((venue) => {
    if (
      seen.has(venue.id) ||
      venue.deletedAt != null ||
      venue.merchantId !== deal.merchantId ||
      (deal.applicability === 'SELECTED_OUTLETS' && !selected.has(venue.id)) ||
      !hasCoordinates(venue)
    )
      return false
    seen.add(venue.id)
    return true
  })
}

export const occupancySubjectHash = (venue: OutletPolicyVenue): string =>
  hash(['outlet-occupancy:v1', ...venueTuple(venue)])
