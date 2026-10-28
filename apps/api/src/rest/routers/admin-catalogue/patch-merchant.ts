import { patchCatalogueMerchant } from '@api/modules/venues/admin-writes'
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
  patchCatalogueMerchantSchema,
} from '@broke-oclock/contracts/admin-catalogue'

export const patchAdminCatalogueMerchant = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    const session = await requireAdmin(context)
    response
      .status(200)
      .json(
        catalogueMutationResponseSchema.parse(
          await patchCatalogueMerchant(
            context.db,
            authenticatedActor(session),
            parseRestValue(catalogueIdSchema, request.params).id,
            parseRestValue(patchCatalogueMerchantSchema, request.body),
          ),
        ),
      )
  })
