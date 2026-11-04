import { summarizeCatalogue } from '@api/modules/venues/admin-data'
import { createRestHandler, type RestDependencies, requireAdmin } from '@api/rest/context'
import { catalogueSummarySchema } from '@broke-oclock/contracts/admin-catalogue'

export const getAdminCatalogueSummary = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (_request, response, context) => {
    const _session = await requireAdmin(context)
    response.status(200).json(catalogueSummarySchema.parse(await summarizeCatalogue(context.db)))
  })
