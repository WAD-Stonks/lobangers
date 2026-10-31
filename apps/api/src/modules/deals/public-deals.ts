import { imagesFor } from '@api/modules/deals/deal-images'
import {
  eligibleVenuesForScope,
  type OutletPolicyVenue,
  type OutletScopeDeal,
} from '@api/modules/deals/outlet-eligibility'
import { publicImportedImage, publicImportedImageSelect } from '@api/modules/deals/public-images'
import {
  type CommunityPolicy,
  communityStatus,
  DEFAULT_COMMUNITY_POLICY,
} from '@broke-oclock/contracts/community-policy'
import type { DealPin, DealsQuery, DealVoteSummary } from '@broke-oclock/contracts/deals'
import type { db } from '@broke-oclock/db'

type Database = typeof db

const CENTS_PER_DOLLAR = 100

type DealWhere = NonNullable<NonNullable<Parameters<Database['deal']['findMany']>[0]>['where']>

// On MongoDB a field that was never written is "missing", not null, and Prisma's `null`
// filter matches only an explicit null. Every optional-date check needs both branches.
const nullOrMissing = (field: string) => [{ [field]: null }, { [field]: { isSet: false } }]

// Imported current claims need a supported finite window. Genuine user open-ended
// submissions retain their existing policy; no timestamp is invented for either origin.
export const publicCurrentWindowWhere = (now: Date): DealWhere => ({
  OR: [
    { origin: 'IMPORTED', validFrom: { not: null, lte: now }, validUntil: { not: null, gt: now } },
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

// Eligible deals narrowed by the visitor's filters, with the outlets needed to draw pins.
export const findPublicDeals = (
  database: Database,
  query: DealsQuery,
  now: Date,
  policy: CommunityPolicy = DEFAULT_COMMUNITY_POLICY,
) =>
  database.deal.findMany({
    where: {
      ...eligibleDealWhere,
      ...(query.category ? { category: query.category } : {}),
      AND: [
        // A price cap keeps deals without a fixed price, such as 1-for-1 offers.
        ...(query.priceMaxMinor === undefined
          ? []
          : [
              {
                OR: [{ priceMinor: null }, { priceMinor: { lte: query.priceMaxMinor } }],
              },
            ]),
        ...(query.validNow === 'true' ? [publicCurrentWindowWhere(now)] : []),
      ],
    },
    orderBy: { publishedAt: 'desc' },
    select: {
      ...publicOutletScopeSelect,
      id: true,
      title: true,
      category: true,
      cuisine: true,
      offerType: true,
      priceMinor: true,
      discountPercent: true,
      contentVersion: true,
      reviewedVersion: true,
      reviewedAt: true,
      publishedAt: true,
      applicability: true,
      description: true,
      terms: true,
      validUntil: true,
      rawValidityText: true,
      sources: publicImportedImageSelect,
      votes: {
        where: {
          updatedAt: { gt: new Date(now.getTime() - policy.windowHours * 3600000), lte: now },
        },
        select: { value: true, updatedAt: true },
      },
      // Only comments that are neither deleted by their author nor hidden by moderation.
      _count: { select: { comments: { where: visibleCommentWhere } } },
    },
  })

// Category options come from every eligible deal, not just the filtered ones.
export const findEligibleCategories = async (database: Database): Promise<string[]> => {
  const rows = await database.deal.findMany({
    where: eligibleDealWhere,
    select: { ...publicOutletScopeSelect, reviewedVersion: true, category: true },
  })
  return [
    ...new Set(
      rows
        .filter(isCurrentApproval)
        .filter((row) => publicVenuesFor(row).length > 0)
        .map((row) => row.category),
    ),
  ].sort()
}

type PublicDealRow = Awaited<ReturnType<typeof findPublicDeals>>[number]

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

export const publicVenuesFor = (deal: PublicOutletScopeRow) =>
  eligibleVenuesForScope(
    { ...deal, selectedVenueIds: deal.venues.map((link) => link.venueId) },
    deal.applicability === 'ALL_MERCHANT_OUTLETS'
      ? (deal.merchant?.venues ?? [])
      : deal.venues.map((link) => link.venue),
    !!deal.merchant && deal.merchant.deletedAt == null,
  )

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

export const findPublicDealPins = async (
  database: Database,
  query: DealsQuery,
  now: Date,
  policy: CommunityPolicy = DEFAULT_COMMUNITY_POLICY,
): Promise<DealPin[]> =>
  (await findPublicDeals(database, query, now, policy))
    .filter(isCurrentApproval)
    .map((row) => toDealPin(row, policy, now))
    .filter((deal) => deal.venues.length > 0)

export const toDealPin = (
  deal: PublicDealRow,
  policy: CommunityPolicy = DEFAULT_COMMUNITY_POLICY,
  now = new Date(),
): DealPin => ({
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
  validUntil: deal.validUntil?.toISOString() ?? null,
  rawValidityText: deal.rawValidityText,
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
  venues: publicVenuesFor(deal).map((venue) => ({
    id: venue.id,
    name: venue.name,
    lat: venue.latitude,
    lng: venue.longitude,
  })),
})
