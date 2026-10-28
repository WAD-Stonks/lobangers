import { listModerationComments } from '@api/modules/community/moderation-data'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireSession,
} from '@api/rest/context'
import { parseRestValue } from '@api/rest/routers/platform-admin/validation'
import {
  moderationCommentsPageSchema,
  moderationCommentsQuerySchema,
} from '@broke-oclock/contracts/admin-moderation'

export const getModerationComments = (deps: RestDependencies) =>
  createRestHandler(deps, async (req, res, ctx) => {
    const actor = authenticatedActor(requireSession(ctx))
    res.json(
      moderationCommentsPageSchema.parse(
        await listModerationComments(
          ctx.db,
          actor,
          parseRestValue(moderationCommentsQuerySchema, req.query),
        ),
      ),
    )
  })
