import { imagesFor } from '@api/modules/deals/deal-images'
import {
  findDealSources,
  findRecentVotes,
  withOutletScopes,
} from '@api/modules/deals/deal-relations'
import { excludedPlacesIn, isExcludedVenue } from '@api/modules/deals/excluded-outlets'
import {
  eligibleVenuesForScope,
  type OutletPolicyVenue,
  type OutletScopeDeal,
  possibleVenuesForScope,
} from '@api/modules/deals/outlet-eligibility'
import { publicImportedImage } from '@api/modules/deals/public-images'
import {
  type CommunityPolicy,
  communityStatus,
  DEFAULT_COMMUNITY_POLICY,
} from '@broke-oclock/contracts/community-policy'
import type { DealPin, DealsQuery, DealVoteSummary } from '@broke-oclock/contracts/deals'
import type { db } from '@broke-oclock/db'

type Database = typeof db

const CENTS_PER_DOLLAR = 100
const DAY_MS = 86_400_000
// "While stocks last" and launch offers rarely publish an end, so they get a quiet shelf life.
export const OPEN_ENDED_IMPORT_DAYS = 60

type DealWhere = NonNullable<NonNullable<Parameters<Database['deal']['findMany']>[0]>['where']>

// On MongoDB a field that was never written is "missing", not null, and Prisma's `null`
// filter matches only an explicit null. Every optional-date check needs both branches.
const nullOrMissing = (field: string) => [{ [field]: null }, { [field]: { isSet: false } }]

// An imported claim with no end is a limited promotion, shown for OPEN_ENDED_IMPORT_DAYS from
// its known start, or from its source post when the start is unknown. The cut-off is never
// stored or shown as an end date.
const importedOpenEndedWhere = (now: Date): DealWhere => {
  const shelfStart = new Date(now.getTime() - OPEN_ENDED_IMPORT_DAYS * DAY_MS)
  return {
    origin: 'IMPORTED',
    OR: nullOrMissing('validUntil'),
    AND: [
      {
        OR: [
          { validFrom: { gt: shelfStart, lte: now } },
          {
            AND: [{ OR: nullOrMissing('validFrom') }],
            sources: {
              some: { importedPost: { is: { publishedAt: { gt: shelfStart, lte: now } } } },
            },
          },
        ],
      },
    ],
  }
}

// Imported current claims need a supported finite window or a recent limited-promotion start.
// Genuine user open-ended submissions retain their existing policy; no timestamp is invented.
export const publicCurrentWindowWhere = (now: Date): DealWhere => ({
  OR: [
    { origin: 'IMPORTED', validFrom: { not: null, lte: now }, validUntil: { not: null, gt: now } },
    importedOpenEndedWhere(now),
    {
      origin: 'USER_SUBMITTED',
      AND: [
        { OR: [...nullOrMissing('validFrom'), { validFrom: { lte: now } }] },
        { OR: [...nullOrMissing('validUntil'), { validUntil: { gt: now } }] },
      ],
    },
  ],
})

// Only approved, published, undeleted deals that can be placed on the map.
const eligibleDealWhere: DealWhere = {
  OR: nullOrMissing('deletedAt'),
  reviewStatus: 'APPROVED',
  publishedAt: { not: null },
  applicability: { in: ['SELECTED_OUTLETS', 'ALL_MERCHANT_OUTLETS'] },
}

const activeVenueWhere = { OR: nullOrMissing('deletedAt') }
const visibleCommentWhere = {
  AND: [{ OR: nullOrMissing('deletedAt') }, { OR: nullOrMissing('hiddenAt') }],
}

export const publicOutletVenueSelect = {
  id: true,
  merchantId: true,
  name: true,
  address: true,
  postalCode: true,
  latitude: true,
  longitude: true,
  catalogueKey: true,
  geographyPrecision: true,
  geographyEvidence: true,
  occupancyEvidence: true,
  deletedAt: true,
} as const

// Never filter selected edges before hashing: even a deleted outlet is part of the scope.
export const publicOutletScopeSelect = {
  id: true,
  merchantId: true,
  contentVersion: true,
  applicability: true,
  scopeConfirmation: true,
  venues: { select: { venueId: true, venue: { select: publicOutletVenueSelect } } },
  merchant: {
    select: {
      deletedAt: true,
      venues: { where: activeVenueWhere, select: publicOutletVenueSelect },
    },
  },
} as const

// The visitor's filters on top of eligibility. Imported windows need the source post's date,
// so this stays a database filter rather than being replayed in memory.
const publicDealFilterWhere = (query: DealsQuery, now: Date): DealWhere => ({
  ...eligibleDealWhere,
  ...(query.category ? { category: query.category } : {}),
  AND: [
    // A price cap keeps deals without a fixed price, such as 1-for-1 offers.
    ...(query.priceMaxMinor === undefined
      ? []
      : [{ OR: [{ priceMinor: null }, { priceMinor: { lte: query.priceMaxMinor } }] }]),
    ...(query.validNow === 'true' ? [publicCurrentWindowWhere(now)] : []),
  ],
})

