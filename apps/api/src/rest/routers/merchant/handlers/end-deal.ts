import { endMerchantDeal } from '@api/modules/merchant/promotions'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireSession,
} from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  merchantDealParamsSchema,
  merchantDealSchema,
  merchantEmptyQuerySchema,
} from '@broke-oclock/contracts/merchant'

// Ends a deal now. Ending an already ended deal changes nothing.
export const endDeal = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(merchantEmptyQuerySchema, request.query)
    const actor = authenticatedActor(requireSession(context))
    const { dealId } = parseRestInput(merchantDealParamsSchema, request.params)
    const deal = await endMerchantDeal(context.db, actor, dealId, new Date())
    response.json(merchantDealSchema.parse(deal))
  })
