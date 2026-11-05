import { submitMerchantAccessRequest } from '@api/modules/platform-admin/requests'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireSession,
} from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import { createMerchantRequestBodySchema } from '@broke-oclock/contracts/account'
import { platformMutationResponseSchema } from '@broke-oclock/contracts/platform-admin'

export const createMerchantRequest = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)

    const session = requireSession(context)
    const body = parseRestInput(createMerchantRequestBodySchema, request.body)

    const result = await submitMerchantAccessRequest(context.db, authenticatedActor(session), body)

    response.status(201).json(platformMutationResponseSchema.parse(result))
  })
