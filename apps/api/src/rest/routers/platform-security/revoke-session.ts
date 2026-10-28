import { revokeAccountSession } from '@api/modules/account/account-security'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireAdmin,
} from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestValue } from '@api/rest/routers/platform-admin/validation'
import {
  accountSecurityMutationBodySchema,
  accountSecurityMutationResponseSchema,
  accountSessionParamsSchema,
  securityEmptyQuerySchema,
} from '@broke-oclock/contracts/platform-security'

export const revokeAccountSessionHandler = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    response.setHeader('Cache-Control', 'no-store')
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    const session = await requireAdmin(context, 'FORBIDDEN')
    const params = parseRestValue(accountSessionParamsSchema, request.params)
    parseRestValue(securityEmptyQuerySchema, request.query)
    const body = parseRestValue(accountSecurityMutationBodySchema, request.body)
    response.json(
      accountSecurityMutationResponseSchema.parse(
        await revokeAccountSession(context.db, authenticatedActor(session), { ...params, ...body }),
      ),
    )
  })
