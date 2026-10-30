import type { RestDependencies } from '@api/rest/context'
import { methodNotAllowed } from '@api/rest/policy'
import { getDeals } from '@api/rest/routers/deals/handlers/get-deals'
import { submitDeal } from '@api/rest/routers/deals/handlers/submit-deal'
import { Router } from 'express'

export const createDealsRouter = (dependencies: RestDependencies): Router => {
  const router = Router()
  router.get('/', getDeals(dependencies))
  router.post('/', submitDeal(dependencies))
  router.all('/', methodNotAllowed('GET', 'POST'))
  return router
}
