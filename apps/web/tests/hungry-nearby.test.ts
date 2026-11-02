import { AVATARS, avatarSrc, PERSON_LABEL } from '@web/modules/hungry-nearby/avatars'
import {
  ALL_PEOPLE_FROM_ZOOM,
  MAX_LOOSE_WHEN_GROUPED,
  planPeople,
  type ScreenPerson,
} from '@web/modules/hungry-nearby/nearby-cluster'
import { poke } from '@web/modules/hungry-nearby/nearby-layer'
import {
  DEFAULT_PREFS,
  NEARBY_PREFS_KEY,
  parsePrefs,
  readPrefs,
  writePrefs,
} from '@web/modules/hungry-nearby/nearby-prefs'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Synthetic people only.
const person = (index: number, x: number, y: number): ScreenPerson => ({
  token: `synthetic-token-${String(index).padStart(4, '0')}`,
  avatar: AVATARS[index % AVATARS.length] ?? 'bao',
  lat: 1.3 + index * 0.0001,
  lng: 103.9,
  x,
  y,
})

describe('avatars', () => {
  it('points at the idle and poked images for each lobanger', () => {
    expect(AVATARS).toHaveLength(6)
    expect(avatarSrc('kopi')).toBe('/lobangers/kopi-idle.webp')
    expect(avatarSrc('kopi', 'poked')).toBe('/lobangers/kopi-poked.webp')
    expect(PERSON_LABEL).toBe('Another lobanger')
  })
})

describe('nearby prefs', () => {
  afterEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('reads only well-formed choices and never shares without looking', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('not json')).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('[1]')).toEqual({ looking: false, sharing: false, avatar: null })
    expect(parsePrefs('{"looking":true,"sharing":true,"avatar":"teh"}')).toEqual({
      looking: true,
      sharing: true,
      avatar: 'teh',
    })
    expect(parsePrefs('{"looking":false,"sharing":true,"avatar":"cat"}')).toEqual(DEFAULT_PREFS)
  })

  it('round-trips through storage', () => {
    writePrefs({ looking: true, sharing: false, avatar: 'ondeh' })
    expect(window.localStorage.getItem(NEARBY_PREFS_KEY)).toContain('ondeh')
    expect(readPrefs()).toEqual({ looking: true, sharing: false, avatar: 'ondeh' })
  })

  it('keeps working when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(readPrefs()).toEqual(DEFAULT_PREFS)
    expect(() => writePrefs({ looking: true, sharing: true, avatar: null })).not.toThrow()
  })
})

describe('planPeople', () => {
  it('shows everyone up close', () => {
    const people = [person(1, 0, 0), person(2, 1, 1), person(3, 2, 2)]
    expect(planPeople(people, ALL_PEOPLE_FROM_ZOOM)).toEqual({ loose: people, chips: [] })
  })

  it('groups people sharing a patch into a chip of faces in between', () => {
    const crowd = [person(1, 10, 10), person(2, 12, 14), person(3, 20, 5), person(4, 30, 30)]
    const alone = person(5, 400, 400)
    const plan = planPeople([...crowd, alone], 14)
    expect(plan.loose.map((item) => item.token)).toEqual([alone.token])
    expect(plan.chips).toHaveLength(1)
    expect(plan.chips[0]?.count).toBe(4)
    expect(plan.chips[0]?.faces).toHaveLength(3)
  })

  it('draws at most a dozen single people when grouped, and none at island view', () => {
    const scattered = Array.from({ length: 20 }, (_, index) => person(index, index * 200, 0))
    const plan = planPeople(scattered, 14)
    expect(plan.loose).toHaveLength(MAX_LOOSE_WHEN_GROUPED)
    expect(plan.loose.length + plan.chips.reduce((sum, chip) => sum + chip.count, 0)).toBe(20)
    const island = planPeople(scattered, 11)
    expect(island.loose).toHaveLength(0)
    expect(island.chips.reduce((sum, chip) => sum + chip.count, 0)).toBe(20)
  })
})

describe('poke', () => {
  it('squashes, swaps to the poked face, then springs back', () => {
    vi.useFakeTimers()
    const root = document.createElement('span')
    const image = document.createElement('img')
    image.src = avatarSrc('bao')
    root.append(image)
    poke(root, 'bao')
    expect(root.classList.contains('is-poked')).toBe(true)
    expect(root.classList.contains('is-labelled')).toBe(true)
    expect(image.getAttribute('src')).toBe('/lobangers/bao-poked.webp')
    vi.advanceTimersByTime(300)
    expect(root.classList.contains('is-poked')).toBe(false)
    expect(image.getAttribute('src')).toBe('/lobangers/bao-idle.webp')
    vi.advanceTimersByTime(2000)
    expect(root.classList.contains('is-labelled')).toBe(false)
    vi.useRealTimers()
  })
})
