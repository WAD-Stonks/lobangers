import { listAdminDeals } from '@api/modules/deals/admin-read'
import { createRestHandler, type RestDependencies, requireAdmin } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  adminDealsQuerySchema,
  adminDealsResponseSchema,
} from '@broke-oclock/contracts/admin-deals'
export const getAdminDeals = (deps: RestDependencies) =>
  createRestHandler(deps, async (req, res, ctx) => {
    await requireAdmin(ctx)
    res.json(
      adminDealsResponseSchema.parse(
        await listAdminDeals(ctx.db, parseRestInput(adminDealsQuerySchema, req.query)),
      ),
    )
  })
