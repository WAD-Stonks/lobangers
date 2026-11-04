import type { RestDependencies } from '@api/rest/context'
import { methodNotAllowed } from '@api/rest/policy'
import { addStall } from '@api/rest/routers/deals/handlers/add-stall'
import { getDeals } from '@api/rest/routers/deals/handlers/get-deals'
import { searchPlaces } from '@api/rest/routers/deals/handlers/search-places'
import { searchStalls } from '@api/rest/routers/deals/handlers/search-stalls'
import { submitDeal } from '@api/rest/routers/deals/handlers/submit-deal'
import { Router } from 'express'

export const createDealsRouter = (dependencies: RestDependencies): Router => {
  const router = Router()
  router.get('/', getDeals(dependencies))
  router.post('/', submitDeal(dependencies))
  router.get('/stalls', searchStalls(dependencies))
  router.post('/stalls', addStall(dependencies))
  router.get('/places', searchPlaces(dependencies))
  router.all('/', methodNotAllowed('GET', 'POST'))
  router.all('/stalls', methodNotAllowed('GET', 'POST'))
  router.all('/places', methodNotAllowed('GET'))
  return router
}
