import { ApiErrorException } from '@api/errors'
import { hasVerifiedGeography, hasVerifiedOccupancy } from '@api/modules/deals/outlet-eligibility'
import {
  publicCurrentWindowWhere,
  publicOutletScopeSelect,
  publicOutletVenueSelect,
  publicVenuesFor,
} from '@api/modules/deals/public-deals'
import { publicImportedImage, publicImportedImageSelect } from '@api/modules/deals/public-images'
import { activeRecord } from '@api/modules/platform-admin/venues'
import type { RestDependencies } from '@api/rest/context'
import { createRestHandler } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import { venueDetailResponseSchema, venueParamsSchema } from '@broke-oclock/contracts/venues'

const maxDeals = 50
const maxPastDeals = 20

export const getVenue = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    const { venueId } = parseRestInput(venueParamsSchema, request.params)
    const venue = await context.db.venue.findFirst({
      where: { id: venueId, ...activeRecord, merchant: { is: activeRecord } },
      select: {
        ...publicOutletVenueSelect,
        id: true,
        name: true,
        address: true,
        area: true,
        postalCode: true,
        merchantId: true,
        merchant: { select: { name: true } },
      },
    })
    if (!venue) throw new ApiErrorException('NOT_FOUND', 'Venue not found')

    // deals shown publicly at this venue: approved, not edited since review, published, not deleted
    const now = new Date()
    const publicAtVenue = {
      reviewStatus: 'APPROVED' as const,
      reviewedVersion: { equals: context.db.deal.fields.contentVersion },
      publishedAt: { not: null },
    }
    const activeAtVenue = [
      activeRecord,
      {
        OR: [
          { applicability: 'SELECTED_OUTLETS' as const, venues: { some: { venueId: venue.id } } },
          { applicability: 'ALL_MERCHANT_OUTLETS' as const, merchantId: venue.merchantId },
        ],
      },
    ]

    if (!hasVerifiedGeography(venue) || !hasVerifiedOccupancy(venue)) {
      // Exact legacy campaign retention can preserve its outlet page. A legacy
      // point alone never publishes a catalogue candidate or a new campaign.
      const retained = await context.db.deal.findMany({
        where: { ...publicAtVenue, AND: activeAtVenue },
        select: publicOutletScopeSelect,
      })
      if (!retained.some((deal) => publicVenuesFor(deal).some((item) => item.id === venue.id)))
        throw new ApiErrorException('NOT_FOUND', 'Venue not found')
    }

    // ongoing deals have started and have not yet reached validUntil
    const ongoing = context.db.deal.findMany({
      where: {
        ...publicAtVenue,
        AND: [...activeAtVenue, publicCurrentWindowWhere(now)],
      },
      orderBy: { publishedAt: 'desc' },
      select: {
        ...publicOutletScopeSelect,
        id: true,
        title: true,
        category: true,
        offerType: true,
        priceMinor: true,
        currency: true,
        discountPercent: true,
        validUntil: true,
        rawValidityText: true,
        sources: publicImportedImageSelect,
        images: {
          where: activeRecord,
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { url: true },
        },
      },
    })

    // past deals that have exclusive validUntil over. On Mongo, Prisma orders a null date
    // before every real one, so an open-ended deal (validUntil null) needs excluding outright.
    const past = context.db.deal.findMany({
      where: { ...publicAtVenue, validUntil: { not: null, lte: now }, AND: activeAtVenue },
      orderBy: { validUntil: 'desc' },
      select: {
        ...publicOutletScopeSelect,
        id: true,
        title: true,
        offerType: true,
        priceMinor: true,
        currency: true,
        discountPercent: true,
        validUntil: true,
      },
    })

    const [ongoingRows, pastRows] = await Promise.all([ongoing, past])
    const atVenue = (deal: Parameters<typeof publicVenuesFor>[0]) =>
      publicVenuesFor(deal).some((candidate) => candidate.id === venue.id)
    // Apply limits after proof filtering so held rows cannot crowd out eligible campaigns.
    const deals = ongoingRows.filter(atVenue).slice(0, maxDeals)
    const pastDeals = pastRows.filter(atVenue).slice(0, maxPastDeals)

    response.json(
      venueDetailResponseSchema.parse({
        venue: {
          id: venue.id,
          name: venue.name,
          address: venue.address,
          area: venue.area ?? null,
          postalCode: venue.postalCode ?? null,
          merchantName: venue.merchant.name,
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
