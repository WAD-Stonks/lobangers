import { getPosts } from '@api/modules/ingestion/post-investigation'
import { createRestHandler, type RestDependencies, requireAdmin } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import { postsQuerySchema } from '@broke-oclock/contracts/ingestion-recovery'
import type { RequestHandler } from 'express'

export const getIngestionPosts = (dependencies: RestDependencies): RequestHandler =>
  createRestHandler(dependencies, async (req, res, ctx) => {
    await requireAdmin(ctx)
    res.json(await getPosts(ctx.db, parseRestInput(postsQuerySchema, req.query)))
  })
