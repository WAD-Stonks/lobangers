import { startRoom } from '@api/modules/squad/rooms'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireSession,
} from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  squadCodeParamsSchema,
  squadEmptyQuerySchema,
  squadStateSchema,
} from '@broke-oclock/contracts/squad'

export const startRoomHandler = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(squadEmptyQuerySchema, request.query)
    const actor = authenticatedActor(requireSession(context))
    const params = parseRestInput(squadCodeParamsSchema, request.params)
    response.set('Cache-Control', 'no-store')
    response.json(
      squadStateSchema.parse(await startRoom(context.db, actor, params.code, new Date())),
    )
  })
