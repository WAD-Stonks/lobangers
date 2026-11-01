import type { RestDependencies } from '@api/rest/context'
import { methodNotAllowed } from '@api/rest/policy'
import { getModerationComment } from '@api/rest/routers/admin-moderation/get-comment'
import { getModerationReport } from '@api/rest/routers/admin-moderation/get-report'
import { getModerationComments } from '@api/rest/routers/admin-moderation/list-comments'
import { getModerationReports } from '@api/rest/routers/admin-moderation/list-reports'
import { postModerationReportResolution } from '@api/rest/routers/admin-moderation/resolve-report'
import { postModerationCommentVisibility } from '@api/rest/routers/admin-moderation/set-comment-visibility'
import { Router } from 'express'

export const createAdminModerationRouter = (deps: RestDependencies) => {
  const router = Router()
  router.use('/admin/moderation', (_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  router.get('/admin/moderation/reports', getModerationReports(deps))
  router.all('/admin/moderation/reports', methodNotAllowed('GET'))
  router.get('/admin/moderation/reports/:targetType/:id', getModerationReport(deps))
  router.all('/admin/moderation/reports/:targetType/:id', methodNotAllowed('GET'))
  router.post(
    '/admin/moderation/reports/:targetType/:id/resolve',
    postModerationReportResolution(deps),
  )
  router.all('/admin/moderation/reports/:targetType/:id/resolve', methodNotAllowed('POST'))
  router.get('/admin/moderation/comments', getModerationComments(deps))
  router.all('/admin/moderation/comments', methodNotAllowed('GET'))
  router.get('/admin/moderation/comments/:id', getModerationComment(deps))
  router.all('/admin/moderation/comments/:id', methodNotAllowed('GET'))
  router.post('/admin/moderation/comments/:id/visibility', postModerationCommentVisibility(deps))
  router.all('/admin/moderation/comments/:id/visibility', methodNotAllowed('POST'))
  return router
}
