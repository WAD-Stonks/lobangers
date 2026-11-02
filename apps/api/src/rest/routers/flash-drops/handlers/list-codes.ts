import { listMyFlashCodes } from '@api/modules/flash-drops/public'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireSession,
} from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  flashCodesResponseSchema,
  flashDropEmptyQuerySchema,
} from '@broke-oclock/contracts/flash-drops'

export const listCodes = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    parseRestInput(flashDropEmptyQuerySchema, request.query)
    const actor = authenticatedActor(requireSession(context))
    response.set('Cache-Control', 'no-store')
    response.json(
      flashCodesResponseSchema.parse({
        items: await listMyFlashCodes(context.db, actor, new Date()),
      }),
    )
  })
