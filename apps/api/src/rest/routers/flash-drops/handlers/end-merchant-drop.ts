import { endMerchantFlashDrop } from '@api/modules/flash-drops/merchant'
import { publishFlashChange } from '@api/modules/flash-drops/realtime'
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
  merchantFlashDropEndSchema,
  merchantFlashDropSchema,
} from '@broke-oclock/contracts/flash-drops'

export const endMerchantDrop = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(flashDropEmptyQuerySchema, request.query)
    const actor = authenticatedActor(requireSession(context))
    const { dropId } = parseRestInput(flashDropParamsSchema, request.params)
    const { version } = parseRestInput(merchantFlashDropEndSchema, request.body)
    const drop = await endMerchantFlashDrop(context.db, actor, dropId, version, new Date())
    await publishFlashChange(actor.userId, { dropId, kind: 'ENDED' })
    response.json(merchantFlashDropSchema.parse(drop))
  })
