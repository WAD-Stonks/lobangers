import { readUserAnalytics } from '@api/modules/platform-admin/user-analytics'
import { createRestHandler, requireAdmin, type RestDependencies } from '@api/rest/context'
import { parseRestValue } from '@api/rest/routers/platform-admin/validation'
import { adminUserAnalyticsQuerySchema } from '@broke-oclock/contracts/platform-admin'

export const getAdminUserAnalytics = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    response.setHeader('Cache-Control', 'no-store')
    await requireAdmin(context, 'FORBIDDEN')
    parseRestValue(adminUserAnalyticsQuerySchema, request.query)
    response.json(await readUserAnalytics(context.db, context.ingestion?.now() ?? new Date()))
  })
