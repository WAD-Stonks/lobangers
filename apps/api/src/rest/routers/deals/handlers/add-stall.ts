import { addStallFromPlace } from '@api/modules/deals/community-stalls'
import { createRestHandler, type RestDependencies, requireSession } from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import { createDealStallBodySchema, dealStallSchema } from '@broke-oclock/contracts/deal-forms'
import { merchantEmptyQuerySchema } from '@broke-oclock/contracts/merchant'

export const addStall = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(merchantEmptyQuerySchema, request.query)
    const userId = requireSession(context).user.id
    const input = parseRestInput(createDealStallBodySchema, request.body)
    const { stall, created } = await addStallFromPlace(
      context.db,
      dependencies.places,
      userId,
      input,
      new Date(),
    )
    response.status(created ? 201 : 200).json(dealStallSchema.parse(stall))
  })
