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
export const OPEN_ENDED_IMPORT_DAYS = 60

type DealWhere = NonNullable<NonNullable<Parameters<Database['deal']['findMany']>[0]>['where']>

// On Mongo a never-written field is missing, not null, and Prisma's `null` filter only matches explicit null.
const nullOrMissing = (field: string) => [{ [field]: null }, { [field]: { isSet: false } }]

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

const publicDealFilterWhere = (query: DealsQuery, now: Date): DealWhere => ({
  ...eligibleDealWhere,
  ...(query.category ? { category: query.category } : {}),
  AND: [
    ...(query.priceMaxMinor === undefined
      ? []
      : [{ OR: [{ priceMinor: null }, { priceMinor: { lte: query.priceMaxMinor } }] }]),
    ...(query.validNow === 'true' ? [publicCurrentWindowWhere(now)] : []),
  ],
})

const newestFirst = [{ publishedAt: 'desc' as const }, { id: 'desc' as const }]

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
  _count: { select: { comments: { where: visibleCommentWhere } } },
} as const

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

export const mapVenuesFor = (deal: PublicOutletScopeRow & { terms?: string | null }) => {
  const confirmed = publicVenuesFor(deal)
  if (confirmed.length > 0) return { venues: confirmed, outletUnconfirmed: false }
  const excluded = excludedPlacesIn(deal.terms)
  const venues = possibleVenuesForScope(...scopeArgs(deal)).filter(
    (venue) => !isExcludedVenue(venue, excluded),
  )
  return { venues, outletUnconfirmed: true }
}

export const isLimitedTime = (deal: {
  origin: 'IMPORTED' | 'USER_SUBMITTED'
  validUntil: Date | null
}): boolean => deal.origin === 'IMPORTED' && deal.validUntil === null

export const isCurrentApproval = (deal: {
  contentVersion: number
  reviewedVersion: number | null
}): boolean => deal.reviewedVersion === deal.contentVersion

export const countVotes = (votes: readonly { value: 'ALIVE' | 'DEAD' }[]): DealVoteSummary => ({
  alive: votes.filter((vote) => vote.value === 'ALIVE').length,
  dead: votes.filter((vote) => vote.value === 'DEAD').length,
})

const currentVotes = (deal: PublicDealRow) => {
  const publication = deal.reviewedAt ?? deal.publishedAt ?? new Date(0)
  return countVotes(deal.votes.filter((vote) => vote.updatedAt >= publication))
}

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
