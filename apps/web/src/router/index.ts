import { authGuard } from '@web/router/guards'
import { trackPageTitle } from '@web/router/page-title'
import { trackPendingNavigation } from '@web/router/pending-navigation'
import routes from '@web/router/routes'
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes,
})
trackPendingNavigation(router)
router.beforeEach(authGuard)
trackPageTitle(router)

export default router
