import { createCatalogueMerchant } from '@api/modules/venues/admin-writes'
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
  createCatalogueMerchantSchema,
} from '@broke-oclock/contracts/admin-catalogue'

export const createAdminCatalogueMerchant = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    const session = await requireAdmin(context)
    response
      .status(201)
      .json(
        catalogueMutationResponseSchema.parse(
          await createCatalogueMerchant(
            context.db,
            authenticatedActor(session),
            parseRestValue(createCatalogueMerchantSchema, request.body),
          ),
        ),
      )
  })
