import { ApiErrorException } from '@api/errors'
import {
  outletScopeKeysSelect,
  withDealMedia,
  withOutletScopes,
} from '@api/modules/deals/deal-relations'
import { hasVerifiedGeography, hasVerifiedOccupancy } from '@api/modules/deals/outlet-eligibility'
import {
  isLimitedTime,
  mapVenuesFor,
  type PublicOutletScopeRow,
  publicCurrentWindowWhere,
  publicOutletVenueSelect,
} from '@api/modules/deals/public-deals'
import { publicImportedImage } from '@api/modules/deals/public-images'
import { activeRecord } from '@api/modules/platform-admin/venues'
import type { RestContext, RestDependencies } from '@api/rest/context'
import { createPublicRestHandler } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import { venueDetailResponseSchema, venueParamsSchema } from '@broke-oclock/contracts/venues'

const maxDeals = 50
const maxPastDeals = 20
// Outlet proof is checked in memory, so past rows are read a page at a time: a single
// database limit could be filled entirely by rows the proof check then drops.
const pastPageSize = 50

type Database = RestContext['db']
type DealWhere = NonNullable<NonNullable<Parameters<Database['deal']['findMany']>[0]>['where']>
type Venue = { id: string; merchantId: string }

const findVenue = (database: Database, venueId: string) =>
  database.venue.findFirst({
    where: { id: venueId, ...activeRecord, merchant: { is: activeRecord } },
    select: {
      ...publicOutletVenueSelect,
      id: true,
      name: true,
      address: true,
      area: true,
      postalCode: true,
      merchantId: true,
    },
  })

// deals shown publicly at this venue: approved, not edited since review, published, not deleted
const atVenueWhere = (database: Database, venue: Venue): DealWhere => ({
  reviewStatus: 'APPROVED',
  reviewedVersion: { equals: database.deal.fields.contentVersion },
  publishedAt: { not: null },
  AND: [
    activeRecord,
    {
      OR: [
        { applicability: 'SELECTED_OUTLETS', venues: { some: { venueId: venue.id } } },
        { applicability: 'ALL_MERCHANT_OUTLETS', merchantId: venue.merchantId },
      ],
    },
  ],
})

const appliesAt =
  (venue: Venue) =>
  (deal: PublicOutletScopeRow & { terms?: string | null }): boolean =>
    mapVenuesFor(deal).venues.some((candidate) => candidate.id === venue.id)

// An unproven outlet has a page only while some public deal is pinned here, by legacy
// retention or as an unconfirmed outlet, matching the map. A point alone never does.
const hasRetainedDeal = async (database: Database, venue: Venue, where: DealWhere) => {
  const rows = await database.deal.findMany({
    where,
    select: { ...outletScopeKeysSelect, terms: true },
  })
  return (await withOutletScopes(database, rows)).some(appliesAt(venue))
}

// ongoing deals have started and have not yet reached validUntil
const findOngoing = async (database: Database, venue: Venue, where: DealWhere, now: Date) => {
  const rows = await database.deal.findMany({
    where: { AND: [where, publicCurrentWindowWhere(now)] },
    orderBy: { publishedAt: 'desc' },
    select: {
      ...outletScopeKeysSelect,
      title: true,
      category: true,
      offerType: true,
      priceMinor: true,
      currency: true,
      discountPercent: true,
      origin: true,
      terms: true,
      validUntil: true,
      rawValidityText: true,
    },
  })
  // Relations load together; limits apply after proof filtering so held rows cannot crowd out
  // eligible campaigns.
  const [scoped, media] = await Promise.all([
    withOutletScopes(database, rows),
    withDealMedia(database, rows),
  ])
  const mediaById = new Map(media.map(({ id, sources, images }) => [id, { sources, images }]))
  return scoped
    .filter(appliesAt(venue))
    .slice(0, maxDeals)
    .map((deal) => ({ ...deal, ...(mediaById.get(deal.id) ?? { sources: [], images: [] }) }))
}

// past deals whose exclusive validUntil is over. On Mongo, Prisma orders a null date before
// every real one, so an open-ended deal (validUntil null) needs excluding outright.
const findPastPage = async (
  database: Database,
  venue: Venue,
  where: DealWhere,
  now: Date,
  skip: number,
) => {
  const page = await database.deal.findMany({
    where: { ...where, validUntil: { not: null, lte: now } },
    orderBy: [{ validUntil: 'desc' }, { id: 'desc' }],
    skip,
    take: pastPageSize,
    select: {
      ...outletScopeKeysSelect,
      title: true,
      offerType: true,
      priceMinor: true,
      currency: true,
      discountPercent: true,
      terms: true,
      validUntil: true,
    },
  })
  const rows = (await withOutletScopes(database, page)).filter(appliesAt(venue))
  return { rows, complete: page.length < pastPageSize }
}

type PastRow = Awaited<ReturnType<typeof findPastPage>>['rows'][number]

const findPast = async (
  database: Database,
  venue: Venue,
  where: DealWhere,
  now: Date,
  skip = 0,
  kept: readonly PastRow[] = [],
): Promise<readonly PastRow[]> => {
  const { rows, complete } = await findPastPage(database, venue, where, now, skip)
  const next = [...kept, ...rows]
  return complete || next.length >= maxPastDeals
    ? next.slice(0, maxPastDeals)
    : findPast(database, venue, where, now, skip + pastPageSize, next)
}

export const getVenue = (dependencies: RestDependencies) =>
  createPublicRestHandler(dependencies, async (request, response, context) => {
    const { venueId } = parseRestInput(venueParamsSchema, request.params)
    const venue = await findVenue(context.db, venueId)
    if (!venue) throw new ApiErrorException('NOT_FOUND', 'Venue not found')

    const now = new Date()
    const where = atVenueWhere(context.db, venue)
    const proven = hasVerifiedGeography(venue) && hasVerifiedOccupancy(venue)
    const [merchant, retained, deals, pastDeals] = await Promise.all([
      context.db.merchant.findUniqueOrThrow({
        where: { id: venue.merchantId },
        select: { name: true },
      }),
      proven || hasRetainedDeal(context.db, venue, where),
      findOngoing(context.db, venue, where, now),
      findPast(context.db, venue, where, now),
    ])
    if (!retained) throw new ApiErrorException('NOT_FOUND', 'Venue not found')

    response.json(
      venueDetailResponseSchema.parse({
        venue: {
          id: venue.id,
          name: venue.name,
          address: venue.address,
          area: venue.area ?? null,
          postalCode: venue.postalCode ?? null,
          merchantName: merchant.name,
        },
        deals: deals.map((deal) => ({
          id: deal.id,
          title: deal.title,
          category: deal.category,
          offerType: deal.offerType,
          priceMinor: deal.priceMinor ?? null,
          currency: deal.currency,
          discountPercent: deal.discountPercent ?? null,
          validUntil: deal.validUntil?.toISOString() ?? null,
          rawValidityText: deal.rawValidityText ?? null,
          ...(isLimitedTime(deal) ? { limitedTime: true } : {}),
          ...(mapVenuesFor(deal).outletUnconfirmed ? { outletUnconfirmed: true } : {}),
          ...(deal.images[0] ? { imageUrl: deal.images[0].url } : publicImportedImage(deal)),
        })),
        pastDeals: pastDeals.map((deal) => ({
          id: deal.id,
          title: deal.title,
          offerType: deal.offerType,
          priceMinor: deal.priceMinor ?? null,
          currency: deal.currency,
          discountPercent: deal.discountPercent ?? null,
          validUntil: deal.validUntil?.toISOString(),
        })),
      }),
    )
  })
