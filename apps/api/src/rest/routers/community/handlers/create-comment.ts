import { addCommunityComment } from '@api/modules/community/writes'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireSession,
} from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  communityCommentSchema,
  communityDealParamsSchema,
  communityEmptySchema,
  createCommentBodySchema,
} from '@broke-oclock/contracts/community'

export const createComment = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(communityEmptySchema, request.query)
    const actor = authenticatedActor(requireSession(context))
    const { dealId } = parseRestInput(communityDealParamsSchema, request.params)
    const { body, parentId } = parseRestInput(createCommentBodySchema, request.body)
    response
      .status(201)
      .json(
        communityCommentSchema.parse(
          await addCommunityComment(context.db, dealId, actor, body, parentId),
        ),
      )
  })
