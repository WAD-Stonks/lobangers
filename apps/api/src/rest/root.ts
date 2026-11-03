import type { RestDependencies } from '@api/rest/context'
import { createAccountRouter } from '@api/rest/routers/account'
import { createAdminCatalogueRouter } from '@api/rest/routers/admin-catalogue'
import { createAdminDealsRouter } from '@api/rest/routers/admin-deals'
import { createAdminModerationRouter } from '@api/rest/routers/admin-moderation'
import { createAssistantRouter } from '@api/rest/routers/assistant'
import { createCommunityRouter } from '@api/rest/routers/community'
import { createDealsRouter } from '@api/rest/routers/deals'
import { createFlashDropsRouter } from '@api/rest/routers/flash-drops'
import { createInfrastructureRouter } from '@api/rest/routers/infrastructure'
import { createIngestionRouter } from '@api/rest/routers/ingestion'
import { createIngestionInvestigationRouter } from '@api/rest/routers/ingestion-investigation'
import { createMerchantRouter } from '@api/rest/routers/merchant'
import { createPlatformAdminRouter } from '@api/rest/routers/platform-admin'
import { createPlatformSecurityRouter } from '@api/rest/routers/platform-security'
import { createPresenceRouter } from '@api/rest/routers/presence'
import { createShareRouter } from '@api/rest/routers/share'
import { createSquadRouter } from '@api/rest/routers/squad'
import { createVenuesRouter } from '@api/rest/routers/venues'
import { Router } from 'express'

export const createRestRouter = (dependencies: RestDependencies): Router => {
  const router = Router()
  router.use(createInfrastructureRouter(dependencies))
  router.use(createCommunityRouter(dependencies))
  // Before the merchant router, whose /merchant mount would otherwise answer 404 first.
  router.use(createFlashDropsRouter(dependencies))
  router.use(createSquadRouter(dependencies))
  router.use(createPresenceRouter(dependencies))
  router.use('/ingestion', createIngestionRouter(dependencies))
  router.use('/ingestion', createIngestionInvestigationRouter(dependencies))
  router.use('/account', createAccountRouter(dependencies))
  router.use(createPlatformAdminRouter(dependencies))
  router.use(createPlatformSecurityRouter(dependencies))
  router.use('/admin/deals', createAdminDealsRouter(dependencies))
  router.use('/admin/catalogue', createAdminCatalogueRouter(dependencies))
  router.use(createAdminModerationRouter(dependencies))
  router.use('/deals', createDealsRouter(dependencies))
  router.use(createShareRouter(dependencies))
  router.use('/assistant', createAssistantRouter(dependencies))
  router.use('/merchant', createMerchantRouter(dependencies))
  router.use('/venues', createVenuesRouter(dependencies))
  return router
}
