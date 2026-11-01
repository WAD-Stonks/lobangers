import { readSecurityContext } from '@api/modules/account/security-projections'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireAdmin,
} from '@api/rest/context'
import { parseRestValue } from '@api/rest/routers/platform-admin/validation'
import {
  securityContextResponseSchema,
  securityEmptyQuerySchema,
} from '@broke-oclock/contracts/platform-security'

export const getSecurityContext = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    response.setHeader('Cache-Control', 'no-store')
    const session = await requireAdmin(context, 'FORBIDDEN')
    parseRestValue(securityEmptyQuerySchema, request.query)
    response.json(
      securityContextResponseSchema.parse(
        await readSecurityContext(context.db, authenticatedActor(session)),
      ),
    )
  })
