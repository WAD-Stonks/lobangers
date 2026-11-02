import { addDeals } from '@api/modules/squad/rooms'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireSession,
} from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  squadAddDealsSchema,
  squadCodeParamsSchema,
  squadEmptyQuerySchema,
  squadStateSchema,
} from '@broke-oclock/contracts/squad'

export const addDealsHandler = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(squadEmptyQuerySchema, request.query)
    const actor = authenticatedActor(requireSession(context))
    const params = parseRestInput(squadCodeParamsSchema, request.params)
    const input = parseRestInput(squadAddDealsSchema, request.body)
    response.set('Cache-Control', 'no-store')
    response.json(
      squadStateSchema.parse(
        await addDeals(context.db, actor, params.code, input.dealIds, new Date()),
      ),
    )
  })
