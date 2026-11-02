import { createMerchantFlashDrop } from '@api/modules/flash-drops/merchant'
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
  merchantFlashDropBodySchema,
  merchantFlashDropSchema,
} from '@broke-oclock/contracts/flash-drops'

export const createMerchantDrop = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(flashDropEmptyQuerySchema, request.query)
    const actor = authenticatedActor(requireSession(context))
    const input = parseRestInput(merchantFlashDropBodySchema, request.body)
    const drop = await createMerchantFlashDrop(context.db, actor, input, new Date())
    response.status(201).json(merchantFlashDropSchema.parse(drop))
  })
