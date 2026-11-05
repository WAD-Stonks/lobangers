import {
  defaultAvatarFor,
  distanceMetres,
  fuzzPoint,
  GRID_METRES,
  isInSingapore,
  MAX_FUZZ_METRES,
  MAX_OFFSET_METRES,
  MIN_OFFSET_METRES,
  MIN_SEPARATION_METRES,
  randomOffset,
  snapToGrid,
} from '@api/modules/presence/fuzz'
import {
  PRESENCE_AVATARS,
  presenceBodySchema,
  presenceQuerySchema,
} from '@broke-oclock/contracts/presence'
import { describe, expect, it } from 'vitest'

const seeded = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0
    return state / 2 ** 32
  }
}

const TAMPINES = { lat: 1.3236, lng: 103.9273 }

describe('snapToGrid', () => {
  it('maps every point in one cell to the same centre', () => {
    const a = snapToGrid(TAMPINES)
    const b = snapToGrid({ lat: TAMPINES.lat + 0.00001, lng: TAMPINES.lng + 0.00001 })
    expect(b).toEqual(a)
    expect(distanceMetres(a, TAMPINES)).toBeLessThanOrEqual((GRID_METRES * Math.SQRT2) / 2)
  })
})

describe('randomOffset', () => {
  it('stays inside the ring between the smallest and largest offset', () => {
    const random = seeded(7)
    for (let index = 0; index < 500; index += 1) {
      const { north, east } = randomOffset(random)
      const length = Math.hypot(north, east)
      expect(length).toBeGreaterThanOrEqual(MIN_OFFSET_METRES - 1e-9)
      expect(length).toBeLessThanOrEqual(MAX_OFFSET_METRES + 1e-9)
    }
  })
})

describe('fuzzPoint', () => {
  it('never returns the raw point and stays within the fuzz radius', () => {
    const random = seeded(42)
    for (let index = 0; index < 2000; index += 1) {
      const raw = { lat: 1.2 + random() * 0.25, lng: 103.62 + random() * 0.4 }
      const stored = fuzzPoint(raw, randomOffset(random))
      expect(stored).not.toEqual(raw)
      const distance = distanceMetres(stored, raw)
      expect(distance).toBeGreaterThanOrEqual(MIN_SEPARATION_METRES - 0.5)
      expect(distance).toBeLessThanOrEqual(MAX_FUZZ_METRES + 0.5)
    }
  })

  it('flips an offset that would cancel the snap back onto the raw point', () => {
    const centre = snapToGrid(TAMPINES)
    const raw = { lat: centre.lat + 50 / 111_320, lng: centre.lng }
    expect(snapToGrid(raw)).toEqual(centre)
    const stored = fuzzPoint(raw, { north: 50, east: 0 })
    expect(distanceMetres(stored, raw)).toBeGreaterThanOrEqual(MIN_SEPARATION_METRES)
    expect(stored.lat).toBeLessThan(centre.lat)
  })

  it('keeps the same point for the same cell and offset', () => {
    const offset = { north: 60, east: -80 }
    expect(fuzzPoint(TAMPINES, offset)).toEqual(
      fuzzPoint({ lat: TAMPINES.lat + 0.00002, lng: TAMPINES.lng }, offset),
    )
  })
})

describe('bounds and input', () => {
  it('accepts Singapore and rejects anywhere else', () => {
    expect(isInSingapore(TAMPINES)).toBe(true)
    expect(isInSingapore({ lat: 1.5, lng: 103.9 })).toBe(false)
    expect(isInSingapore({ lat: 1.3, lng: 104.2 })).toBe(false)
    expect(isInSingapore({ lat: Number.NaN, lng: 103.9 })).toBe(false)
    expect(presenceBodySchema.safeParse({ lat: 1.3, lng: 103.9 }).success).toBe(true)
    expect(presenceBodySchema.safeParse({ lat: 51.5, lng: -0.12 }).success).toBe(false)
    expect(presenceBodySchema.safeParse({ lat: 1.3, lng: 103.9, avatar: 'cat' }).success).toBe(
      false,
    )
    expect(presenceBodySchema.safeParse({ lat: 1.3, lng: 103.9, userId: 'x' }).success).toBe(false)
    expect(presenceQuerySchema.safeParse({ lat: '1.3', lng: '103.9' }).success).toBe(true)
    expect(presenceQuerySchema.safeParse({ lat: 'abc', lng: '103.9' }).success).toBe(false)
  })

  it('gives each person a stable default avatar', () => {
    const id = 'a1'.repeat(12)
    expect(defaultAvatarFor(id)).toBe(defaultAvatarFor(id))
    expect(PRESENCE_AVATARS).toContain(defaultAvatarFor(id))
  })
})
