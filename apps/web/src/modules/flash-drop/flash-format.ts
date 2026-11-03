import type { PublicFlashDrop } from '@broke-oclock/contracts/flash-drops'
import { formatDistance, formatMoneyMinor } from '@web/lib/format'

// Text for Flash Drop banners, pins, the claim card and My codes. Numbers go through the shared
// Intl formatters in @web/lib/format.

// Keeps a number and its unit ("500 m") on one line.
const NBSP = '\u00a0'
const KILOMETRE = 1000
const withNbsp = (text: string): string => text.replace(/ /g, NBSP)

export const formatCents = (cents: number): string => formatMoneyMinor(cents)

const pad = (value: number) => String(value).padStart(2, '0')

// "29:41" under an hour, "1:02:03" past it, "0:00" once it has run out.
export const countdown = (endsAt: string, now: number): string => {
  const left = Math.max(0, Math.floor((new Date(endsAt).getTime() - now) / 1000))
  const hours = Math.floor(left / 3600)
  const minutes = Math.floor((left % 3600) / 60)
  const seconds = left % 60
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

// "−63%" when the drop beats a known usual price by a whole percent, otherwise null.
export const savingText = (flashCents: number, usualCents: number | null): string | null => {
  if (!usualCents || usualCents <= flashCents) return null
  const percent = Math.round(100 - (100 * flashCents) / usualCents)
  return percent >= 1 ? `−${percent}%` : null
}

export const codesLeftText = (drop: Pick<PublicFlashDrop, 'codesLeft'>): string =>
  drop.codesLeft === 1 ? '1 code left' : `${drop.codesLeft} codes left`

// A merchant's radius is a round setting, so a whole number of kilometres drops the ".0": "1 km".
export const radiusText = (metres: number): string => {
  const text = formatDistance(metres)
  const whole = metres >= KILOMETRE && metres % KILOMETRE === 0
  return withNbsp(whole ? text.replace(/\.0(?=\s)/, '') : text)
}

export const distanceText = (metres: number): string => withNbsp(formatDistance(metres))

// ----- The flash offer -----
// A flash deal's offer has the same choices as a deal: a fixed flash price, 1-for-1, a percentage
// off, or something else the title explains.
type FlashOffer = Pick<PublicFlashDrop, 'offerType' | 'discountPercent' | 'flashPriceCents'>

// "$1.50", "1-for-1", "30% off", or '' for any other offer.
export const offerText = (offer: FlashOffer): string => {
  if (offer.offerType === 'FIXED_PRICE' && offer.flashPriceCents !== null)
    return formatCents(offer.flashPriceCents)
  if (offer.offerType === 'BUY_ONE_GET_ONE') return '1-for-1'
  if (offer.offerType === 'PERCENT_OFF' && offer.discountPercent !== null)
    return `${offer.discountPercent}% off`
  return ''
}

// The offer and the deal title together: "1-for-1 Chicken rice", or just "Chicken rice".
export const offerTitle = (offer: FlashOffer & { dealTitle: string }): string =>
  [offerText(offer), offer.dealTitle].filter(Boolean).join(' ')
