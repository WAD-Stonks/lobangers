import { editCommunityComment, likeCommunityComment } from '@api/modules/community/writes'
import { createRestHandler, type RestDependencies, requireSession } from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  commentBodySchema,
  commentParamsSchema,
  communityEmptySchema,
  communityOkSchema,
} from '@broke-oclock/contracts/community'

export const editComment = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    const userId = requireSession(context).user.id
    parseRestInput(communityEmptySchema, request.query)
    const { commentId } = parseRestInput(commentParamsSchema, request.params)
    const { body } = parseRestInput(commentBodySchema, request.body)
    response.json(
      communityOkSchema.parse(await editCommunityComment(context.db, commentId, userId, body)),
    )
  })

export const likeComment = (dependencies: RestDependencies, liked: boolean) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    const userId = requireSession(context).user.id
    parseRestInput(communityEmptySchema, request.query)
    parseRestInput(communityEmptySchema, request.body ?? {})
    const { commentId } = parseRestInput(commentParamsSchema, request.params)
    response.json(
      communityOkSchema.parse(await likeCommunityComment(context.db, commentId, userId, liked)),
    )
  })
