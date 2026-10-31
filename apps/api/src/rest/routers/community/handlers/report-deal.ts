import { reportCommunityContent } from '@api/modules/community/writes'
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
  communityOkSchema,
  reportBodySchema,
} from '@broke-oclock/contracts/community'

export const reportDeal = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(communityEmptySchema, request.query)
    const actor = authenticatedActor(requireSession(context))
    const { dealId } = parseRestInput(communityDealParamsSchema, request.params)
    const body = parseRestInput(reportBodySchema, request.body)
    response.json(
      communityOkSchema.parse(
        await reportCommunityContent(context.db, dealId, actor, body, 'deal'),
      ),
    )
  })
