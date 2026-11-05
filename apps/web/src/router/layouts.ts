import type { RouteMeta } from 'vue-router'

export type SiteLayout = 'page' | 'canvas' | 'landing' | 'auth'

declare module 'vue-router' {
  interface RouteMeta {
    layout?: SiteLayout
  }
}

export const routeLayout = (route: { readonly meta: RouteMeta }): SiteLayout =>
  route.meta.layout ?? 'page'
