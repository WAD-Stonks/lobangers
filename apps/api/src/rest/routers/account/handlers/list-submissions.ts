import { dayOf, lastDayBefore } from '@api/modules/deals/deal-dates'
import { activeRecord } from '@api/modules/platform-admin/venues'
import { createRestHandler, type RestDependencies, requireSession } from '@api/rest/context'
import { page } from '@api/rest/routers/platform-admin/validation'
import { parseRestInput } from '@api/rest/validation'
import {
  accountPageQuerySchema,
  type Submission,
  submissionsResponseSchema,
} from '@broke-oclock/contracts/account'

export const listSubmissions = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    const session = requireSession(context)
    const input = parseRestInput(accountPageQuerySchema, request.query)
    const cursorFilter = input.cursor ? { id: { lt: input.cursor } } : {}

    // Deals submitted by THIS user. activeRecord skips deals that were soft-deleted.
    const rows = await context.db.deal.findMany({
      where: { submittedById: session.user.id, ...activeRecord, ...cursorFilter },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        cuisine: true,
        offerType: true,
        discountPercent: true,
        priceMinor: true,
        validFrom: true,
        validUntil: true,
        terms: true,
        reviewStatus: true,
        reviewNote: true,
        createdAt: true,
        venues: {
          orderBy: { createdAt: 'asc' },
          select: { venue: { select: { id: true, name: true, address: true } } },
        },
        images: {
          where: activeRecord,
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { url: true },
        },
      },
    })

    const items: Submission[] = []
    for (const row of rows) {
      items.push({
        id: row.id,
        title: row.title,
        description: row.description,
        category: row.category,
        cuisine: row.cuisine ?? null,
        offerType: row.offerType,
        discountPercent: row.discountPercent ?? null,
        priceCents: row.priceMinor ?? null,
        startDate: row.validFrom ? dayOf(row.validFrom) : null,
        endDate: row.validUntil ? lastDayBefore(row.validUntil) : null,
        terms: row.terms ?? null,
        photoUrl: row.images[0]?.url ?? null,
        stalls: row.venues.map(({ venue }) => ({
          id: venue.id,
          name: venue.name,
          address: venue.address,
        })),
        reviewStatus: row.reviewStatus,
        reviewNote: row.reviewNote,
        createdAt: row.createdAt.toISOString(),
      })
    }

    response.json(submissionsResponseSchema.parse(page(items, input.limit)))
  })
