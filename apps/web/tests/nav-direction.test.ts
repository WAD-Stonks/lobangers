import { navDirection } from '@web/modules/map-shell/nav-direction'
import { describe, expect, it } from 'vitest'

const at = (name: string, path: string) => ({ name, path })

describe('panel navigation direction', () => {
  it('goes forward from browse to a deal', () => {
    expect(navDirection(at('deal', '/deals/1'), at('browse', '/'))).toBe('forward')
  })

  it('goes back from a deal to browse', () => {
    expect(navDirection(at('browse', '/'), at('deal', '/deals/1'))).toBe('back')
  })

  it('goes forward from one deal to another', () => {
    expect(navDirection(at('deal', '/deals/2'), at('deal', '/deals/1'))).toBe('forward')
  })

  it('does not move for the same route', () => {
    expect(navDirection(at('deal', '/deals/1'), at('deal', '/deals/1'))).toBe('none')
  })

  it('treats a venue as deeper than a deal', () => {
    expect(navDirection(at('deal', '/deals/1'), at('venue', '/venues/1'))).toBe('back')
    expect(navDirection(at('venue', '/venues/1'), at('deal', '/deals/1'))).toBe('forward')
  })
})
