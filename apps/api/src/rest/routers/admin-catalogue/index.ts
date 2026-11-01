import type { RestDependencies } from '@api/rest/context'
import { methodNotAllowed } from '@api/rest/policy'
import { archiveAdminCatalogueMerchant } from '@api/rest/routers/admin-catalogue/archive-merchant'
import { archiveAdminCatalogueVenue } from '@api/rest/routers/admin-catalogue/archive-venue'
import { createAdminCatalogueMerchant } from '@api/rest/routers/admin-catalogue/create-merchant'
import { createAdminCatalogueVenue } from '@api/rest/routers/admin-catalogue/create-venue'
import { getAdminCatalogueMerchant } from '@api/rest/routers/admin-catalogue/get-merchant'
import { getAdminCatalogueVenue } from '@api/rest/routers/admin-catalogue/get-venue'
import { listAdminCatalogueMerchants } from '@api/rest/routers/admin-catalogue/list-merchants'
import { listAdminCatalogueVenues } from '@api/rest/routers/admin-catalogue/list-venues'
import { patchAdminCatalogueMerchant } from '@api/rest/routers/admin-catalogue/patch-merchant'
import { patchAdminCatalogueVenue } from '@api/rest/routers/admin-catalogue/patch-venue'
import { recordAdminCatalogueEvidence } from '@api/rest/routers/admin-catalogue/record-evidence'
import { withdrawAdminCatalogueEvidence } from '@api/rest/routers/admin-catalogue/withdraw-evidence'
import { Router } from 'express'

export const createAdminCatalogueRouter = (dependencies: RestDependencies) => {
  const router = Router()
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store')
    next()
  })
  router.get('/merchants', listAdminCatalogueMerchants(dependencies))
  router.get('/merchants/:id', getAdminCatalogueMerchant(dependencies))
  router.post('/merchants', createAdminCatalogueMerchant(dependencies))
  router.patch('/merchants/:id', patchAdminCatalogueMerchant(dependencies))
  router.post('/merchants/:id/archive', archiveAdminCatalogueMerchant(dependencies))
  router.get('/venues', listAdminCatalogueVenues(dependencies))
  router.get('/venues/:id', getAdminCatalogueVenue(dependencies))
  router.post('/venues', createAdminCatalogueVenue(dependencies))
  router.patch('/venues/:id', patchAdminCatalogueVenue(dependencies))
  router.post('/venues/:id/archive', archiveAdminCatalogueVenue(dependencies))
  router.post('/venues/:id/evidence', recordAdminCatalogueEvidence(dependencies))
  router.post('/venues/:id/evidence/withdraw', withdrawAdminCatalogueEvidence(dependencies))
  router.all('/merchants', methodNotAllowed('GET', 'POST'))
  router.all('/merchants/:id', methodNotAllowed('GET', 'PATCH'))
  router.all('/merchants/:id/archive', methodNotAllowed('POST'))
  router.all('/venues', methodNotAllowed('GET', 'POST'))
  router.all('/venues/:id', methodNotAllowed('GET', 'PATCH'))
  router.all('/venues/:id/archive', methodNotAllowed('POST'))
  router.all('/venues/:id/evidence', methodNotAllowed('POST'))
  router.all('/venues/:id/evidence/withdraw', methodNotAllowed('POST'))
  return router
}
