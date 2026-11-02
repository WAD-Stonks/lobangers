import { routeLayout } from '@web/router/layouts'
import routes from '@web-tests/support/loaded-routes'
import { describe, expect, it } from 'vitest'

describe('route layouts', () => {
  it('defaults to the page layout under the All Deals header when a route declares no layout', () => {
    expect(routeLayout({ meta: {} })).toBe('page')
  })

  it('returns the declared layout', () => {
    expect(routeLayout({ meta: { layout: 'canvas' } })).toBe('canvas')
  })

  it('gives the browse map its own full-bleed canvas', () => {
    const canvasRoutes = routes.filter((route) => route.meta?.layout === 'canvas')
    expect(canvasRoutes.map((route) => route.path)).toEqual(['/browse'])
  })
})
