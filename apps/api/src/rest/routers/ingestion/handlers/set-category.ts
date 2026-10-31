import { setDraftCategory } from '@api/modules/ingestion/set-category'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireAdmin,
} from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  ingestionCategoryParamsSchema,
  ingestionCategoryRequestSchema,
  ingestionCategoryResponseSchema,
} from '@broke-oclock/contracts/ingestion'
import type { RequestHandler } from 'express'

export const patchIngestionDraftCategory = (dependencies: RestDependencies): RequestHandler =>
  createRestHandler(dependencies, async (request, response, context) => {
    const session = await requireAdmin(context)
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    const { dealId } = parseRestInput(ingestionCategoryParamsSchema, request.params)
    const input = parseRestInput(ingestionCategoryRequestSchema, request.body)
    const result = await setDraftCategory(
      context.db,
      authenticatedActor(session),
      dealId,
      input,
      context.ingestion?.now() ?? new Date(),
    )
    response.json(ingestionCategoryResponseSchema.parse(result))
  })
