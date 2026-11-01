import { readAccountSecurity } from '@api/modules/account/security-projections'
import { createRestHandler, type RestDependencies, requireAdmin } from '@api/rest/context'
import { parseRestValue } from '@api/rest/routers/platform-admin/validation'
import {
  accountSecurityResponseSchema,
  platformAccountParamsSchema,
  securityEmptyQuerySchema,
} from '@broke-oclock/contracts/platform-security'

export const getAccountSecurity = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    response.setHeader('Cache-Control', 'no-store')
    const _session = await requireAdmin(context, 'FORBIDDEN')
    parseRestValue(securityEmptyQuerySchema, request.query)
    const { userId } = parseRestValue(platformAccountParamsSchema, request.params)
    response.json(
      accountSecurityResponseSchema.parse(
        await readAccountSecurity(context.db, userId, dependencies.config),
      ),
    )
  })
