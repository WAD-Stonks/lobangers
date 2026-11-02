import type { RestDependencies } from '@api/rest/context'
import { methodNotAllowed } from '@api/rest/policy'
import { hideMe } from '@api/rest/routers/presence/handlers/hide-me'
import { listNearby } from '@api/rest/routers/presence/handlers/list-nearby'
import { shareMe } from '@api/rest/routers/presence/handlers/share-me'
import { Router } from 'express'

// Hungry Nearby: anyone may see who is around; only signed-in people may appear.
export const createPresenceRouter = (dependencies: RestDependencies): Router => {
  const router = Router()
  router.use('/presence', (_request, response, next) => {
    response.set('Cache-Control', 'no-store')
    next()
  })
  router.get('/presence', listNearby(dependencies))
  router.put('/presence', shareMe(dependencies))
  router.delete('/presence', hideMe(dependencies))
  router.all('/presence', methodNotAllowed('GET', 'PUT', 'DELETE'))
  return router
}
