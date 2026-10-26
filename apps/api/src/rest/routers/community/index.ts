import type { RestDependencies } from '@api/rest/context'
import { methodNotAllowed } from '@api/rest/policy'
import { createComment } from '@api/rest/routers/community/handlers/create-comment'
import { deleteComment } from '@api/rest/routers/community/handlers/delete-comment'
import { deleteVote } from '@api/rest/routers/community/handlers/delete-vote'
import { getSummary } from '@api/rest/routers/community/handlers/get-summary'
import { listComments } from '@api/rest/routers/community/handlers/list-comments'
import { reportComment } from '@api/rest/routers/community/handlers/report-comment'
import { reportDeal } from '@api/rest/routers/community/handlers/report-deal'
import { setVote } from '@api/rest/routers/community/handlers/set-vote'
import { Router } from 'express'

export const createCommunityRouter = (dependencies: RestDependencies): Router => {
  const router = Router()
  router.get('/deals/:dealId/community', getSummary(dependencies))
  router.put('/deals/:dealId/vote', setVote(dependencies))
  router.delete('/deals/:dealId/vote', deleteVote(dependencies))
  router.get('/deals/:dealId/comments', listComments(dependencies))
  router.post('/deals/:dealId/comments', createComment(dependencies))
  router.delete('/comments/:commentId', deleteComment(dependencies))
  router.post('/deals/:dealId/reports', reportDeal(dependencies))
  router.post('/comments/:commentId/reports', reportComment(dependencies))
  router.all('/deals/:dealId/community', methodNotAllowed('GET'))
  router.all('/deals/:dealId/vote', methodNotAllowed('PUT', 'DELETE'))
  router.all('/deals/:dealId/comments', methodNotAllowed('GET', 'POST'))
  router.all('/comments/:commentId', methodNotAllowed('DELETE'))
  router.all('/deals/:dealId/reports', methodNotAllowed('POST'))
  router.all('/comments/:commentId/reports', methodNotAllowed('POST'))
  return router
}
