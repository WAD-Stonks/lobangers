import { searchStallPlaces } from '@api/modules/deals/community-stalls'
import { createRestHandler, type RestDependencies, requireSession } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import { dealPlacesQuerySchema, dealPlacesResponseSchema } from '@broke-oclock/contracts/deal-forms'

export const searchPlaces = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    const userId = requireSession(context).user.id
    const { search } = parseRestInput(dealPlacesQuerySchema, request.query)
    const places = await searchStallPlaces(context.db, dependencies.places, userId, search)
    response.json(dealPlacesResponseSchema.parse(places))
  })
