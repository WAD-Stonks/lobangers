import type { RouteLocationNormalized, RouteMeta, Router } from 'vue-router'

const BRAND = 'Lobangers'

export const pageTitle = (
  route: Pick<RouteLocationNormalized, 'name'> & { meta: RouteMeta },
): string => {
  const label = route.meta.title ?? route.meta.panelLabel
  return label ? `${label} · ${BRAND}` : BRAND
}

export const trackPageTitle = (router: Router): void => {
  router.afterEach((to, _from, failure) => {
    if (!failure) document.title = pageTitle(to)
  })
}
