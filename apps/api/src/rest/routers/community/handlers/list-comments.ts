import { listCommunityComments } from '@api/modules/community/data'
import { createRestHandler, type RestDependencies } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  commentsQuerySchema,
  commentsResponseSchema,
  communityDealParamsSchema,
} from '@broke-oclock/contracts/community'

export const listComments = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    const { dealId } = parseRestInput(communityDealParamsSchema, request.params)
    const query = parseRestInput(commentsQuerySchema, request.query)
    response.set('Cache-Control', 'private, no-store')
    response.json(
      commentsResponseSchema.parse(
        await listCommunityComments(context.db, dealId, context.session?.user.id, query),
      ),
    )
  })
