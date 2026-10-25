import { communityTransaction, summaryFor } from '@api/modules/community/data'
import { createRestHandler, type RestDependencies } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  communityDealParamsSchema,
  communityEmptySchema,
  communitySummarySchema,
} from '@broke-oclock/contracts/community'
import { DEFAULT_COMMUNITY_POLICY } from '@broke-oclock/contracts/community-policy'

export const getSummary = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    parseRestInput(communityEmptySchema, request.query)
    const { dealId } = parseRestInput(communityDealParamsSchema, request.params)
    const result = await communityTransaction(context.db, (tx) =>
      summaryFor(
        tx,
        dealId,
        context.session?.user.id,
        dependencies.config.community ?? DEFAULT_COMMUNITY_POLICY,
      ),
    )
    response.set('Cache-Control', 'private, no-store')
    response.json(communitySummarySchema.parse(result))
  })
