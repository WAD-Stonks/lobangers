import { getCatalogueMerchant } from '@api/modules/venues/admin-data'
import { createRestHandler, type RestDependencies, requireAdmin } from '@api/rest/context'
import { parseRestValue } from '@api/rest/routers/platform-admin/validation'
import { catalogueIdSchema, catalogueMerchantSchema } from '@broke-oclock/contracts/admin-catalogue'

export const getAdminCatalogueMerchant = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    const _session = await requireAdmin(context)
    response
      .status(200)
      .json(
        catalogueMerchantSchema.parse(
          await getCatalogueMerchant(
            context.db,
            parseRestValue(catalogueIdSchema, request.params).id,
          ),
        ),
      )
  })
