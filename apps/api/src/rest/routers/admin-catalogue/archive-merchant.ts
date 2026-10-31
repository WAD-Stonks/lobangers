import { archiveCatalogueMerchant } from '@api/modules/venues/admin-writes'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireAdmin,
} from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestValue } from '@api/rest/routers/platform-admin/validation'
import {
  catalogueIdSchema,
  catalogueMutationResponseSchema,
  catalogueMutationSchema,
} from '@broke-oclock/contracts/admin-catalogue'

export const archiveAdminCatalogueMerchant = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    const session = await requireAdmin(context)
    response
      .status(200)
      .json(
        catalogueMutationResponseSchema.parse(
          await archiveCatalogueMerchant(
            context.db,
            authenticatedActor(session),
            parseRestValue(catalogueIdSchema, request.params).id,
            parseRestValue(catalogueMutationSchema, request.body),
          ),
        ),
      )
  })
