import { claimFlashCode } from '@api/modules/flash-drops/public'
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
  flashCodeSchema,
  flashDropEmptyQuerySchema,
  flashDropParamsSchema,
} from '@broke-oclock/contracts/flash-drops'

// 201 with a new code, or 200 with the code this person already holds.
export const claimCode = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(flashDropEmptyQuerySchema, request.query)
    const actor = authenticatedActor(requireSession(context))
    const { dropId } = parseRestInput(flashDropParamsSchema, request.params)
    const result = await claimFlashCode(context.db, actor, dropId, new Date())
    // Codes left went down; a repeat claim returns the same code and changes nothing.
    if (result.created) await publishFlashChange(result.merchantUserId, { dropId, kind: 'CLAIMED' })
    response.status(result.created ? 201 : 200).json(flashCodeSchema.parse(result.code))
  })
