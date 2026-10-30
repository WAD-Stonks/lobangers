import { getCitationDetail } from '@api/modules/ingestion/evidence'
import { createRestHandler, type RestDependencies, requireAdmin } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  citationParamsSchema,
  evidencePageQuerySchema,
} from '@broke-oclock/contracts/ingestion-evidence'
import type { RequestHandler } from 'express'

export const getIngestionCitationDetail = (dependencies: RestDependencies): RequestHandler =>
  createRestHandler(dependencies, async (req, res, ctx) => {
    await requireAdmin(ctx)
    const { dealId, citationId } = parseRestInput(citationParamsSchema, req.params)
    res.json(
      await getCitationDetail(
        ctx.db,
        dealId,
        citationId,
        parseRestInput(evidencePageQuerySchema, req.query),
      ),
    )
  })
