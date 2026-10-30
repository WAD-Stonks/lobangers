import { getRecovery } from '@api/modules/ingestion/recovery'
import { createRestHandler, type RestDependencies, requireAdmin } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import { recoveryParamsSchema } from '@broke-oclock/contracts/ingestion-recovery'
import type { RequestHandler } from 'express'

export const getIngestionRecovery = (dependencies: RestDependencies): RequestHandler =>
  createRestHandler(dependencies, async (req, res, ctx) => {
    await requireAdmin(ctx)
    const { recoveryId } = parseRestInput(recoveryParamsSchema, req.params)
    res.json(await getRecovery(ctx.db, recoveryId))
  })
