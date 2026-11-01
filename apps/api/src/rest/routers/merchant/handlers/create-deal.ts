import { createMerchantDeal } from '@api/modules/merchant/promotions'
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
  merchantDealSchema,
  merchantEmptyQuerySchema,
} from '@broke-oclock/contracts/merchant'

export const createDeal = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(merchantEmptyQuerySchema, request.query)
    const actor = authenticatedActor(requireSession(context))
    const input = parseRestInput(merchantDealBodySchema, request.body)
    const deal = await createMerchantDeal(context.db, actor, input, new Date())
    response.status(201).json(merchantDealSchema.parse(deal))
  })
