import { listCatalogueMerchants } from '@api/modules/venues/admin-data'
import { createRestHandler, type RestDependencies, requireAdmin } from '@api/rest/context'
import { parseRestValue } from '@api/rest/routers/platform-admin/validation'
import {
  catalogueMerchantsQuerySchema,
  catalogueMerchantsResponseSchema,
} from '@broke-oclock/contracts/admin-catalogue'

export const listAdminCatalogueMerchants = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    const _session = await requireAdmin(context)
    response
      .status(200)
      .json(
        catalogueMerchantsResponseSchema.parse(
          await listCatalogueMerchants(
            context.db,
            parseRestValue(catalogueMerchantsQuerySchema, request.query),
          ),
        ),
      )
  })
