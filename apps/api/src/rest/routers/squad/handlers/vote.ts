import { vote } from '@api/modules/squad/play'
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
  squadVoteSchema,
} from '@broke-oclock/contracts/squad'

export const voteHandler = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(squadEmptyQuerySchema, request.query)
    const actor = authenticatedActor(requireSession(context))
    const params = parseRestInput(squadCodeParamsSchema, request.params)
    const input = parseRestInput(squadVoteSchema, request.body)
    response.set('Cache-Control', 'no-store')
    response.json(
      squadStateSchema.parse(await vote(context.db, actor, params.code, input, new Date())),
    )
  })
