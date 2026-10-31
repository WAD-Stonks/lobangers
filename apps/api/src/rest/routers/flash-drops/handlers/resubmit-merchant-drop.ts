import { resubmitMerchantFlashDrop } from '@api/modules/flash-drops/merchant'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireSession,
} from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  flashDropEmptyQuerySchema,
  flashDropParamsSchema,
  merchantFlashDropBodySchema,
  merchantFlashDropSchema,
} from '@broke-oclock/contracts/flash-drops'

export const resubmitMerchantDrop = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(flashDropEmptyQuerySchema, request.query)
    const actor = authenticatedActor(requireSession(context))
    const { dropId } = parseRestInput(flashDropParamsSchema, request.params)
    const input = parseRestInput(merchantFlashDropBodySchema, request.body)
    const drop = await resubmitMerchantFlashDrop(context.db, actor, dropId, input, new Date())
    response.json(merchantFlashDropSchema.parse(drop))
  })
