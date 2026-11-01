import { shellQuery } from '@web/modules/map-shell/shell-routes'
import { type RouteLocationRaw, useRoute, useRouter } from 'vue-router'

// Keep browsing choices on navigation links. Panel-specific state, such as which saved
// collection a deal came from, must not leak into other sections.
export const useShellNavigation = () => {
  const route = useRoute()
  const router = useRouter()
  return (target: RouteLocationRaw): RouteLocationRaw => {
    const destination = router.resolve(target)
    const { collection: _collection, ...choices } = shellQuery(route.query)
    return {
      path: destination.path,
      hash: destination.hash,
      query: {
        ...choices,
        ...(destination.path === '/browse' &&
        route.query.view === 'list' &&
        destination.query.view === undefined
          ? { view: 'map', split: '1', results: 'list' }
          : {}),
        ...destination.query,
      },
    }
  }
}
