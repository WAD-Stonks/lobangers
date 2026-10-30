import { getAdminDealDetail } from '@api/modules/deals/admin-detail'
import { createRestHandler, type RestDependencies, requireAdmin } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  adminDealDetailQuerySchema,
  adminDealDetailSchema,
  adminDealParamsSchema,
} from '@broke-oclock/contracts/admin-deals'
export const getAdminDeal = (deps: RestDependencies) =>
  createRestHandler(deps, async (req, res, ctx) => {
    await requireAdmin(ctx)
    const { dealId } = parseRestInput(adminDealParamsSchema, req.params)
    res.json(
      adminDealDetailSchema.parse(
        await getAdminDealDetail(
          ctx.db,
          dealId,
          parseRestInput(adminDealDetailQuerySchema, req.query),
        ),
      ),
    )
  })
