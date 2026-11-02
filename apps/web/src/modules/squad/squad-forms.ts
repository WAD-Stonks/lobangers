import type { DealPin } from '@broke-oclock/contracts/deals'
import {
  SQUAD_MAX_DEALS,
  SQUAD_MAX_SIZE,
  SQUAD_MIN_SIZE,
  SQUAD_NAME_MAX,
} from '@broke-oclock/contracts/squad'
import { distanceMetres } from '@web/modules/browse-map/distance'
import type { Coordinates } from '@web/modules/browse-map/types'

// Pure helpers behind the Squad create and join screens: room codes, names, room size and the
// order deals are offered in. Every function returns new values and never edits its input.

export const SQUAD_CODE_LENGTH = 4
export const DEFAULT_CAPACITY = 4

// What someone typed or pasted ("kopi", "K O P I", "kopi-") as the four capital letters.
export const normaliseCode = (raw: string): string =>
  raw
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, SQUAD_CODE_LENGTH)

export const isCompleteCode = (code: string): boolean => /^[A-Z]{4}$/.test(code)

// A route query value (?code=, ?room=) as a code, or null when it is not one.
export const codeFromQuery = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const code = normaliseCode(value)
  return isCompleteCode(code) ? code : null
}

// The account's first name, trimmed to what a room allows.
export const defaultSquadName = (fullName: string | null | undefined): string =>
  (fullName ?? '').trim().split(/\s+/)[0]?.slice(0, SQUAD_NAME_MAX) ?? ''

export const squadNameError = (name: string): string => {
  const trimmed = name.trim()
  if (!trimmed) return 'Type the name your friends know you by.'
  if (trimmed.length > SQUAD_NAME_MAX) return `Keep it to ${SQUAD_NAME_MAX} characters.`
  return ''
}

export const clampCapacity = (value: number): number =>
  Math.min(SQUAD_MAX_SIZE, Math.max(SQUAD_MIN_SIZE, Math.round(value)))

// Adds or removes one deal; adding past the limit leaves the list as it was.
export const toggleDealId = (
  selected: readonly string[],
  dealId: string,
  max: number = SQUAD_MAX_DEALS,
): readonly string[] => {
  if (selected.includes(dealId)) return selected.filter((id) => id !== dealId)
  if (selected.length >= max) return selected
  return [...selected, dealId]
}

export type PickableDeal = {
  readonly deal: DealPin
  readonly venueName: string
  readonly distanceMetres: number | null
}

// Each deal once, at its nearest outlet, nearest first. Without a position, the list order.
export const nearestDeals = (
  deals: readonly DealPin[],
  position: Coordinates | null,
): readonly PickableDeal[] => {
  const seen = new Set<string>()
  const rows = deals.flatMap((deal) => {
    if (seen.has(deal.id) || deal.venues.length === 0) return []
    seen.add(deal.id)
    const outlets = deal.venues.map((venue) => ({
      venue,
      distance: position ? distanceMetres(position, venue) : null,
    }))
    const nearest = [...outlets].sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))[0]
    return nearest
      ? [{ deal, venueName: nearest.venue.name, distanceMetres: nearest.distance }]
      : []
  })
  return position
    ? [...rows].sort((a, b) => (a.distanceMetres ?? 0) - (b.distanceMetres ?? 0))
    : rows
}

// How far "near me" reaches when someone's position is known.
export const NEARBY_METRES = 1500

// Every deal within walking distance (all of them when the position is unknown), in a random
// order and cut to `max`, for a room that picks its own deals. `random` is injectable for tests.
export const nearbyDealIds = (
  rows: readonly PickableDeal[],
  max: number = SQUAD_MAX_DEALS,
  random: () => number = Math.random,
): readonly string[] => {
  const ids = rows
    .filter((row) => row.distanceMetres === null || row.distanceMetres <= NEARBY_METRES)
    .map((row) => row.deal.id)
  const shuffled = ids.reduceRight<string[]>(
    (out, _id, index) => {
      const swap = Math.floor(random() * (index + 1))
      return out.map((value, i) =>
        i === index ? (out[swap] ?? value) : i === swap ? (out[index] ?? value) : value,
      )
    },
    [...ids],
  )
  return shuffled.slice(0, max)
}

// "27:41" until the lobby closes itself; "0:00" once it is due.
export const formatCountdown = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export type JoinProblem = 'name' | 'full' | 'code'

// Which field a join refusal belongs to, from the server's readable message.
export const joinProblemFor = (message: string): JoinProblem => {
  if (/already called/i.test(message)) return 'name'
  if (/is full/i.test(message)) return 'full'
  return 'code'
}
