import { peekRoom } from '@api/modules/squad/play'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireSession,
} from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  squadCodeParamsSchema,
  squadEmptyQuerySchema,
  squadPeekSchema,
} from '@broke-oclock/contracts/squad'

export const peekRoomHandler = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    parseRestInput(squadEmptyQuerySchema, request.query)
    authenticatedActor(requireSession(context))
    const { code } = parseRestInput(squadCodeParamsSchema, request.params)
    response.set('Cache-Control', 'no-store')
    response.json(squadPeekSchema.parse(await peekRoom(context.db, code, new Date())))
  })
