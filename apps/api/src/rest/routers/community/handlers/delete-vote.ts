import { setCommunityVote } from '@api/modules/community/writes'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireSession,
} from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  communityDealParamsSchema,
  communityEmptySchema,
  communitySummarySchema,
} from '@broke-oclock/contracts/community'
import { DEFAULT_COMMUNITY_POLICY } from '@broke-oclock/contracts/community-policy'

export const deleteVote = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(communityEmptySchema, request.query)
    parseRestInput(communityEmptySchema, request.body ?? {})
    const actor = authenticatedActor(requireSession(context))
    const { dealId } = parseRestInput(communityDealParamsSchema, request.params)
    response.json(
      communitySummarySchema.parse(
        await setCommunityVote(
          context.db,
          dealId,
          actor,
          null,
          dependencies.config.community ?? DEFAULT_COMMUNITY_POLICY,
        ),
      ),
    )
  })
