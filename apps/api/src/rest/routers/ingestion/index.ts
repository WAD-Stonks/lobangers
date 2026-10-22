import type { RestDependencies } from '@api/rest/context'
import { methodNotAllowed } from '@api/rest/policy'
import { postIngestionSource } from '@api/rest/routers/ingestion/handlers/add-source'
import { patchIngestionDraftOutlet } from '@api/rest/routers/ingestion/handlers/associate-outlet'
import { getIngestionAccounts } from '@api/rest/routers/ingestion/handlers/get-accounts'
import { getIngestionDashboard } from '@api/rest/routers/ingestion/handlers/get-dashboard'
import { getIngestionDrafts } from '@api/rest/routers/ingestion/handlers/get-drafts'
import { getIngestionRuns } from '@api/rest/routers/ingestion/handlers/get-runs'
import { getIngestionSources } from '@api/rest/routers/ingestion/handlers/get-sources'
import { postIngestionDraftReview } from '@api/rest/routers/ingestion/handlers/review-draft'
import { postIngestionRun } from '@api/rest/routers/ingestion/handlers/run-ingestion'
import { getScheduledIngestionRun } from '@api/rest/routers/ingestion/handlers/run-scheduled-ingestion'
import { searchIngestionLocations } from '@api/rest/routers/ingestion/handlers/search-locations'
import { patchIngestionDraftCategory } from '@api/rest/routers/ingestion/handlers/set-category'
import { patchIngestionSource } from '@api/rest/routers/ingestion/handlers/update-source'
import { Router } from 'express'

export const createIngestionRouter = (dependencies: RestDependencies): Router => {
  const router = Router()
  router.get('/sources', getIngestionSources(dependencies))
  router.post('/sources', postIngestionSource(dependencies))
  router.all('/sources', methodNotAllowed('GET', 'POST'))
  router.patch('/sources/:sourceId', patchIngestionSource(dependencies))
  router.all('/sources/:sourceId', methodNotAllowed('PATCH'))
  router.all('/scheduled-runs', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store')
    next()
  })
  // Express implicitly dispatches HEAD to GET unless HEAD is registered first.
  router.head('/scheduled-runs', methodNotAllowed('GET'))
  router.get('/scheduled-runs', getScheduledIngestionRun(dependencies))
  router.all('/scheduled-runs', methodNotAllowed('GET'))
  router.get('/dashboard', getIngestionDashboard(dependencies))
  router.get('/accounts', getIngestionAccounts(dependencies))
  router.get('/drafts', getIngestionDrafts(dependencies))
  router.patch('/drafts/:dealId/outlet', patchIngestionDraftOutlet(dependencies))
  router.all('/drafts/:dealId/outlet', methodNotAllowed('PATCH'))
  router.patch('/drafts/:dealId/category', patchIngestionDraftCategory(dependencies))
  router.all('/drafts/:dealId/category', methodNotAllowed('PATCH'))
  router.post('/drafts/:dealId/review', postIngestionDraftReview(dependencies))
  router.get('/runs', getIngestionRuns(dependencies))
  router.post('/runs', postIngestionRun(dependencies))
  router.get('/locations', searchIngestionLocations(dependencies))
  router.all('/dashboard', methodNotAllowed('GET'))
  router.all('/accounts', methodNotAllowed('GET'))
  router.all('/drafts', methodNotAllowed('GET'))
  router.all('/drafts/:dealId/review', methodNotAllowed('POST'))
  router.all('/runs', methodNotAllowed('GET', 'POST'))
  router.all('/locations', methodNotAllowed('GET'))
  return router
}
