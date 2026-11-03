import type { RouteLocationNormalized, RouteMeta, Router } from 'vue-router'

const BRAND = 'Lobangers'

// The tab title names the page first, so tabs, history and screen readers tell routes apart.
// Map panels reuse their panel label; routes with neither keep the plain brand.
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
