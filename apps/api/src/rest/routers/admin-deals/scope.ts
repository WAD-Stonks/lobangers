import { detailProjection } from '@api/modules/deals/admin-detail'
import { correctAdminDealScope } from '@api/modules/deals/admin-scope'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireAdmin,
} from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  adminDealDetailSchema,
  adminDealParamsSchema,
  adminDealScopeRequestSchema,
} from '@broke-oclock/contracts/admin-deals'
export const patchAdminDealScope = (deps: RestDependencies) =>
  createRestHandler(deps, async (req, res, ctx) => {
    const session = await requireAdmin(ctx)
    requireTrustedOrigin(req.get('Origin'), deps.config.webOrigin)
    const { dealId } = parseRestInput(adminDealParamsSchema, req.params)
    const result = await correctAdminDealScope(
      ctx.db,
      authenticatedActor(session),
      dealId,
      parseRestInput(adminDealScopeRequestSchema, req.body),
    )
    res.json(adminDealDetailSchema.parse(await detailProjection(ctx.db, result)))
  })
