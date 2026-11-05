import { hidePresence } from '@api/modules/presence/presence'
import { createRestHandler, type RestDependencies, requireSession } from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import { presenceEmptyQuerySchema, presenceHiddenSchema } from '@broke-oclock/contracts/presence'

export const hideMe = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(presenceEmptyQuerySchema, request.query)
    const session = requireSession(context)
    await hidePresence(context.db, session.user.id)
    response.json(presenceHiddenSchema.parse({ ok: true }))
  })
