import { getDraftEvidence } from '@api/modules/ingestion/evidence'
import { createRestHandler, type RestDependencies, requireAdmin } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  evidencePageQuerySchema,
  evidenceParamsSchema,
} from '@broke-oclock/contracts/ingestion-evidence'
import type { RequestHandler } from 'express'

export const getIngestionDraftEvidence = (dependencies: RestDependencies): RequestHandler =>
  createRestHandler(dependencies, async (req, res, ctx) => {
    await requireAdmin(ctx)
    const { dealId } = parseRestInput(evidenceParamsSchema, req.params)
    res.json(
      await getDraftEvidence(ctx.db, dealId, parseRestInput(evidencePageQuerySchema, req.query)),
    )
  })
