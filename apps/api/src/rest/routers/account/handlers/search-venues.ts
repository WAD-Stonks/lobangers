import { ApiErrorException } from '@api/errors'
import { catalogueVenueSelect, selectableCatalogueWhere } from '@api/modules/deals/catalogue-select'
import { isSelectableCatalogueVenue } from '@api/modules/deals/outlet-eligibility'
import { activeRecord } from '@api/modules/platform-admin/venues'
import { createRestHandler, type RestDependencies, requireSession } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  accountVenuesQuerySchema,
  accountVenuesResponseSchema,
} from '@broke-oclock/contracts/account'

export const searchVenues = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireSession(context)
    const { search } = parseRestInput(accountVenuesQuerySchema, request.query)
    const nameFilter = search ? { name: { contains: search, mode: 'insensitive' as const } } : {}
    const results: { id: string; name: string; address: string; merchantName: string }[] = []
    let cursor: string | undefined
    let scanned = 0
    let exhausted = false
    // The legacy array contract has no continuation token. Scan coarse-positive pages until
    // ten real matches or exhaustion; a spent budget is an explicit error, never a false empty page.
    while (results.length < 10 && scanned < 1000) {
      const rows = await context.db.venue.findMany({
        where: {
          AND: [
            activeRecord,
            { merchant: { is: activeRecord } },
            nameFilter,
            selectableCatalogueWhere,
          ],
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: 100,
        select: catalogueVenueSelect,
      })
      for (const venue of rows) {
        if (!isSelectableCatalogueVenue(venue) || venue.merchant.deletedAt) continue
        results.push({
          id: venue.id,
          name: venue.name,
          merchantName: venue.merchant.name,
          address: venue.address,
        })
        if (results.length === 10) break
      }
      scanned += rows.length
      if (rows.length < 100) {
        exhausted = true
        break
      }
      cursor = rows.at(-1)?.id
    }
    if (results.length < 10 && !exhausted)
      throw new ApiErrorException(
        'PRECONDITION_FAILED',
        'Verified catalogue search is incomplete; narrow the search and retry.',
      )
    response.json(accountVenuesResponseSchema.parse(results))
  })
