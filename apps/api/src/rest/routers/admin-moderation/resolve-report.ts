import { resolveModerationReport } from '@api/modules/community/moderation-writes'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireSession,
} from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestValue } from '@api/rest/routers/platform-admin/validation'
import {
  moderationReportParamsSchema,
  moderationReportSchema,
  moderationResolveSchema,
} from '@broke-oclock/contracts/admin-moderation'

export const postModerationReportResolution = (deps: RestDependencies) =>
  createRestHandler(deps, async (req, res, ctx) => {
    const actor = authenticatedActor(requireSession(ctx))
    requireTrustedOrigin(req.get('origin'), deps.config.webOrigin)
    const p = parseRestValue(moderationReportParamsSchema, req.params)
    const body = parseRestValue(moderationResolveSchema, req.body)
    res.json(
      moderationReportSchema.parse(
        await resolveModerationReport(ctx.db, actor, p.targetType, p.id, body),
      ),
    )
  })
