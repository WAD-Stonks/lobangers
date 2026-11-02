import { DomainError } from '@api/modules/domain-error'
import {
  FLASH_DROP_MANY_CODES,
  FLASH_DROP_MAX_LEAD_DAYS,
  type FlashDropDisplayStatus,
  type FlashDropView,
} from '@broke-oclock/contracts/flash-drops'

// Pure Flash Drop rules, shared by the merchant, admin and public handlers.

export type StoredStatus = 'PENDING' | 'APPROVED' | 'SENT_BACK' | 'STOPPED' | 'ENDED_EARLY'

export type DropTiming = {
  status: StoredStatus
  startsAt: Date
  endsAt: Date
  claimedCount: number
  codeLimit: number
}

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000
// A form filled in a minute ago with "start now" is still on time.
const START_GRACE_MS = MINUTE_MS
const EARTH_RADIUS_METRES = 6_371_000
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

export const displayStatus = (drop: DropTiming, now: Date): FlashDropDisplayStatus => {
  if (drop.status === 'SENT_BACK') return 'SENT_BACK'
  if (drop.status === 'STOPPED') return 'STOPPED'
  if (drop.status === 'ENDED_EARLY') return 'ENDED'
  // A drop nobody reviewed before its window closed simply never ran.
  if (drop.endsAt <= now) return 'ENDED'
  if (drop.status === 'PENDING') return 'IN_REVIEW'
  if (drop.startsAt > now) return 'SCHEDULED'
  return drop.claimedCount >= drop.codeLimit ? 'ENDED' : 'LIVE'
}

const VIEW_OF: Record<FlashDropDisplayStatus, FlashDropView> = {
  IN_REVIEW: 'review',
  SCHEDULED: 'scheduled',
  LIVE: 'live',
  ENDED: 'ended',
  SENT_BACK: 'ended',
  STOPPED: 'ended',
}
export const viewOf = (status: FlashDropDisplayStatus): FlashDropView => VIEW_OF[status]

export const isLive = (drop: DropTiming, now: Date) => displayStatus(drop, now) === 'LIVE'

export type Point = { lat: number; lng: number }

export const distanceMetres = (a: Point, b: Point): number => {
  const rad = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(h)))
}

export type Placed = Point & { startsAt: Date; endsAt: Date; radiusMetres: number }

// Two drops clash when their windows overlap and their circles touch, so one person could see
// two banners at once.
export const clashes = (a: Placed, b: Placed): boolean =>
  a.startsAt < b.endsAt &&
  b.startsAt < a.endsAt &&
  distanceMetres(a, b) < a.radiusMetres + b.radiusMetres

export const manyCodes = (codeLimit: number) => codeLimit > FLASH_DROP_MANY_CODES

// The window a merchant asked for, or a clear reason it cannot run.
export const scheduleWindow = (startsAtIso: string, durationMinutes: number, now: Date) => {
  const startsAt = new Date(startsAtIso)
  if (startsAt.getTime() < now.getTime() - START_GRACE_MS)
    throw new DomainError('BAD_REQUEST', 'A flash drop cannot start in the past')
  if (startsAt.getTime() > now.getTime() + FLASH_DROP_MAX_LEAD_DAYS * DAY_MS)
    throw new DomainError('BAD_REQUEST', 'A flash drop can start at most a week from now')
  // "Start now" begins at the moment it is sent, never a minute in the past.
  const start = startsAt < now ? now : startsAt
  return { startsAt: start, endsAt: new Date(start.getTime() + durationMinutes * MINUTE_MS) }
}

// Short codes people read out at a counter: no 0/O or 1/I to mix up.
export const newClaimCode = (random: (max: number) => number): string =>
  `LB-${Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[random(CODE_ALPHABET.length)]).join('')}`
