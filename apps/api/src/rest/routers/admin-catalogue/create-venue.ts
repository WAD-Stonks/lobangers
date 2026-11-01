import { createCatalogueVenue } from '@api/modules/venues/admin-writes'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireAdmin,
} from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestValue } from '@api/rest/routers/platform-admin/validation'
import {
  catalogueMutationResponseSchema,
  createCatalogueVenueSchema,
} from '@broke-oclock/contracts/admin-catalogue'

export const createAdminCatalogueVenue = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    const session = await requireAdmin(context)
    response
      .status(201)
      .json(
        catalogueMutationResponseSchema.parse(
          await createCatalogueVenue(
            context.db,
            authenticatedActor(session),
            parseRestValue(createCatalogueVenueSchema, request.body),
          ),
        ),
      )
  })
