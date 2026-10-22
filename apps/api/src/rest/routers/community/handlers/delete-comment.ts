import { deleteCommunityComment } from '@api/modules/community/writes'
import { createRestHandler, type RestDependencies, requireSession } from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  commentParamsSchema,
  communityEmptySchema,
  communityOkSchema,
} from '@broke-oclock/contracts/community'

export const deleteComment = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(communityEmptySchema, request.query)
    parseRestInput(communityEmptySchema, request.body ?? {})
    const userId = requireSession(context).user.id
    const { commentId } = parseRestInput(commentParamsSchema, request.params)
    response.json(
      communityOkSchema.parse(await deleteCommunityComment(context.db, commentId, userId)),
    )
  })
