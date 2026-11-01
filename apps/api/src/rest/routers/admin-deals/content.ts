import { correctAdminDealContent } from '@api/modules/deals/admin-content'
import { detailProjection } from '@api/modules/deals/admin-detail'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireAdmin,
} from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  adminDealContentRequestSchema,
  adminDealDetailSchema,
  adminDealParamsSchema,
} from '@broke-oclock/contracts/admin-deals'
export const patchAdminDealContent = (deps: RestDependencies) =>
  createRestHandler(deps, async (req, res, ctx) => {
    const session = await requireAdmin(ctx)
    requireTrustedOrigin(req.get('Origin'), deps.config.webOrigin)
    const { dealId } = parseRestInput(adminDealParamsSchema, req.params)
    const result = await correctAdminDealContent(
      ctx.db,
      authenticatedActor(session),
      dealId,
      parseRestInput(adminDealContentRequestSchema, req.body),
    )
    res.json(adminDealDetailSchema.parse(await detailProjection(ctx.db, result)))
  })
