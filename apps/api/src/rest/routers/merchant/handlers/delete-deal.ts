import { deleteMerchantDeal } from '@api/modules/merchant/promotions'
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
  merchantEmptyQuerySchema,
} from '@broke-oclock/contracts/merchant'

export const deleteDeal = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(merchantEmptyQuerySchema, request.query)
    const actor = authenticatedActor(requireSession(context))
    const { dealId } = parseRestInput(merchantDealParamsSchema, request.params)
    await deleteMerchantDeal(context.db, actor, dealId, new Date())
    response.status(204).end()
  })
