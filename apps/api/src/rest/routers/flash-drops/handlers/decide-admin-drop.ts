import { decideFlashDrop } from '@api/modules/flash-drops/admin'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireSession,
} from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  adminFlashDropDecisionSchema,
  adminFlashDropSchema,
  flashDropEmptyQuerySchema,
  flashDropParamsSchema,
} from '@broke-oclock/contracts/flash-drops'

export const decideAdminDrop = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(flashDropEmptyQuerySchema, request.query)
    const actor = authenticatedActor(requireSession(context))
    const { dropId } = parseRestInput(flashDropParamsSchema, request.params)
    const input = parseRestInput(adminFlashDropDecisionSchema, request.body)
    response.json(
      adminFlashDropSchema.parse(
        await decideFlashDrop(context.db, actor, dropId, input, new Date()),
      ),
    )
  })
