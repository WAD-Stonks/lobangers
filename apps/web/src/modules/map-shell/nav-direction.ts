export type NavDirection = 'forward' | 'back' | 'none'

type RouteLike = { readonly name?: unknown; readonly path: string }

const ROUTE_DEPTH: Readonly<Record<string, number>> = {
  browse: 0,
  deal: 1,
  'add-deal': 1,
  login: 1,
  register: 1,
  profile: 1,
  saved: 1,
  venue: 2,
}
const DEFAULT_DEPTH = 1

const depthOf = (route: RouteLike): number =>
  typeof route.name === 'string' ? (ROUTE_DEPTH[route.name] ?? DEFAULT_DEPTH) : DEFAULT_DEPTH

export const navDirection = (to: RouteLike, from: RouteLike): NavDirection => {
  if (to.path === from.path) return 'none'
  return depthOf(to) < depthOf(from) ? 'back' : 'forward'
}
