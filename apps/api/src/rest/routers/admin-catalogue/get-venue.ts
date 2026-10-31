import { getCatalogueVenue } from '@api/modules/venues/admin-data'
import { createRestHandler, type RestDependencies, requireAdmin } from '@api/rest/context'
import { parseRestValue } from '@api/rest/routers/platform-admin/validation'
import {
  catalogueIdSchema,
  catalogueVenueDetailSchema,
} from '@broke-oclock/contracts/admin-catalogue'

export const getAdminCatalogueVenue = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    const _session = await requireAdmin(context)
    response
      .status(200)
      .json(
        catalogueVenueDetailSchema.parse(
          await getCatalogueVenue(context.db, parseRestValue(catalogueIdSchema, request.params).id),
        ),
      )
  })
