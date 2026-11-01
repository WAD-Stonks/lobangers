import {
  FLASH_DROP_DURATIONS,
  FLASH_DROP_MAX_CODES,
  FLASH_DROP_MAX_LEAD_DAYS,
  FLASH_DROP_MIN_CODES,
  FLASH_DROP_RADII,
  type FlashDropDisplayStatus,
  type MerchantFlashDrop,
  type MerchantFlashDropBody,
} from '@broke-oclock/contracts/flash-drops'
import type { MerchantDeal, MerchantOutlet } from '@web/modules/merchant/merchant-api'

// Plain helpers for the Flash Drop part of the merchant dashboard: the form's fields, checking
// them before sending, and the sentences shown on each drop. No Vue and no requests in here, so
// they are easy to test.

export type FlashDropDuration = (typeof FLASH_DROP_DURATIONS)[number]
export type FlashDropRadius = (typeof FLASH_DROP_RADII)[number]

// How many codes the + and − buttons add or take away.
export const CODE_STEP = 10
export const DEFAULT_CODES = 40

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000
// The server lets a "start now" drop be a minute late, so we do the same.
const START_GRACE_MS = MINUTE_MS
// The deal form's top price is $1,000 (100,000 cents); flash prices share that limit.
const MAX_PRICE_CENTS = 100_000

// ----- The form -----

export interface FlashDropFormState {
  dealId: string
  priceDollars: number | '' // typed in dollars, sent in cents
  codeLimit: number
  outletId: string
  startMode: 'NOW' | 'LATER'
  startLocal: string // 'YYYY-MM-DDTHH:mm' from the datetime-local box, used when LATER
  durationMinutes: FlashDropDuration
  radiusMetres: FlashDropRadius
}

// The outlets a deal runs at, in the merchant's own outlet order.
export const outletsForDeal = (deal: MerchantDeal | undefined, outlets: MerchantOutlet[]) =>
  deal ? outlets.filter((outlet) => deal.outletIds.includes(outlet.id)) : []

// Picks the outlet for a newly chosen deal: keep the current one if the deal runs there,
// otherwise tick the only outlet, or leave it for the merchant to choose.
export const outletAfterDealChange = (
  currentOutletId: string,
  deal: MerchantDeal | undefined,
  outlets: MerchantOutlet[],
): string => {
  const choices = outletsForDeal(deal, outlets)
  if (choices.some((outlet) => outlet.id === currentOutletId)) return currentOutletId
  return choices.length === 1 ? (choices[0]?.id ?? '') : ''
}

// An empty form, optionally already pointing at one deal.
export const blankFlashDropForm = (
  deal: MerchantDeal | undefined,
  outlets: MerchantOutlet[],
): FlashDropFormState => ({
  dealId: deal?.id ?? '',
  priceDollars: '',
  codeLimit: DEFAULT_CODES,
  outletId: outletAfterDealChange('', deal, outlets),
  startMode: 'NOW',
  startLocal: '',
  durationMinutes: 30,
  radiusMetres: 500,
})

// The form filled in from a drop that was sent back, so the merchant can fix and resend it.
export const formFromDrop = (drop: MerchantFlashDrop): FlashDropFormState => {
  const minutes = Math.round((Date.parse(drop.endsAt) - Date.parse(drop.startsAt)) / MINUTE_MS)
  const duration = FLASH_DROP_DURATIONS.find((value) => value === minutes) ?? 30
  const radius = FLASH_DROP_RADII.find((value) => value === drop.radiusMetres) ?? 500
  return {
    dealId: drop.dealId,
    priceDollars: drop.flashPriceCents / 100,
    codeLimit: drop.codeLimit,
    outletId: drop.outletId,
    startMode: 'LATER',
    startLocal: toLocalInput(new Date(drop.startsAt)),
    durationMinutes: duration,
    radiusMetres: radius,
  }
}

// One step up or down on the codes stepper, kept between 10 and 200.
export const stepCodes = (current: number, direction: 1 | -1) =>
  Math.min(FLASH_DROP_MAX_CODES, Math.max(FLASH_DROP_MIN_CODES, current + direction * CODE_STEP))

// ----- Times -----

const pad = (value: number) => String(value).padStart(2, '0')

