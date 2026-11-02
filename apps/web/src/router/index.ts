import { authGuard } from '@web/router/guards'
import { trackPendingNavigation } from '@web/router/pending-navigation'
import routes from '@web/router/routes'
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes,
})
// Before authGuard, so the shell knows where the visitor is going while the session loads.
trackPendingNavigation(router)
router.beforeEach(authGuard)

export default router
