import { deletePendingSubmission } from '@api/modules/deals/submissions'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireSession,
} from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import { submissionDeletedSchema, submissionParamsSchema } from '@broke-oclock/contracts/account'

export const deleteSubmission = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    const actor = authenticatedActor(requireSession(context))
    const { dealId } = parseRestInput(submissionParamsSchema, request.params)
    await deletePendingSubmission(context.db, actor, dealId, new Date())
    response.json(submissionDeletedSchema.parse({ deleted: true }))
  })
