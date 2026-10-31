import {
  operationalSourceScope,
  readIngestionReadiness,
} from '@api/modules/ingestion/operational-policy'
import { importedDealScope } from '@api/modules/ingestion/review-policy'
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
    const readiness = await readIngestionReadiness(context.db, context.ingestion)
    const [pending, approved, rejected, failed] = await Promise.all([
      context.db.deal.count({ where: { ...importedDealScope, reviewStatus: 'PENDING' } }),
      context.db.deal.count({ where: { ...importedDealScope, reviewStatus: 'APPROVED' } }),
      context.db.deal.count({ where: { ...importedDealScope, reviewStatus: 'REJECTED' } }),
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
