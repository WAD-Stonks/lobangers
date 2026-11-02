import { createHash } from 'node:crypto'
import {
  PRESENCE_AVATARS,
  PRESENCE_BOUNDS,
  type PresenceAvatar,
} from '@broke-oclock/contracts/presence'

// Privacy helpers for Hungry Nearby. A raw position is snapped to the centre of a coarse grid
// cell, then moved by a random offset fixed for the sharing session. Only that fuzzed point is
// ever stored or shown. The grid makes the point stay put while someone wanders inside a cell
// (so averaging heartbeats reveals nothing), and the offset stops the cell centre itself from
// being read off the map.

export type Point = { readonly lat: number; readonly lng: number }
// Metres north and east of the cell centre.
export type Offset = { readonly north: number; readonly east: number }

export const GRID_METRES = 150
export const MIN_OFFSET_METRES = 40
export const MAX_OFFSET_METRES = 150
// A fuzzed point is never closer than this to the raw position it came from.
export const MIN_SEPARATION_METRES = 20
// The farthest a fuzzed point can land from the raw position: half a cell's diagonal plus the
// largest offset.
export const MAX_FUZZ_METRES = (GRID_METRES * Math.SQRT2) / 2 + MAX_OFFSET_METRES

const METRES_PER_DEGREE_LAT = 111_320
// Singapore spans about a third of a degree of latitude, so one scale serves the whole island.
const METRES_PER_DEGREE_LNG = METRES_PER_DEGREE_LAT * Math.cos((1.35 * Math.PI) / 180)
const STORED_DECIMALS = 1e6

export const isInSingapore = ({ lat, lng }: Point): boolean =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= PRESENCE_BOUNDS.south &&
  lat <= PRESENCE_BOUNDS.north &&
  lng >= PRESENCE_BOUNDS.west &&
  lng <= PRESENCE_BOUNDS.east

export const distanceMetres = (a: Point, b: Point): number =>
  Math.hypot((a.lat - b.lat) * METRES_PER_DEGREE_LAT, (a.lng - b.lng) * METRES_PER_DEGREE_LNG)

const snapAxis = (degrees: number, metresPerDegree: number) =>
  ((Math.floor((degrees * metresPerDegree) / GRID_METRES) + 0.5) * GRID_METRES) / metresPerDegree

export const snapToGrid = ({ lat, lng }: Point): Point => ({
  lat: snapAxis(lat, METRES_PER_DEGREE_LAT),
  lng: snapAxis(lng, METRES_PER_DEGREE_LNG),
})

// Uniform over the ring between the smallest and largest offset.
export const randomOffset = (random: () => number): Offset => {
  const angle = random() * 2 * Math.PI
  const inner = MIN_OFFSET_METRES ** 2
  const radius = Math.sqrt(inner + random() * (MAX_OFFSET_METRES ** 2 - inner))
  return { north: radius * Math.sin(angle), east: radius * Math.cos(angle) }
}

const shift = (point: Point, offset: Offset, sign: 1 | -1): Point => ({
  lat:
    Math.round((point.lat + (sign * offset.north) / METRES_PER_DEGREE_LAT) * STORED_DECIMALS) /
    STORED_DECIMALS,
  lng:
    Math.round((point.lng + (sign * offset.east) / METRES_PER_DEGREE_LNG) * STORED_DECIMALS) /
    STORED_DECIMALS,
})

// Should the offset happen to cancel the snap and land back near the raw point, the opposite
// offset is used instead, which then lands at least twice the snap distance away.
export const fuzzPoint = (raw: Point, offset: Offset): Point => {
  const centre = snapToGrid(raw)
  const forward = shift(centre, offset, 1)
  return distanceMetres(forward, raw) >= MIN_SEPARATION_METRES ? forward : shift(centre, offset, -1)
}

// A stable default avatar per person, so they look the same each time they turn sharing on.
export const defaultAvatarFor = (userId: string): PresenceAvatar => {
  const digest = createHash('sha256').update(`lobanger:${userId}`).digest()
  return PRESENCE_AVATARS[digest.readUInt32BE(0) % PRESENCE_AVATARS.length] ?? 'bao'
}