// Imports publish in batches with the same timestamp; the id keeps their order stable.
const newestFirst = [{ publishedAt: 'desc' as const }, { id: 'desc' as const }]

// Scalars only. On MongoDB each nested relation would be another round trip run after its
// parent, so the loaders in deal-relations fetch outlets, images and votes side by side.
const publicDealScalarSelect = {
  id: true,
  merchantId: true,
  contentVersion: true,
  applicability: true,
  scopeConfirmation: true,
  title: true,
  category: true,
  cuisine: true,
  offerType: true,
  priceMinor: true,
  discountPercent: true,
  reviewedVersion: true,
  reviewedAt: true,
  publishedAt: true,
  description: true,
  terms: true,
  origin: true,
  validFrom: true,
  validUntil: true,
  rawValidityText: true,
  // Only comments that are neither deleted by their author nor hidden by moderation.
  _count: { select: { comments: { where: visibleCommentWhere } } },
} as const

// Ids of the eligible deals that match the visitor's filters, newest first.
export const findPublicDeals = (database: Database, query: DealsQuery, now: Date) =>
  database.deal.findMany({
    where: publicDealFilterWhere(query, now),
    orderBy: newestFirst,
    select: { id: true },
  })

const findDealScalars = (database: Database, where: DealWhere) =>
  database.deal.findMany({ where, orderBy: newestFirst, select: publicDealScalarSelect })

type DealScalarRow = Awaited<ReturnType<typeof findDealScalars>>[number]
type ScopedDealRow = Awaited<ReturnType<typeof withOutletScopes<DealScalarRow>>>[number]

// Image sources and current-window votes for the deals that may become pins.
const findPinRelations = async (
  database: Database,
  deals: readonly DealScalarRow[],
  now: Date,
  policy: CommunityPolicy,
) => {
  const dealIds = deals.map((deal) => deal.id)
  const [sourcesOf, votes] = await Promise.all([
    findDealSources(database, dealIds),
    findRecentVotes(database, dealIds, now, policy.windowHours),
  ])
  return new Map(dealIds.map((id) => [id, { sources: sourcesOf(id), votes: votes.get(id) ?? [] }]))
}

type PinRelations = Awaited<ReturnType<typeof findPinRelations>>

const toPins = (
  deals: readonly ScopedDealRow[],
  relations: PinRelations,
  policy: CommunityPolicy,
  now: Date,
): DealPin[] =>
  deals
    .flatMap((deal) => {
      const related = relations.get(deal.id)
      return related ? [toDealPin({ ...deal, ...related }, policy, now)] : []
    })
    .filter((deal) => deal.venues.length > 0)

// Category options come from every eligible deal that can be drawn, not just the filtered ones.
const categoriesOf = (deals: readonly ScopedDealRow[]): string[] =>
  [
    ...new Set(
      deals.filter((deal) => mapVenuesFor(deal).venues.length > 0).map((deal) => deal.category),
    ),
  ].sort()

type PublicDealRow = ScopedDealRow & NonNullable<ReturnType<PinRelations['get']>>

const formatPrice = (priceMinor: number): string => {
  const dollars = priceMinor / CENTS_PER_DOLLAR
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
}

// Short text for the coral pin: price, percentage, 1-for-1, or the title as a last resort.
export const pinLabelFor = (deal: PublicDealRow): string => {
  if (deal.offerType === 'FIXED_PRICE' && deal.priceMinor !== null)
    return formatPrice(deal.priceMinor)
  if (deal.offerType === 'PERCENT_OFF' && deal.discountPercent !== null)
    return `${deal.discountPercent}% off`
  if (deal.offerType === 'BUY_ONE_GET_ONE') return '1-for-1'
  return deal.title
}

export type PublicOutletScopeRow = Omit<OutletScopeDeal, 'selectedVenueIds'> & {
  venues: readonly { venueId: string; venue: OutletPolicyVenue }[]
  merchant: { deletedAt: Date | null; venues: readonly OutletPolicyVenue[] } | null
}

const scopeArgs = (deal: PublicOutletScopeRow) =>
  [
    { ...deal, selectedVenueIds: deal.venues.map((link) => link.venueId) },
    deal.applicability === 'ALL_MERCHANT_OUTLETS'
      ? (deal.merchant?.venues ?? [])
      : deal.venues.map((link) => link.venue),
    !!deal.merchant && deal.merchant.deletedAt == null,
  ] as const

export const publicVenuesFor = (deal: PublicOutletScopeRow) =>
  eligibleVenuesForScope(...scopeArgs(deal))

// Confirmed outlets when there are any. Otherwise every outlet the deal could cover, except
// those its terms rule out, flagged so the visitor knows the deal may not apply there.
export const mapVenuesFor = (deal: PublicOutletScopeRow & { terms?: string | null }) => {
  const confirmed = publicVenuesFor(deal)
  if (confirmed.length > 0) return { venues: confirmed, outletUnconfirmed: false }
  const excluded = excludedPlacesIn(deal.terms)
  const venues = possibleVenuesForScope(...scopeArgs(deal)).filter(
    (venue) => !isExcludedVenue(venue, excluded),
  )
  return { venues, outletUnconfirmed: true }
}

