import type { RestDependencies } from '@api/rest/context'
import { methodNotAllowed } from '@api/rest/policy'
import { createDeal } from '@api/rest/routers/merchant/handlers/create-deal'
import { endDeal } from '@api/rest/routers/merchant/handlers/end-deal'
import { listDeals } from '@api/rest/routers/merchant/handlers/list-deals'
import { listOutlets } from '@api/rest/routers/merchant/handlers/list-outlets'
import { updateDeal } from '@api/rest/routers/merchant/handlers/update-deal'
import { Router } from 'express'

export const createMerchantRouter = (dependencies: RestDependencies): Router => {
  const router = Router()
  router.get('/outlets', listOutlets(dependencies))
  router.get('/deals', listDeals(dependencies))
  router.post('/deals', createDeal(dependencies))
  router.patch('/deals/:dealId', updateDeal(dependencies))
  router.post('/deals/:dealId/end', endDeal(dependencies))
  router.all('/outlets', methodNotAllowed('GET'))
  router.all('/deals', methodNotAllowed('GET', 'POST'))
  router.all('/deals/:dealId', methodNotAllowed('PATCH'))
  router.all('/deals/:dealId/end', methodNotAllowed('POST'))
  return router
}
