import { setCommunityVote } from '@api/modules/community/writes'
import { createRestHandler, type RestDependencies, requireSession } from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  communityDealParamsSchema,
  communityEmptySchema,
  communitySummarySchema,
  voteBodySchema,
} from '@broke-oclock/contracts/community'
import { DEFAULT_COMMUNITY_POLICY } from '@broke-oclock/contracts/community-policy'

export const setVote = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(communityEmptySchema, request.query)
    const userId = requireSession(context).user.id
    const { dealId } = parseRestInput(communityDealParamsSchema, request.params)
    const body = parseRestInput(voteBodySchema, request.body)
    response.json(
      communitySummarySchema.parse(
        await setCommunityVote(
          context.db,
          dealId,
          userId,
          body.value,
          dependencies.config.community ?? DEFAULT_COMMUNITY_POLICY,
        ),
      ),
    )
  })
