import { createRoom } from '@api/modules/squad/rooms'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireSession,
} from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  squadCreateSchema,
  squadEmptyQuerySchema,
  squadStateSchema,
} from '@broke-oclock/contracts/squad'

export const createRoomHandler = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(squadEmptyQuerySchema, request.query)
    const actor = authenticatedActor(requireSession(context))
    parseRestInput(squadEmptyQuerySchema, request.params)
    const input = parseRestInput(squadCreateSchema, request.body)
    response.set('Cache-Control', 'no-store')
    response
      .status(201)
      .json(squadStateSchema.parse(await createRoom(context.db, actor, input, new Date())))
  })
