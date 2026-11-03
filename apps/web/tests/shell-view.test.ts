import { panelSnapFor, routeView } from '@web/modules/map-shell/shell-routes'
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

describe('panelSnapFor', () => {
  it('opens Squad screens over the whole screen, forms full and deals at half', () => {
    for (const name of ['squad-new', 'squad-join', 'squad-room'])
      expect(panelSnapFor(name, 'map')).toBe(3)
    expect(panelSnapFor('login', 'map')).toBe(2)
    expect(panelSnapFor('deal', 'map')).toBe(1)
    expect(panelSnapFor('browse', 'list')).toBe(2)
  })

  it('opens the Lobbie chat and the sign-in prompt full so their input and button are in view', () => {
    expect(panelSnapFor('lobbie', 'map')).toBe(2)
    expect(panelSnapFor('auth-required', 'map')).toBe(2)
  })
})
