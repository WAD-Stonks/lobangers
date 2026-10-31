import { listCatalogueVenues } from '@api/modules/venues/admin-data'
import { createRestHandler, type RestDependencies, requireAdmin } from '@api/rest/context'
import { parseRestValue } from '@api/rest/routers/platform-admin/validation'
import {
  catalogueVenuesQuerySchema,
  catalogueVenuesResponseSchema,
} from '@broke-oclock/contracts/admin-catalogue'

export const listAdminCatalogueVenues = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    const _session = await requireAdmin(context)
    response
      .status(200)
      .json(
        catalogueVenuesResponseSchema.parse(
          await listCatalogueVenues(
            context.db,
            parseRestValue(catalogueVenuesQuerySchema, request.query),
          ),
        ),
      )
  })
