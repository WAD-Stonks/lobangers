import { findPublicBrowse } from '@api/modules/deals/public-deals'
import { createPublicRestHandler, type RestDependencies } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import { dealsQuerySchema, dealsResponseSchema } from '@broke-oclock/contracts/deals'
import type { RequestHandler } from 'express'

const BROWSE_CACHE_CONTROL = 'public, s-maxage=30, stale-while-revalidate=60'

export const getDeals = (dependencies: RestDependencies): RequestHandler =>
  createPublicRestHandler(dependencies, async (request, response, context) => {
    const query = parseRestInput(dealsQuerySchema, request.query)
    const result = await findPublicBrowse(
      context.db,
      query,
      new Date(),
      dependencies.config.community,
    )
    response.set('Cache-Control', BROWSE_CACHE_CONTROL)
    response.json(dealsResponseSchema.parse(result))
  })
