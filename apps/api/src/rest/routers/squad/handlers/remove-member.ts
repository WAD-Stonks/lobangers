import { kickMember } from '@api/modules/squad/rooms'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireSession,
} from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  squadEmptyQuerySchema,
  squadMemberParamsSchema,
  squadStateSchema,
} from '@broke-oclock/contracts/squad'

export const removeMemberHandler = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(squadEmptyQuerySchema, request.query)
    const actor = authenticatedActor(requireSession(context))
    const params = parseRestInput(squadMemberParamsSchema, request.params)
    response.set('Cache-Control', 'no-store')
    response.json(
      squadStateSchema.parse(
        await kickMember(context.db, actor, params.code, params.memberId, new Date()),
      ),
    )
  })
