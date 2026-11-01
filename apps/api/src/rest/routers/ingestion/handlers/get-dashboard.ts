import { resolveImportedDealReadScope } from '@api/modules/ingestion/imported-read-scope'
import {
  operationalSourceScope,
  readIngestionReadiness,
} from '@api/modules/ingestion/operational-policy'
import { createRestHandler, type RestDependencies, requireAdmin } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  ingestionDashboardQuerySchema,
  ingestionDashboardResponseSchema,
} from '@broke-oclock/contracts/ingestion'
import type { RequestHandler } from 'express'

export const getIngestionDashboard = (dependencies: RestDependencies): RequestHandler =>
  createRestHandler(dependencies, async (request, response, context) => {
    await requireAdmin(context)
    parseRestInput(ingestionDashboardQuerySchema, request.query)
    const [readiness, importedScope] = await Promise.all([
      readIngestionReadiness(context.db, context.ingestion),
      resolveImportedDealReadScope(context.db),
    ])
    const [pending, approved, rejected, failed] = await Promise.all([
      context.db.deal.count({ where: { ...importedScope, reviewStatus: 'PENDING' } }),
      context.db.deal.count({ where: { ...importedScope, reviewStatus: 'APPROVED' } }),
      context.db.deal.count({ where: { ...importedScope, reviewStatus: 'REJECTED' } }),
      context.db.importedPost.count({
        where: { status: 'FAILED', source: operationalSourceScope },
      }),
    ])
    response.json(
      ingestionDashboardResponseSchema.parse({
        source: {
          name: readiness.name,
          enabled: readiness.importAllowed,
          reuseApproved: readiness.reuseAttested,
          onemapConfigured: Boolean(context.ingestion?.searchLocations),
        },
        counts: { pending, approved, rejected, failed },
      }),
    )
  })
