import { setModerationVisibility } from '@api/modules/community/moderation-writes'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireSession,
} from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestValue } from '@api/rest/routers/platform-admin/validation'
import {
  moderationCommentParamsSchema,
  moderationCommentSchema,
  moderationVisibilitySchema,
} from '@broke-oclock/contracts/admin-moderation'

export const postModerationCommentVisibility = (deps: RestDependencies) =>
  createRestHandler(deps, async (req, res, ctx) => {
    const actor = authenticatedActor(requireSession(ctx))
    requireTrustedOrigin(req.get('origin'), deps.config.webOrigin)
    const p = parseRestValue(moderationCommentParamsSchema, req.params)
    res.json(
      moderationCommentSchema.parse(
        await setModerationVisibility(
          ctx.db,
          actor,
          p.id,
          parseRestValue(moderationVisibilitySchema, req.body),
        ),
      ),
    )
  })
