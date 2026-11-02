import { sync } from '@api/modules/squad/play'
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
  squadSyncResponseSchema,
  squadSyncSchema,
} from '@broke-oclock/contracts/squad'

// The heartbeat every member polls: a POST because it marks them as still here.
export const syncHandler = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(squadEmptyQuerySchema, request.query)
    const actor = authenticatedActor(requireSession(context))
    const params = parseRestInput(squadCodeParamsSchema, request.params)
    const input = parseRestInput(squadSyncSchema, request.body)
    response.set('Cache-Control', 'no-store')
    response.json(
      squadSyncResponseSchema.parse(
        await sync(context.db, actor, params.code, input.after, new Date()),
      ),
    )
  })
