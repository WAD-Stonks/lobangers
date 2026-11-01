import { readModerationReport } from '@api/modules/community/moderation-data'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireSession,
} from '@api/rest/context'
import { parseRestValue } from '@api/rest/routers/platform-admin/validation'
import {
  moderationReportParamsSchema,
  moderationReportSchema,
} from '@broke-oclock/contracts/admin-moderation'

export const getModerationReport = (deps: RestDependencies) =>
  createRestHandler(deps, async (req, res, ctx) => {
    const actor = authenticatedActor(requireSession(ctx))
    const p = parseRestValue(moderationReportParamsSchema, req.params)
    res.json(
      moderationReportSchema.parse(await readModerationReport(ctx.db, actor, p.targetType, p.id)),
    )
  })
