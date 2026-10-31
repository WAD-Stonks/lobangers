import { listModerationReports } from '@api/modules/community/moderation-data'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireSession,
} from '@api/rest/context'
import { parseRestValue } from '@api/rest/routers/platform-admin/validation'
import {
  moderationReportsPageSchema,
  moderationReportsQuerySchema,
} from '@broke-oclock/contracts/admin-moderation'

export const getModerationReports = (deps: RestDependencies) =>
  createRestHandler(deps, async (req, res, ctx) => {
    const actor = authenticatedActor(requireSession(ctx))
    res.json(
      moderationReportsPageSchema.parse(
        await listModerationReports(
          ctx.db,
          actor,
          parseRestValue(moderationReportsQuerySchema, req.query),
        ),
      ),
    )
  })
