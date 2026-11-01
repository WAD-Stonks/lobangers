import { readModerationComment } from '@api/modules/community/moderation-data'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireSession,
} from '@api/rest/context'
import { parseRestValue } from '@api/rest/routers/platform-admin/validation'
import {
  moderationCommentParamsSchema,
  moderationCommentSchema,
} from '@broke-oclock/contracts/admin-moderation'

export const getModerationComment = (deps: RestDependencies) =>
  createRestHandler(deps, async (req, res, ctx) => {
    const actor = authenticatedActor(requireSession(ctx))
    const p = parseRestValue(moderationCommentParamsSchema, req.params)
    res.json(moderationCommentSchema.parse(await readModerationComment(ctx.db, actor, p.id)))
  })
