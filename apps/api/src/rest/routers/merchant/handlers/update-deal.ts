import { updateMerchantDeal } from '@api/modules/merchant/promotions'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireSession,
} from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  merchantDealBodySchema,
  merchantDealParamsSchema,
  merchantDealSchema,
  merchantEmptyQuerySchema,
} from '@broke-oclock/contracts/merchant'

export const updateDeal = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(merchantEmptyQuerySchema, request.query)
    const actor = authenticatedActor(requireSession(context))
    const { dealId } = parseRestInput(merchantDealParamsSchema, request.params)
    const input = parseRestInput(merchantDealBodySchema, request.body)
    const deal = await updateMerchantDeal(context.db, actor, dealId, input, new Date())
    response.json(merchantDealSchema.parse(deal))
  })
