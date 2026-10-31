import { submitCommunityDeal } from '@api/modules/deals/submissions'
import { createRestHandler, type RestDependencies, requireSession } from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import { submitDealBodySchema, submitDealResponseSchema } from '@broke-oclock/contracts/deal-forms'
import { merchantEmptyQuerySchema } from '@broke-oclock/contracts/merchant'

// Any signed-in user shares a deal; it waits as PENDING for an admin to review.
export const submitDeal = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(merchantEmptyQuerySchema, request.query)
    const userId = requireSession(context).user.id
    const input = parseRestInput(submitDealBodySchema, request.body)
    const deal = await submitCommunityDeal(context.db, userId, input, new Date())
    response
      .status(201)
      .json(submitDealResponseSchema.parse({ id: deal.id, reviewStatus: 'PENDING' }))
  })
