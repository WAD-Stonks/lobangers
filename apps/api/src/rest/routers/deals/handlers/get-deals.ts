import { findEligibleCategories, findPublicDealPins } from '@api/modules/deals/public-deals'
import { createRestHandler, type RestDependencies } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import { dealsQuerySchema, dealsResponseSchema } from '@broke-oclock/contracts/deals'
import type { RequestHandler } from 'express'

// Public list of mappable deals. Browsing needs no session and a GET never checks Origin.
export const getDeals = (dependencies: RestDependencies): RequestHandler =>
  createRestHandler(dependencies, async (request, response, context) => {
    const query = parseRestInput(dealsQuerySchema, request.query)
    const now = new Date()

    const items = await findPublicDealPins(context.db, query, now, dependencies.config.community)
    const categories = await findEligibleCategories(context.db)

    response.json(dealsResponseSchema.parse({ items, categories }))
  })
