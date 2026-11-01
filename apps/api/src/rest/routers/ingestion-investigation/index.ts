import type { RestDependencies } from '@api/rest/context'
import { methodNotAllowed } from '@api/rest/policy'
import { getIngestionCitationDetail } from '@api/rest/routers/ingestion-investigation/handlers/get-citation-detail'
import { getIngestionDraftEvidence } from '@api/rest/routers/ingestion-investigation/handlers/get-draft-evidence'
import { getIngestionPost } from '@api/rest/routers/ingestion-investigation/handlers/get-post'
import { getIngestionPosts } from '@api/rest/routers/ingestion-investigation/handlers/get-posts'
import { getIngestionRecovery } from '@api/rest/routers/ingestion-investigation/handlers/get-recovery'
import { noStore } from '@api/rest/routers/ingestion-investigation/handlers/no-store'
import { postIngestionRecovery } from '@api/rest/routers/ingestion-investigation/handlers/recover-post'
import { Router } from 'express'

export const createIngestionInvestigationRouter = (dependencies: RestDependencies): Router => {
  const router = Router()
  router.use(noStore)
  router.get('/drafts/:dealId/evidence', getIngestionDraftEvidence(dependencies))
  router.get('/drafts/:dealId/evidence/:citationId', getIngestionCitationDetail(dependencies))
  router.all('/drafts/:dealId/evidence', methodNotAllowed('GET'))
  router.all('/drafts/:dealId/evidence/:citationId', methodNotAllowed('GET'))
  router.get('/posts', getIngestionPosts(dependencies))
  router.get('/posts/:postId', getIngestionPost(dependencies))
  router.get('/recoveries/:recoveryId', getIngestionRecovery(dependencies))
  router.post('/posts/:postId/recoveries', postIngestionRecovery(dependencies))
  router.all('/posts', methodNotAllowed('GET'))
  router.all('/posts/:postId', methodNotAllowed('GET'))
  router.all('/recoveries/:recoveryId', methodNotAllowed('GET'))
  router.all('/posts/:postId/recoveries', methodNotAllowed('POST'))
  return router
}
