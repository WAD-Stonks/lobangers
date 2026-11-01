import { detailProjection } from '@api/modules/deals/admin-detail'
import { unpublishAdminDeal } from '@api/modules/deals/admin-review'
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
  adminDealWriteEnvelopeSchema,
} from '@broke-oclock/contracts/admin-deals'
export const postAdminDealUnpublish = (deps: RestDependencies) =>
  createRestHandler(deps, async (req, res, ctx) => {
    const session = await requireAdmin(ctx)
    requireTrustedOrigin(req.get('Origin'), deps.config.webOrigin)
    const { dealId } = parseRestInput(adminDealParamsSchema, req.params)
    const result = await unpublishAdminDeal(
      ctx.db,
      authenticatedActor(session),
      dealId,
      parseRestInput(adminDealWriteEnvelopeSchema, req.body),
    )
    res.json(adminDealDetailSchema.parse(await detailProjection(ctx.db, result)))
  })
