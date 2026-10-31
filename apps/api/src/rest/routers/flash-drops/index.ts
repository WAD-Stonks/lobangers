import type { RestDependencies } from '@api/rest/context'
import { methodNotAllowed } from '@api/rest/policy'
import { claimCode } from '@api/rest/routers/flash-drops/handlers/claim-code'
import { createMerchantDrop } from '@api/rest/routers/flash-drops/handlers/create-merchant-drop'
import { decideAdminDrop } from '@api/rest/routers/flash-drops/handlers/decide-admin-drop'
import { endMerchantDrop } from '@api/rest/routers/flash-drops/handlers/end-merchant-drop'
import { listActive } from '@api/rest/routers/flash-drops/handlers/list-active'
import { listAdminDrops } from '@api/rest/routers/flash-drops/handlers/list-admin-drops'
import { listCodes } from '@api/rest/routers/flash-drops/handlers/list-codes'
import { listMerchantDrops } from '@api/rest/routers/flash-drops/handlers/list-merchant-drops'
import { resubmitMerchantDrop } from '@api/rest/routers/flash-drops/handlers/resubmit-merchant-drop'
import { Router } from 'express'

// Flash Drop: public map reads and claims, the merchant's own drops, and admin review.
export const createFlashDropsRouter = (dependencies: RestDependencies): Router => {
  const router = Router()
  router.use('/admin/flash-drops', (_request, response, next) => {
    response.set('Cache-Control', 'no-store')
    next()
  })
  router.get('/flash-drops/active', listActive(dependencies))
  router.get('/flash-drops/codes', listCodes(dependencies))
  router.post('/flash-drops/:dropId/claims', claimCode(dependencies))
  router.get('/merchant/flash-drops', listMerchantDrops(dependencies))
  router.post('/merchant/flash-drops', createMerchantDrop(dependencies))
  router.put('/merchant/flash-drops/:dropId', resubmitMerchantDrop(dependencies))
  router.post('/merchant/flash-drops/:dropId/end', endMerchantDrop(dependencies))
  router.get('/admin/flash-drops', listAdminDrops(dependencies))
  router.post('/admin/flash-drops/:dropId/decision', decideAdminDrop(dependencies))
  router.all('/flash-drops/active', methodNotAllowed('GET'))
  router.all('/flash-drops/codes', methodNotAllowed('GET'))
  router.all('/flash-drops/:dropId/claims', methodNotAllowed('POST'))
  router.all('/merchant/flash-drops', methodNotAllowed('GET', 'POST'))
  router.all('/merchant/flash-drops/:dropId', methodNotAllowed('PUT'))
  router.all('/merchant/flash-drops/:dropId/end', methodNotAllowed('POST'))
  router.all('/admin/flash-drops', methodNotAllowed('GET'))
  router.all('/admin/flash-drops/:dropId/decision', methodNotAllowed('POST'))
  return router
}
