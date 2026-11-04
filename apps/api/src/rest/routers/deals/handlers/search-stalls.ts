import { searchCommunityStalls } from '@api/modules/deals/community-stalls'
import { createRestHandler, type RestDependencies, requireSession } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import { dealStallsQuerySchema, dealStallsResponseSchema } from '@broke-oclock/contracts/deal-forms'

export const searchStalls = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireSession(context)
    const { search } = parseRestInput(dealStallsQuerySchema, request.query)
    const stalls = await searchCommunityStalls(context.db, search)
    response.json(dealStallsResponseSchema.parse(stalls))
  })
