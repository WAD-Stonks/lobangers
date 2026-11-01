import type { PublicFlashDrop } from '@broke-oclock/contracts/flash-drops'

// Text for Flash Drop banners, pins, the claim card and My codes.

// Keeps a number and its unit ("500 m") on one line.
const NBSP = '\u00a0'

export const formatCents = (cents: number): string => `$${(cents / 100).toFixed(2)}`

const pad = (value: number) => String(value).padStart(2, '0')

// "29:41" under an hour, "1:02:03" past it, "0:00" once it has run out.
export const countdown = (endsAt: string, now: number): string => {
  const left = Math.max(0, Math.floor((new Date(endsAt).getTime() - now) / 1000))
  const hours = Math.floor(left / 3600)
  const minutes = Math.floor((left % 3600) / 60)
  const seconds = left % 60
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

export const secondsLeft = (endsAt: string, now: number): number =>
  Math.max(0, Math.floor((new Date(endsAt).getTime() - now) / 1000))

// "−63%" when the drop beats a known usual price by a whole percent, otherwise null.
export const savingText = (flashCents: number, usualCents: number | null): string | null => {
  if (!usualCents || usualCents <= flashCents) return null
  const percent = Math.round(100 - (100 * flashCents) / usualCents)
  return percent >= 1 ? `−${percent}%` : null
}

export const codesLeftText = (drop: Pick<PublicFlashDrop, 'codesLeft'>): string =>
  drop.codesLeft === 1 ? '1 code left' : `${drop.codesLeft} codes left`

export const radiusText = (metres: number): string =>
  metres >= 1000
    ? `${(metres / 1000).toFixed(metres % 1000 === 0 ? 0 : 1)}${NBSP}km`
    : `${metres}${NBSP}m`

export const distanceText = (metres: number): string =>
  metres >= 1000
    ? `${(metres / 1000).toFixed(1)}${NBSP}km`
    : `${Math.round(metres / 10) * 10}${NBSP}m`