// A Date as 'YYYY-MM-DDTHH:mm' in the merchant's own time zone, the format datetime-local uses.
export const toLocalInput = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`

// Earliest and latest values for the datetime-local box.
export const startLimits = (now: Date) => ({
  min: toLocalInput(now),
  max: toLocalInput(new Date(now.getTime() + FLASH_DROP_MAX_LEAD_DAYS * DAY_MS)),
})

// When the drop would start. "Now" means the moment it is sent. Returns null for a time that
// cannot be read.
export const startTimeOf = (form: FlashDropFormState, now: Date): Date | null => {
  if (form.startMode === 'NOW') return now
  if (form.startLocal === '') return null
  // A 'YYYY-MM-DDTHH:mm' string with no zone is read in the browser's own time zone.
  const start = new Date(form.startLocal)
  return Number.isNaN(start.getTime()) ? null : start
}

const priceCentsOf = (form: FlashDropFormState) =>
  form.priceDollars === '' ? Number.NaN : Math.round(form.priceDollars * 100)

export const moneyText = (cents: number) => `$${(cents / 100).toFixed(2)}`

// ----- Checking the form -----
// Returns a message describing the first problem with the form, or '' if it is fine.
// These repeat the server's rules so the merchant hears about a problem straight away; the
// server still checks everything again.

const checkPrice = (form: FlashDropFormState, deal: MerchantDeal) => {
  const cents = priceCentsOf(form)
  if (!Number.isFinite(cents) || cents < 1) return 'Enter the flash price, for example 1.50.'
  if (cents > MAX_PRICE_CENTS) return 'The flash price looks too high. Please check it.'
  // Only deals with a set price have a "usual price" to beat.
  if (deal.priceCents !== null && deal.priceCents > 0 && cents >= deal.priceCents) {
    return `The flash price has to be lower than the usual ${moneyText(deal.priceCents)}.`
  }
  return ''
}

const checkStart = (form: FlashDropFormState, deal: MerchantDeal, now: Date) => {
  const start = startTimeOf(form, now)
  if (start === null) return 'Choose when the drop starts.'
  if (start.getTime() < now.getTime() - START_GRACE_MS) {
    return 'A flash drop cannot start in the past. Choose a later time.'
  }
  if (start.getTime() > now.getTime() + FLASH_DROP_MAX_LEAD_DAYS * DAY_MS) {
    return 'A flash drop can start at most a week from now.'
  }
  // The deal's own dates are whole days ('YYYY-MM-DD') in the merchant's time zone.
  const end = new Date(start.getTime() + form.durationMinutes * MINUTE_MS)
  if (deal.startDate && start.toLocaleDateString('en-CA') < deal.startDate) {
    return `This deal only starts on ${deal.startDate}. Choose a time while it runs.`
  }
  if (deal.endDate && end.toLocaleDateString('en-CA') > deal.endDate) {
    return 'Choose one of your deals that runs for the whole drop.'
  }
  return ''
}

export const checkFlashDropForm = (
  form: FlashDropFormState,
  deal: MerchantDeal | undefined,
  now: Date,
): string => {
  if (!deal) return 'Choose which deal to drop.'
  const priceProblem = checkPrice(form, deal)
  if (priceProblem) return priceProblem
  if (form.codeLimit < FLASH_DROP_MIN_CODES || form.codeLimit > FLASH_DROP_MAX_CODES) {
    return `Give out between ${FLASH_DROP_MIN_CODES} and ${FLASH_DROP_MAX_CODES} codes.`
  }
  if (form.outletId === '') return 'Choose the outlet for the drop.'
  if (!deal.outletIds.includes(form.outletId)) return 'That deal does not run at the chosen outlet.'
  return checkStart(form, deal, now)
}

// What the server needs. Only call this once checkFlashDropForm has returned ''.
export const toFlashDropBody = (form: FlashDropFormState, now: Date): MerchantFlashDropBody => ({
  dealId: form.dealId,
  outletId: form.outletId,
  flashPriceCents: priceCentsOf(form),
  startsAt: (startTimeOf(form, now) ?? now).toISOString(),
  durationMinutes: form.durationMinutes,
  radiusMetres: form.radiusMetres,
  codeLimit: form.codeLimit,
})

// ----- Text for showing a drop -----

export const radiusLabel = (metres: number) =>
  metres >= 1000 ? `${metres / 1000} km` : `${metres} m`

export const durationMinutesOf = (drop: MerchantFlashDrop) =>
  Math.round((Date.parse(drop.endsAt) - Date.parse(drop.startsAt)) / MINUTE_MS)

// "Today 6:00 pm", "Tomorrow 12:30 pm", "Yesterday 12:00 pm" or "Sat 7 Nov, 6:00 pm".
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

// "Maxwell · Today 6:00 pm · 30 min · 500 m · 40 codes"
export const summaryLine = (drop: MerchantFlashDrop, now: Date) =>
  [
    drop.outletName,
    whenText(drop.startsAt, now),
    `${durationMinutesOf(drop)} min`,
    radiusLabel(drop.radiusMetres),
    `${drop.codeLimit} codes`,
  ].join(' · ')

const minutesLeft = (drop: MerchantFlashDrop, now: Date) =>
  Math.max(1, Math.ceil((Date.parse(drop.endsAt) - now.getTime()) / MINUTE_MS))

export const statusSentence = (drop: MerchantFlashDrop, now: Date) => {
  const sentences: Record<FlashDropDisplayStatus, () => string> = {
    IN_REVIEW: () => 'In review. LoBangers is checking it.',
    SCHEDULED: () =>
      `Approved. Goes live ${whenText(drop.startsAt, now).toLowerCase()} for ${durationMinutesOf(drop)} min.`,
    LIVE: () => `Live now · ${minutesLeft(drop, now)} min left`,
    ENDED: () =>
      drop.claimedCount >= drop.codeLimit
        ? `All ${drop.codeLimit} codes claimed.`
        : `Ended. ${drop.claimedCount} of ${drop.codeLimit} codes claimed.`,
    SENT_BACK: () => 'Sent back. Fix it and send it again.',
    STOPPED: () => 'Stopped by LoBangers.',
  }
  return sentences[drop.status]()
}

export const STATUS_LABELS: Record<FlashDropDisplayStatus, string> = {
  IN_REVIEW: 'In review',
  SCHEDULED: 'Approved',
  LIVE: 'Live',
  ENDED: 'Ended',
  SENT_BACK: 'Sent back',
  STOPPED: 'Stopped',
}

// The small banner people near the stall will see, as text:
// "FLASH DROP · $1.50 chicken rice · 30:00 · within 500 m"
export const bannerPreview = (form: FlashDropFormState, deal: MerchantDeal | undefined) => {
  const cents = priceCentsOf(form)
  const price = Number.isFinite(cents) && cents > 0 ? moneyText(cents) : '$?'
  const title = deal ? deal.title : 'your deal'
  return `FLASH DROP · ${price} ${title} · ${form.durationMinutes}:00 · within ${radiusLabel(form.radiusMetres)}`
}
