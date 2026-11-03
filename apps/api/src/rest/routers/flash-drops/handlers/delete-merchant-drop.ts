import { deleteMerchantFlashDrop } from '@api/modules/flash-drops/merchant'
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
  merchantFlashDropVersionSchema,
} from '@broke-oclock/contracts/flash-drops'

export const deleteMerchantDrop = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(flashDropEmptyQuerySchema, request.query)
    const actor = authenticatedActor(requireSession(context))
    const { dropId } = parseRestInput(flashDropParamsSchema, request.params)
    const { version } = parseRestInput(merchantFlashDropVersionSchema, request.body)
    await deleteMerchantFlashDrop(context.db, actor, dropId, version, new Date())
    response.status(204).end()
  })
