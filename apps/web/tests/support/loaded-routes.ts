import routes from '@web/router/routes'
import { createMemoryHistory, createRouter, loadRouteLocation } from 'vue-router'

// Behavioral app fixtures previously compiled every view with the eager route import.
// Keep compilation outside their interaction budgets. The isolated route-loading
// test and native browser suite still exercise the actual lazy-loading boundary.
const router = createRouter({ history: createMemoryHistory(), routes })
await Promise.all(
  router
    .getRoutes()
    .filter((record) => !record.redirect)
    .map((record) => loadRouteLocation(router.resolve(record.path))),
)

export default routes
