import { routeView } from '@web/modules/map-shell/shell-routes'
import { describe, expect, it } from 'vitest'

describe('routeView', () => {
  it.each(['browse', 'saved', 'deal', 'venue'])('keeps the All Deals list on %s', (name) => {
    expect(routeView({ name, query: { view: 'list', discovery: '1' } })).toBe('list')
  })

  it.each([
    'auth-required',
    'login',
    'register',
    'profile',
    'codes',
    'lobbie',
    'squad-new',
    'squad-join',
    'squad-room',
  ])('opens %s beside the map even when All Deals list view is carried over', (name) => {
    expect(routeView({ name, query: { view: 'list', discovery: '1' } })).toBe('map')
  })

  it('defaults to the map', () => {
    expect(routeView({ name: 'browse', query: {} })).toBe('map')
  })
})
