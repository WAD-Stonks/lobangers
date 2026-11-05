import { createHash } from 'node:crypto'
import {
  PRESENCE_AVATARS,
  PRESENCE_BOUNDS,
  type PresenceAvatar,
} from '@broke-oclock/contracts/presence'

export type Point = { readonly lat: number; readonly lng: number }
export type Offset = { readonly north: number; readonly east: number }

export const GRID_METRES = 150
export const MIN_OFFSET_METRES = 40
export const MAX_OFFSET_METRES = 150
export const MIN_SEPARATION_METRES = 20
export const MAX_FUZZ_METRES = (GRID_METRES * Math.SQRT2) / 2 + MAX_OFFSET_METRES

const METRES_PER_DEGREE_LAT = 111_320
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

export const fuzzPoint = (raw: Point, offset: Offset): Point => {
  const centre = snapToGrid(raw)
  const forward = shift(centre, offset, 1)
  return distanceMetres(forward, raw) >= MIN_SEPARATION_METRES ? forward : shift(centre, offset, -1)
}

export const defaultAvatarFor = (userId: string): PresenceAvatar => {
  const digest = createHash('sha256').update(`lobanger:${userId}`).digest()
  return PRESENCE_AVATARS[digest.readUInt32BE(0) % PRESENCE_AVATARS.length] ?? 'bao'
}
