import { DomainError } from '@api/modules/domain-error'
import { recoverPost } from '@api/modules/ingestion/recovery'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireAdmin,
} from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import { postParamsSchema, recoveryRequestSchema } from '@broke-oclock/contracts/ingestion-recovery'
import type { RequestHandler } from 'express'

export const postIngestionRecovery = (dependencies: RestDependencies): RequestHandler =>
  createRestHandler(dependencies, async (req, res, ctx) => {
    const session = await requireAdmin(ctx)
    requireTrustedOrigin(req.get('Origin'), dependencies.config.webOrigin)
    const { postId } = parseRestInput(postParamsSchema, req.params)
    const body = parseRestInput(recoveryRequestSchema, req.body)
    if (!ctx.ingestion) throw new DomainError('PRECONDITION_FAILED', 'Ingestion unavailable')
    res.json(await recoverPost(ctx.db, ctx.ingestion, authenticatedActor(session), postId, body))
  })
