import { catalogueVenueSelect } from '@api/modules/deals/catalogue-select'
import { hasConfirmedOutletScope } from '@api/modules/deals/outlet-eligibility'
import {
  hasCurrentSourceScope,
  hasVerifiedPhysicalScope,
  importedDealScope,
  isReviewReady,
} from '@api/modules/ingestion/review-policy'
import { sourceFromRecord } from '@api/modules/ingestion/source'
import { activeRecord } from '@api/modules/platform-admin/venues'
import { createRestHandler, type RestDependencies, requireAdmin } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  ingestionDraftsQuerySchema,
  ingestionDraftsResponseSchema,
} from '@broke-oclock/contracts/ingestion'
import type { RequestHandler } from 'express'

export const getIngestionDrafts = (dependencies: RestDependencies): RequestHandler =>
  createRestHandler(dependencies, async (request, response, context) => {
    await requireAdmin(context)
    const input = parseRestInput(ingestionDraftsQuerySchema, request.query)
    const rows = await context.db.deal.findMany({
      where: {
        ...importedDealScope,
        reviewStatus: input.status,
        ...(input.cursor ? { id: { gt: input.cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: input.limit + 1,
      select: {
        id: true,
        title: true,
        description: true,
        terms: true,
        category: true,
        offerType: true,
        validFrom: true,
        validUntil: true,
        rawValidityText: true,
        applicability: true,
        merchantId: true,
        scopeConfirmation: true,
        merchant: { select: { deletedAt: true } },
        venues: {
          select: {
            venueId: true,
            venue: {
              select: catalogueVenueSelect,
            },
          },
        },
        reviewStatus: true,
        contentVersion: true,
        reviewNote: true,
        priceMinor: true,
        discountPercent: true,
        sources: {
          take: 1,
          orderBy: { id: 'asc' },
          select: {
            sourceUrl: true,
            sourceContentHash: true,
            images: {
              take: 5,
              orderBy: { id: 'asc' },
              select: {
                sourceUrl: true,
                altText: true,
                image: {
                  select: {
                    id: true,
                    hostedUrl: true,
                    mimeType: true,
                    sizeBytes: true,
                    status: true,
                  },
                },
              },
            },
            importedPost: {
              select: { contentHash: true, errorCode: true, source: { select: { name: true } } },
            },
          },
        },
      },
    })
    const displayed = rows.slice(0, input.limit)
    // Attribution/media stay bounded above; approval policy needs every pinned citation.
    const evidence = await context.db.dealSource.findMany({
      where: { dealId: { in: displayed.map((row) => row.id) } },
      select: {
        dealId: true,
        sourceUrl: true,
        sourceContentHash: true,
        importedPost: {
          select: {
            contentHash: true,
            errorCode: true,
            status: true,
            source: {
              select: { name: true, provider: true, externalId: true, url: true, enabled: true },
            },
          },
        },
      },
    })
    const evidenceByDeal = new Map<string, typeof evidence>()
    for (const source of evidence) {
      const sources = evidenceByDeal.get(source.dealId) ?? []
      sources.push(source)
      evidenceByDeal.set(source.dealId, sources)
    }
    const allVenues = await context.db.venue.findMany({
      where: {
        ...activeRecord,
        merchantId: {
          in: displayed.flatMap((row) =>
            row.applicability === 'ALL_MERCHANT_OUTLETS' && row.merchantId ? [row.merchantId] : [],
          ),
        },
      },
      select: catalogueVenueSelect,
    })
    const items = displayed.map((row) => {
      const deal = { ...row, sources: evidenceByDeal.get(row.id) ?? [] }
      const reviewReady = isReviewReady(deal, context.ingestion?.now() ?? new Date())
      const scopeConfirmed = hasCurrentSourceScope(deal)
      const activeSources =
        deal.sources.length > 0 &&
        deal.sources.every(
          (source) =>
            source.importedPost.status === 'NEEDS_REVIEW' &&
            source.importedPost.source.enabled &&
            !!sourceFromRecord(source.importedPost.source),
        )
      const physical =
        row.applicability === 'SELECTED_OUTLETS' || row.applicability === 'ALL_MERCHANT_OUTLETS'
      const candidates =
        row.applicability === 'ALL_MERCHANT_OUTLETS'
          ? allVenues.filter((venue) => venue.merchantId === row.merchantId)
          : row.venues.map((link) => link.venue)
      const physicalEligibilityReady = hasVerifiedPhysicalScope(
        deal,
        candidates,
        !!row.merchant && !row.merchant.deletedAt,
      )
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        terms: row.terms,
        category: row.category,
        offerType: row.offerType,
        validFrom: row.validFrom?.toISOString() ?? null,
        validUntil: row.validUntil?.toISOString() ?? null,
        rawValidityText: row.rawValidityText,
        applicability: row.applicability,
        merchantId: row.merchantId,
        outlet:
          row.venues.length === 1 && row.venues[0]
            ? {
                id: row.venues[0].venue.id,
                name: row.venues[0].venue.name,
                address: row.venues[0].venue.address,
                merchantName: row.venues[0].venue.merchant.name,
              }
            : null,
        outletCount: row.venues.length,
        outletsTruncated: row.venues.length > 20,
        outlets: row.venues.slice(0, 20).map(({ venue }) => ({
          id: venue.id,
          name: venue.name,
          address: venue.address,
          merchantName: venue.merchant.name,
        })),
        reviewStatus: row.reviewStatus,
        contentVersion: row.contentVersion,
        sourceUrl: row.sources[0]?.sourceUrl ?? '',
        sourceName: row.sources[0]?.importedPost.source.name ?? '',
        images: row.sources
          .flatMap((source) => source.images)
          .slice(0, 5)
          .map(({ sourceUrl, altText, image }) => ({
            sha256: image.id,
            url: image.status === 'HOSTED' ? image.hostedUrl : null,
            sourceUrl,
            altText,
            mimeType: image.mimeType,
            sizeBytes: image.sizeBytes,
            status: image.status,
          })),
        reviewNote: row.reviewNote,
        reviewReady,
        approvalReady: reviewReady && (!physical || (physicalEligibilityReady && activeSources)),
        scopeStatus: scopeConfirmed
          ? 'SOURCE_CONFIRMED'
          : row.scopeConfirmation?.basis === 'LEGACY_RETAINED' &&
              hasConfirmedOutletScope({
                ...row,
                selectedVenueIds: row.venues.map((link) => link.venueId),
              })
            ? 'LEGACY_RETAINED'
            : 'UNCONFIRMED',
        physicalEligibilityReady,
      }
    })
    response.json(
      ingestionDraftsResponseSchema.parse({
        items,
        nextCursor: rows.length > input.limit ? (items.at(-1)?.id ?? null) : null,
      }),
    )
  })
