import type { PublicFlashDrop } from '@broke-oclock/contracts/flash-drops'
import { formatDistance, formatMoneyMinor } from '@web/lib/format'

const NBSP = '\u00a0'
const KILOMETRE = 1000
const DAY_MS = 86_400_000
const withNbsp = (text: string): string => text.replace(/ /g, NBSP)

export const formatCents = (cents: number): string => formatMoneyMinor(cents)

const pad = (value: number) => String(value).padStart(2, '0')

export const countdown = (endsAt: string, now: number): string => {
  const left = Math.max(0, Math.floor((new Date(endsAt).getTime() - now) / 1000))
  const hours = Math.floor(left / 3600)
  const minutes = Math.floor((left % 3600) / 60)
  const seconds = left % 60
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

export const whenText = (iso: string, now: Date) => {
  const date = new Date(iso)
  const time = date
    .toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase()
  const dayDiff = Math.round(
    (new Date(date.toDateString()).getTime() - new Date(now.toDateString()).getTime()) / DAY_MS,
  )
  if (dayDiff === 0) return `Today ${time}`
  if (dayDiff === 1) return `Tomorrow ${time}`
  if (dayDiff === -1) return `Yesterday ${time}`
  const day = date.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' })
  return `${day}, ${time}`
}

export const useByText = (expiresAt: string, now: number): string =>
  new Date(expiresAt).getTime() - now <= 3_600_000
    ? `Use within ${countdown(expiresAt, now)}`
    : `Use by ${whenText(expiresAt, new Date(now)).toLowerCase()}`

export const savingText = (flashCents: number, usualCents: number | null): string | null => {
  if (!usualCents || usualCents <= flashCents) return null
  const percent = Math.round(100 - (100 * flashCents) / usualCents)
  return percent >= 1 ? `−${percent}%` : null
}

export const codesLeftText = (drop: Pick<PublicFlashDrop, 'codesLeft'>): string =>
  drop.codesLeft === 1 ? '1 code left' : `${drop.codesLeft} codes left`

export const radiusText = (metres: number): string => {
  const text = formatDistance(metres)
  const whole = metres >= KILOMETRE && metres % KILOMETRE === 0
  return withNbsp(whole ? text.replace(/\.0(?=\s)/, '') : text)
}

export const distanceText = (metres: number): string => withNbsp(formatDistance(metres))

type FlashOffer = Pick<PublicFlashDrop, 'offerType' | 'discountPercent' | 'flashPriceCents'>

export const offerText = (offer: FlashOffer): string => {
  if (offer.offerType === 'FIXED_PRICE' && offer.flashPriceCents !== null)
    return formatCents(offer.flashPriceCents)
  if (offer.offerType === 'BUY_ONE_GET_ONE') return '1-for-1'
  if (offer.offerType === 'PERCENT_OFF' && offer.discountPercent !== null)
    return `${offer.discountPercent}% off`
  return ''
}

export const offerTitle = (offer: FlashOffer & { dealTitle: string }): string =>
  [offerText(offer), offer.dealTitle].filter(Boolean).join(' ')
