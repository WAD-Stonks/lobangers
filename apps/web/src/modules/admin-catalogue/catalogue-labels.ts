import type { CatalogueVenue, CatalogueVenueDetail } from '@broke-oclock/contracts/admin-catalogue'
import { formatDate } from '@web/lib/format'

export type EvidenceKind = 'GEOGRAPHY' | 'OCCUPANCY'

export const countLabel = (count: number, noun: string) =>
  `${count.toLocaleString('en-SG')} ${noun}${count === 1 ? '' : 's'}`

export const checkName: Record<EvidenceKind, string> = {
  GEOGRAPHY: 'location',
  OCCUPANCY: 'occupancy',
}

const providers: Record<string, string> = {
  ONEMAP: 'OneMap',
  GOOGLE_PLACES: 'Google Places',
  OFFICIAL_MERCHANT: 'Merchant source',
  OFFICIAL_PROPERTY: 'Property source',
  ADMIN: 'Admin check',
  DATABASE_SNAPSHOT: 'Imported record',
}
export const providerLabel = (provider: string | null) =>
  provider ? (providers[provider] ?? provider) : 'Unknown source'

export const missingChecks = (venue: CatalogueVenue): EvidenceKind[] => [
  ...(venue.occupancyVerified ? [] : (['OCCUPANCY'] as const)),
  ...(venue.geographyVerified ? [] : (['GEOGRAPHY'] as const)),
]

export const missingSummary = (venue: CatalogueVenue) => {
  const missing = missingChecks(venue)
  if (!missing.length) return ''
  return `Needs ${missing.map((kind) => checkName[kind]).join(' and ')}`
}

export const latestReceipt = (venue: CatalogueVenueDetail, kind: EvidenceKind) => {
  const receipt = venue.evidence.find((item) => item.kind === kind)
  if (!receipt) return ''
  return [providerLabel(receipt.provider), formatDate(receipt.recordedAt), receipt.actorName].join(
    ' · ',
  )
}

export type Readiness = { tone: 'ready' | 'partial' | 'blocked'; title: string; detail: string }

export const readiness = (venue: CatalogueVenue): Readiness => {
  if (venue.archived)
    return {
      tone: 'blocked',
      title: 'Archived',
      detail: 'It can’t be picked for new deals.',
    }
  if (venue.parentArchived)
    return {
      tone: 'blocked',
      title: 'Merchant archived',
      detail: 'Outlets of an archived merchant can’t be picked for new deals.',
    }
  if (venue.geographyPrecision !== 'PROPERTY' && venue.geographyPrecision !== 'OUTLET')
    return {
      tone: 'blocked',
      title: 'Not ready for deals',
      detail: 'Set the point precision in the details, then verify occupancy and location.',
    }
  if (venue.selectable && venue.geographyVerified)
    return {
      tone: 'ready',
      title: 'Ready for deals',
      detail: 'Deals can pick this outlet and show it on the map.',
    }
  if (venue.selectable)
    return {
      tone: 'partial',
      title: 'Deals can pick this outlet',
      detail: 'Verify the location too so its deals show on the map.',
    }
  return {
    tone: 'blocked',
    title: 'Not ready for deals',
    detail: venue.geographyVerified
      ? 'Verify occupancy so deals can pick this outlet.'
      : 'Verify occupancy so deals can pick this outlet, and location so they show on the map.',
  }
}
