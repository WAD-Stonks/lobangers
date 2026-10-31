import type { RestDependencies } from '@api/rest/context'
import { methodNotAllowed } from '@api/rest/policy'
import { patchAdminDealContent } from '@api/rest/routers/admin-deals/content'
import { getAdminDeal } from '@api/rest/routers/admin-deals/detail'
import { getAdminDeals } from '@api/rest/routers/admin-deals/list'
import { postAdminDealReopen } from '@api/rest/routers/admin-deals/reopen'
import { postAdminDealReview } from '@api/rest/routers/admin-deals/review'
import { patchAdminDealScope } from '@api/rest/routers/admin-deals/scope'
import { postAdminDealScopeEvidence } from '@api/rest/routers/admin-deals/scope-evidence'
import { postAdminDealUnpublish } from '@api/rest/routers/admin-deals/unpublish'
import { Router } from 'express'
export const createAdminDealsRouter = (deps: RestDependencies): Router => {
  const router = Router()
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })
  router.head('/', methodNotAllowed('GET'))
  router.get('/', getAdminDeals(deps))
  router.all('/', methodNotAllowed('GET'))
  router.head('/:dealId', methodNotAllowed('GET'))
  router.get('/:dealId', getAdminDeal(deps))
  router.all('/:dealId', methodNotAllowed('GET'))
  router.patch('/:dealId/content', patchAdminDealContent(deps))
  router.all('/:dealId/content', methodNotAllowed('PATCH'))
  router.patch('/:dealId/scope', patchAdminDealScope(deps))
  router.all('/:dealId/scope', methodNotAllowed('PATCH'))
  router.post('/:dealId/scope-evidence', postAdminDealScopeEvidence(deps))
  router.all('/:dealId/scope-evidence', methodNotAllowed('POST'))
  router.post('/:dealId/review', postAdminDealReview(deps))
  router.all('/:dealId/review', methodNotAllowed('POST'))
  router.post('/:dealId/unpublish', postAdminDealUnpublish(deps))
  router.all('/:dealId/unpublish', methodNotAllowed('POST'))
  router.post('/:dealId/reopen', postAdminDealReopen(deps))
  router.all('/:dealId/reopen', methodNotAllowed('POST'))
  return router
}
