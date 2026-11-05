import { sharePresence } from '@api/modules/presence/presence'
import { createRestHandler, type RestDependencies, requireSession } from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  myPresenceResponseSchema,
  presenceBodySchema,
  presenceEmptyQuerySchema,
} from '@broke-oclock/contracts/presence'

export const shareMe = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(presenceEmptyQuerySchema, request.query)
    const session = requireSession(context)
    const body = parseRestInput(presenceBodySchema, request.body)
    const me = await sharePresence(context.db, session.user.id, body, new Date())
    response.json(myPresenceResponseSchema.parse({ me }))
  })
