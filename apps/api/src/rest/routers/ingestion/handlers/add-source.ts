import { addIngestionSource } from '@api/modules/ingestion/source-management'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireAdmin,
} from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  ingestionAddSourceRequestSchema,
  ingestionSourceSchema,
} from '@broke-oclock/contracts/ingestion-sources'
import type { RequestHandler } from 'express'

export const postIngestionSource = (dependencies: RestDependencies): RequestHandler =>
  createRestHandler(dependencies, async (request, response, context) => {
    const session = await requireAdmin(context)
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    const input = parseRestInput(ingestionAddSourceRequestSchema, request.body)
    response
      .status(201)
      .json(
        ingestionSourceSchema.parse(
          await addIngestionSource(context.db, authenticatedActor(session), input),
        ),
      )
  })
