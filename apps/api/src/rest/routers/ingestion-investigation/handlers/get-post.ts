import { getPost } from '@api/modules/ingestion/post-investigation'
import { createRestHandler, type RestDependencies, requireAdmin } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import { evidencePageQuerySchema } from '@broke-oclock/contracts/ingestion-evidence'
import { postParamsSchema } from '@broke-oclock/contracts/ingestion-recovery'
import type { RequestHandler } from 'express'

export const getIngestionPost = (dependencies: RestDependencies): RequestHandler =>
  createRestHandler(dependencies, async (req, res, ctx) => {
    await requireAdmin(ctx)
    const { postId } = parseRestInput(postParamsSchema, req.params)
    res.json(
      await getPost(
        ctx.db,
        ctx.ingestion,
        postId,
        parseRestInput(evidencePageQuerySchema, req.query),
      ),
    )
  })
