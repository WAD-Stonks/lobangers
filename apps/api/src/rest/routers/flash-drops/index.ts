import type { RestDependencies } from '@api/rest/context'
import { methodNotAllowed } from '@api/rest/policy'
import { claimCode } from '@api/rest/routers/flash-drops/handlers/claim-code'
import { createMerchantDrop } from '@api/rest/routers/flash-drops/handlers/create-merchant-drop'
import { decideAdminDrop } from '@api/rest/routers/flash-drops/handlers/decide-admin-drop'
import { deleteMerchantDrop } from '@api/rest/routers/flash-drops/handlers/delete-merchant-drop'
import { endMerchantDrop } from '@api/rest/routers/flash-drops/handlers/end-merchant-drop'
import { goLiveMerchantDrop } from '@api/rest/routers/flash-drops/handlers/go-live-merchant-drop'
import { listActive } from '@api/rest/routers/flash-drops/handlers/list-active'
import { listAdminDrops } from '@api/rest/routers/flash-drops/handlers/list-admin-drops'
import { listCodes } from '@api/rest/routers/flash-drops/handlers/list-codes'
import { listMerchantDrops } from '@api/rest/routers/flash-drops/handlers/list-merchant-drops'
import { updateMerchantDrop } from '@api/rest/routers/flash-drops/handlers/update-merchant-drop'
import { Router } from 'express'

// Flash deals: public map reads and claims, the merchant's own flash deals (drafts, Go live,
// end), and admin removal.
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
  router.put('/merchant/flash-drops/:dropId', updateMerchantDrop(dependencies))
  router.delete('/merchant/flash-drops/:dropId', deleteMerchantDrop(dependencies))
  router.post('/merchant/flash-drops/:dropId/go-live', goLiveMerchantDrop(dependencies))
  router.post('/merchant/flash-drops/:dropId/end', endMerchantDrop(dependencies))
  router.get('/admin/flash-drops', listAdminDrops(dependencies))
  router.post('/admin/flash-drops/:dropId/decision', decideAdminDrop(dependencies))
  router.all('/flash-drops/active', methodNotAllowed('GET'))
  router.all('/flash-drops/codes', methodNotAllowed('GET'))
  router.all('/flash-drops/:dropId/claims', methodNotAllowed('POST'))
  router.all('/merchant/flash-drops', methodNotAllowed('GET', 'POST'))
  router.all('/merchant/flash-drops/:dropId', methodNotAllowed('PUT', 'DELETE'))
  router.all('/merchant/flash-drops/:dropId/go-live', methodNotAllowed('POST'))
  router.all('/merchant/flash-drops/:dropId/end', methodNotAllowed('POST'))
  router.all('/admin/flash-drops', methodNotAllowed('GET'))
  router.all('/admin/flash-drops/:dropId/decision', methodNotAllowed('POST'))
  return router
}
