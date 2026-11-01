import { readAccountSessions } from '@api/modules/account/security-projections'
import { createRestHandler, type RestDependencies, requireAdmin } from '@api/rest/context'
import { parseRestValue } from '@api/rest/routers/platform-admin/validation'
import {
  accountSessionsQuerySchema,
  accountSessionsResponseSchema,
  platformAccountParamsSchema,
} from '@broke-oclock/contracts/platform-security'

export const listAccountSessions = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    response.setHeader('Cache-Control', 'no-store')
    const _session = await requireAdmin(context, 'FORBIDDEN')
    const { userId } = parseRestValue(platformAccountParamsSchema, request.params)
    const query = parseRestValue(accountSessionsQuerySchema, request.query)
    response.json(
      accountSessionsResponseSchema.parse(await readAccountSessions(context.db, userId, query)),
    )
  })
