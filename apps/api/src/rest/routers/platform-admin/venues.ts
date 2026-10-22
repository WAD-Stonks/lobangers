import { catalogueVenueSelect, selectableCatalogueWhere } from '@api/modules/deals/catalogue-select'
import { isSelectableCatalogueVenue } from '@api/modules/deals/outlet-eligibility'
import { activeRecord } from '@api/modules/platform-admin/venues'
import type { RestDependencies } from '@api/rest/context'
import { createRestHandler, requireAdmin } from '@api/rest/context'
import { parseRestValue } from '@api/rest/routers/platform-admin/validation'
import {
  platformPageSchema,
  platformVenueSchema,
  platformVenuesQuerySchema,
} from '@broke-oclock/contracts/platform-admin'

// New-selection catalogue only. Account/grant history deliberately uses its separate reader.
export const listAdminVenues = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    await requireAdmin(context, 'FORBIDDEN')
    const input = parseRestValue(platformVenuesQuerySchema, request.query)
    const items: { id: string; name: string; address: string; merchantName: string }[] = []
    let cursor = input.cursor
    let scanned = 0
    let exhausted = false
    // Bounded scan with an honest continuation even when all scanned hashes are stale.
    while (items.length <= input.limit && scanned < 200) {
      const rows = await context.db.venue.findMany({
        where: {
          AND: [activeRecord, { merchant: { is: activeRecord } }, selectableCatalogueWhere],
          ...(cursor ? { id: { gt: cursor } } : {}),
          ...(input.search
            ? {
                OR: [
                  { name: { contains: input.search, mode: 'insensitive' } },
                  { address: { contains: input.search, mode: 'insensitive' } },
                  { merchant: { name: { contains: input.search, mode: 'insensitive' } } },
                ],
              }
            : {}),
        },
        take: 100,
        orderBy: { id: 'asc' },
        select: catalogueVenueSelect,
      })
      for (const row of rows) {
        scanned++
        cursor = row.id
        if (!isSelectableCatalogueVenue(row) || row.merchant.deletedAt) continue
        items.push({
          id: row.id,
          name: row.name,
          address: row.address,
          merchantName: row.merchant.name,
        })
        if (items.length > input.limit) break
      }
      if (items.length > input.limit) break
      if (rows.length < 100) {
        exhausted = true
        break
      }
    }
    const displayed = items.slice(0, input.limit)
    response.json(
      platformPageSchema(platformVenueSchema).parse({
        items: displayed,
        nextCursor:
          items.length > input.limit
            ? (displayed.at(-1)?.id ?? null)
            : exhausted
              ? null
              : (cursor ?? null),
      }),
    )
  })
