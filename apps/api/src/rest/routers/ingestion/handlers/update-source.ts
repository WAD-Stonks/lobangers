import { setIngestionSourceEnabled } from '@api/modules/ingestion/source-management'
import { createRestHandler, type RestDependencies, requireAdmin } from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  ingestionSetSourceEnabledRequestSchema,
  ingestionSourceParamsSchema,
  ingestionSourceSchema,
} from '@broke-oclock/contracts/ingestion-sources'
import type { RequestHandler } from 'express'

export const patchIngestionSource = (dependencies: RestDependencies): RequestHandler =>
  createRestHandler(dependencies, async (request, response, context) => {
    const session = await requireAdmin(context)
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    const { sourceId } = parseRestInput(ingestionSourceParamsSchema, request.params)
    const input = parseRestInput(ingestionSetSourceEnabledRequestSchema, request.body)
    response.json(
      ingestionSourceSchema.parse(
        await setIngestionSourceEnabled(
          context.db,
          session.user.id,
          sourceId,
          input,
          context.ingestion?.now() ?? new Date(),
        ),
      ),
    )
  })
