import type { RouteMeta } from 'vue-router'

// `page` puts the page under the All Deals header in the shared container.
// `canvas` hands the whole viewport to the page so the floating header sits on top of it.
export type SiteLayout = 'page' | 'canvas' | 'landing' | 'auth'

declare module 'vue-router' {
  interface RouteMeta {
    layout?: SiteLayout
  }
}

export const routeLayout = (route: { readonly meta: RouteMeta }): SiteLayout =>
  route.meta.layout ?? 'page'