// Labels an imported offer with no published end, without revealing its shelf-life cut-off.
export const isLimitedTime = (deal: {
  origin: 'IMPORTED' | 'USER_SUBMITTED'
  validUntil: Date | null
}): boolean => deal.origin === 'IMPORTED' && deal.validUntil === null

export const isCurrentApproval = (deal: {
  contentVersion: number
  reviewedVersion: number | null
}): boolean => deal.reviewedVersion === deal.contentVersion

// Deal-wide tallies of the current votes; each user holds at most one vote per deal.
export const countVotes = (votes: readonly { value: 'ALIVE' | 'DEAD' }[]): DealVoteSummary => ({
  alive: votes.filter((vote) => vote.value === 'ALIVE').length,
  dead: votes.filter((vote) => vote.value === 'DEAD').length,
})

const currentVotes = (deal: PublicDealRow) => {
  const publication = deal.reviewedAt ?? deal.publishedAt ?? new Date(0)
  return countVotes(deal.votes.filter((vote) => vote.updatedAt >= publication))
}

// Pins for the visitor's filters. Outlets, images and votes load together once the deals are known.
export const findPublicDealPins = async (
  database: Database,
  query: DealsQuery,
  now: Date,
  policy: CommunityPolicy = DEFAULT_COMMUNITY_POLICY,
): Promise<DealPin[]> => {
  const deals = (await findDealScalars(database, publicDealFilterWhere(query, now))).filter(
    isCurrentApproval,
  )
  const [scoped, relations] = await Promise.all([
    withOutletScopes(database, deals),
    findPinRelations(database, deals, now, policy),
  ])
  return toPins(scoped, relations, policy, now)
}

// The browse response. Categories need outlet scopes for every eligible deal, which already
// cover the filtered ones, so scopes load once and the filter is a cheap id-only read.
export const findPublicBrowse = async (
  database: Database,
  query: DealsQuery,
  now: Date,
  policy: CommunityPolicy = DEFAULT_COMMUNITY_POLICY,
): Promise<{ items: DealPin[]; categories: string[] }> => {
  const [eligible, matching] = await Promise.all([
    findDealScalars(database, eligibleDealWhere),
    findPublicDeals(database, query, now),
  ])
  const matchingIds = new Set(matching.map((deal) => deal.id))
  const approved = eligible.filter(isCurrentApproval)
  const [scoped, relations] = await Promise.all([
    withOutletScopes(database, approved),
    findPinRelations(
      database,
      approved.filter((deal) => matchingIds.has(deal.id)),
      now,
      policy,
    ),
  ])
  return { items: toPins(scoped, relations, policy, now), categories: categoriesOf(scoped) }
}

// One public deal by id, as browse would show it; null when it is not public.
export const findPublicDealPin = async (
  database: Database,
  dealId: string,
  now: Date,
  policy: CommunityPolicy = DEFAULT_COMMUNITY_POLICY,
): Promise<DealPin | null> => {
  const deals = (await findDealScalars(database, { ...eligibleDealWhere, id: dealId })).filter(
    isCurrentApproval,
  )
  if (deals.length === 0) return null
  const [scoped, relations] = await Promise.all([
    withOutletScopes(database, deals),
    findPinRelations(database, deals, now, policy),
  ])
  return toPins(scoped, relations, policy, now)[0] ?? null
}

export const toDealPin = (
  deal: PublicDealRow,
  policy: CommunityPolicy = DEFAULT_COMMUNITY_POLICY,
  now = new Date(),
): DealPin => {
  const outlets = mapVenuesFor(deal)
  return {
    id: deal.id,
    title: deal.title,
    category: deal.category,
    cuisine: deal.cuisine,
    label: pinLabelFor(deal),
    description: deal.description,
    offerType: deal.offerType,
    priceMinor: deal.priceMinor,
    discountPercent: deal.discountPercent,
    terms: deal.terms,
    ...publicImportedImage(deal),
    images: imagesFor(deal),
    ...(deal.validFrom ? { validFrom: deal.validFrom.toISOString() } : {}),
    validUntil: deal.validUntil?.toISOString() ?? null,
    rawValidityText: deal.rawValidityText,
    ...(isLimitedTime(deal) ? { limitedTime: true } : {}),
    ...(outlets.outletUnconfirmed ? { outletUnconfirmed: true } : {}),
    votes: {
      ...currentVotes(deal),
      status: communityStatus(
        currentVotes(deal),
        deal.validUntil?.toISOString() ?? null,
        now,
        policy,
      ),
    },
    commentCount: deal._count.comments,
    venues: outlets.venues.map((venue) => ({
      id: venue.id,
      name: venue.name,
      lat: venue.latitude,
      lng: venue.longitude,
    })),
  }
}
