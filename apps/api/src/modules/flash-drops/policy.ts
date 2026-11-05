import { DomainError } from '@api/modules/domain-error'
import {
  FLASH_DROP_MANY_CODES,
  FLASH_DROP_MAX_LEAD_DAYS,
  type FlashCodeValidity,
  type FlashDropDisplayStatus,
  type FlashDropView,
} from '@broke-oclock/contracts/flash-drops'

export type StoredStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'APPROVED'
  | 'SENT_BACK'
  | 'STOPPED'
  | 'ENDED_EARLY'

export const DRAFT_STATUSES = ['DRAFT', 'PENDING', 'SENT_BACK'] as const
export const isDraft = (status: StoredStatus) =>
  (DRAFT_STATUSES as readonly StoredStatus[]).includes(status)

export type DropTiming = {
  status: StoredStatus
  startsAt: Date
  endsAt: Date
  claimedCount: number
  codeLimit: number
}

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
const SINGAPORE_OFFSET_MS = 8 * HOUR_MS
const START_GRACE_MS = MINUTE_MS
const EARTH_RADIUS_METRES = 6_371_000
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

export const displayStatus = (drop: DropTiming, now: Date): FlashDropDisplayStatus => {
  if (isDraft(drop.status)) return 'DRAFT'
  if (drop.status === 'STOPPED') return 'STOPPED'
  if (drop.status === 'ENDED_EARLY') return 'ENDED'
  if (drop.endsAt <= now) return 'ENDED'
  if (drop.startsAt > now) return 'SCHEDULED'
  return drop.claimedCount >= drop.codeLimit ? 'ENDED' : 'LIVE'
}

const VIEW_OF: Record<FlashDropDisplayStatus, FlashDropView | null> = {
  DRAFT: null,
  SCHEDULED: 'scheduled',
  LIVE: 'live',
  ENDED: 'ended',
  STOPPED: 'ended',
}
export const viewOf = (status: FlashDropDisplayStatus): FlashDropView | null => VIEW_OF[status]

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

export const clashes = (a: Placed, b: Placed): boolean =>
  a.startsAt < b.endsAt &&
  b.startsAt < a.endsAt &&
  distanceMetres(a, b) < a.radiusMetres + b.radiusMetres

export const manyCodes = (codeLimit: number) => codeLimit > FLASH_DROP_MANY_CODES

export const scheduleWindow = (startsAtIso: string, durationMinutes: number, now: Date) => {
  const startsAt = new Date(startsAtIso)
  if (startsAt.getTime() < now.getTime() - START_GRACE_MS)
    throw new DomainError('BAD_REQUEST', 'A flash deal cannot start in the past')
  if (startsAt.getTime() > now.getTime() + FLASH_DROP_MAX_LEAD_DAYS * DAY_MS)
    throw new DomainError('BAD_REQUEST', 'A flash deal can start at most a week from now')
  const start = startsAt < now ? now : startsAt
  return { startsAt: start, endsAt: new Date(start.getTime() + durationMinutes * MINUTE_MS) }
}

const endOfSingaporeDay = (at: Date) =>
  new Date(
    (Math.floor((at.getTime() + SINGAPORE_OFFSET_MS) / DAY_MS) + 1) * DAY_MS -
      SINGAPORE_OFFSET_MS -
      1,
  )

const VALIDITY_MS: Record<Exclude<FlashCodeValidity, 'END_OF_DAY'>, number> = {
  TWO_HOURS: 2 * HOUR_MS,
  THREE_DAYS: 3 * DAY_MS,
  SEVEN_DAYS: 7 * DAY_MS,
}

export const codesExpireAt = (claimingEndsAt: Date, validity: FlashCodeValidity): Date =>
  validity === 'END_OF_DAY'
    ? endOfSingaporeDay(claimingEndsAt)
    : new Date(claimingEndsAt.getTime() + VALIDITY_MS[validity])

export type CodeTiming = {
  status: StoredStatus
  endsAt: Date
  codesExpireAt: Date | null
}

export const codeIsActive = (drop: CodeTiming, now: Date): boolean => {
  if (!drop.codesExpireAt) return drop.status === 'APPROVED' && drop.endsAt > now
  return (drop.status === 'APPROVED' || drop.status === 'ENDED_EARLY') && drop.codesExpireAt > now
}

export const newClaimCode = (random: (max: number) => number): string =>
  `LB-${Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[random(CODE_ALPHABET.length)]).join('')}`
