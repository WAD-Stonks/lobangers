import { listIngestionSources } from '@api/modules/ingestion/source-management'
import { createRestHandler, type RestDependencies, requireAdmin } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  ingestionSourcesQuerySchema,
  ingestionSourcesResponseSchema,
} from '@broke-oclock/contracts/ingestion-sources'
import type { RequestHandler } from 'express'

export const getIngestionSources = (dependencies: RestDependencies): RequestHandler =>
  createRestHandler(dependencies, async (request, response, context) => {
    await requireAdmin(context)
    const input = parseRestInput(ingestionSourcesQuerySchema, request.query)
    response.json(
      ingestionSourcesResponseSchema.parse(await listIngestionSources(context.db, input)),
    )
  })
