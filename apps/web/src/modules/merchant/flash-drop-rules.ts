import {
  DEFAULT_FLASH_CODE_VALIDITY,
  FLASH_DROP_DURATIONS,
  FLASH_DROP_MAX_CODES,
  FLASH_DROP_MAX_LEAD_DAYS,
  FLASH_DROP_MIN_CODES,
  FLASH_DROP_RADII,
  type FlashCodeValidity,
  type FlashDropDisplayStatus,
  type MerchantFlashDrop,
  type MerchantFlashDropBody,
} from '@broke-oclock/contracts/flash-drops'
import { formatMoneyMinor } from '@web/lib/format'
import { offerText, offerTitle, whenText } from '@web/modules/flash-drop/flash-format'

export { whenText }

// Plain helpers for flash deals on the merchant dashboard: the flash part of the deal form,
// checking it before saving, and the sentences shown on each flash deal. The flash offer itself
// is the deal form's own offer (1-for-1, % off, a fixed price or other). No Vue and no requests
// in here, so they are easy to test.

export type FlashDropDuration = (typeof FLASH_DROP_DURATIONS)[number]
export type FlashDropRadius = (typeof FLASH_DROP_RADII)[number]

// How many codes the + and − buttons add or take away.
export const CODE_STEP = 10
export const DEFAULT_CODES = 40

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000
// The server lets a start time be a minute late, so we do the same.
const START_GRACE_MS = MINUTE_MS
// The deal form's top price is $1,000 (100,000 cents); flash prices share that limit.
const MAX_PRICE_CENTS = 100_000

// ----- The flash part of the deal form -----

export interface FlashFieldsState {
  // For a fixed-price flash offer, the usual price it beats, typed in dollars. Optional.
  usualDollars: number | ''
  codeLimit: number
  // GO_LIVE starts it the moment the merchant presses Go live; LATER at the time in startLocal.
  startMode: 'GO_LIVE' | 'LATER'
  startLocal: string // 'YYYY-MM-DDTHH:mm' from the datetime-local box, used when LATER
  durationMinutes: FlashDropDuration // how long people can claim codes
  codeValidity: FlashCodeValidity // how long a claimed code works once claiming closes
  radiusMetres: FlashDropRadius
}

export const blankFlashFields = (): FlashFieldsState => ({
  usualDollars: '',
  codeLimit: DEFAULT_CODES,
  startMode: 'GO_LIVE',
  startLocal: '',
  durationMinutes: 30,
  codeValidity: DEFAULT_FLASH_CODE_VALIDITY,
  radiusMetres: 500,
})

export const durationMinutesOf = (drop: Pick<MerchantFlashDrop, 'startsAt' | 'endsAt'>) =>
  Math.round((Date.parse(drop.endsAt) - Date.parse(drop.startsAt)) / MINUTE_MS)

// The flash fields filled in from a draft, so the merchant can change it.
export const flashFieldsFromDrop = (drop: MerchantFlashDrop): FlashFieldsState => {
  const minutes = durationMinutesOf(drop)
  return {
    usualDollars: drop.usualPriceCents === null ? '' : drop.usualPriceCents / 100,
    codeLimit: drop.codeLimit,
    startMode: drop.startsOnGoLive ? 'GO_LIVE' : 'LATER',
    startLocal: drop.startsOnGoLive ? '' : toLocalInput(new Date(drop.startsAt)),
    durationMinutes: FLASH_DROP_DURATIONS.find((value) => value === minutes) ?? 30,
    codeValidity: drop.codeValidity ?? DEFAULT_FLASH_CODE_VALIDITY,
    radiusMetres: FLASH_DROP_RADII.find((value) => value === drop.radiusMetres) ?? 500,
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

// The picked start time, or null for one that cannot be read. Only used when LATER.
export const pickedStartOf = (fields: FlashFieldsState): Date | null => {
  if (fields.startLocal === '') return null
  // A 'YYYY-MM-DDTHH:mm' string with no zone is read in the browser's own time zone.
  const start = new Date(fields.startLocal)
  return Number.isNaN(start.getTime()) ? null : start
}

const usualCentsOf = (fields: FlashFieldsState) =>
  fields.usualDollars === '' ? null : Math.round(fields.usualDollars * 100)

export const moneyText = (cents: number) => formatMoneyMinor(cents)

// ----- Checking the flash fields -----
// These repeat the server's rules so the merchant hears about a problem straight away; the
// server still checks everything again (and checks the start time again at Go live).

export type FlashField = 'flashUsual' | 'flashCodes' | 'flashStart'
export type FlashProblem = { field: FlashField; message: string }

// The flash offer from the deal form; the deal form checks its own fields.
export type FlashOfferInput = {
  offerType: MerchantFlashDrop['offerType']
  priceCents: number | null
}

// The usual price is optional and only for a fixed flash price, which it has to be above.
const checkUsual = (fields: FlashFieldsState, offer: FlashOfferInput) => {
  const usual = usualCentsOf(fields)
  if (usual === null || offer.offerType !== 'FIXED_PRICE') return ''
  if (usual < 1 || usual > MAX_PRICE_CENTS) return 'Enter the usual price, for example 4.00.'
  if (offer.priceCents !== null && usual <= offer.priceCents) {
    return `The usual price has to be higher than the flash price of ${moneyText(offer.priceCents)}.`
  }
  return ''
}

const checkStart = (fields: FlashFieldsState, now: Date) => {
  if (fields.startMode === 'GO_LIVE') return ''
  const start = pickedStartOf(fields)
  if (start === null) return 'Choose when the flash deal starts.'
  if (start.getTime() < now.getTime() - START_GRACE_MS) {
    return 'A flash deal cannot start in the past. Choose a later time.'
  }
  if (start.getTime() > now.getTime() + FLASH_DROP_MAX_LEAD_DAYS * DAY_MS) {
    return 'A flash deal can start at most a week from now.'
  }
  return ''
}

export const flashFieldsProblem = (
  fields: FlashFieldsState,
  offer: FlashOfferInput,
  now: Date,
): FlashProblem | null => {
  const usual = checkUsual(fields, offer)
  if (usual) return { field: 'flashUsual', message: usual }
  if (fields.codeLimit < FLASH_DROP_MIN_CODES || fields.codeLimit > FLASH_DROP_MAX_CODES) {
    return {
      field: 'flashCodes',
      message: `Give out between ${FLASH_DROP_MIN_CODES} and ${FLASH_DROP_MAX_CODES} codes.`,
    }
  }
  const start = checkStart(fields, now)
  return start ? { field: 'flashStart', message: start } : null
}

// The deal part of the body: what the deal form already collects.
export type FlashDealInput = Omit<
  MerchantFlashDropBody,
  | 'outletId'
  | 'usualPriceCents'
  | 'startsAt'
  | 'durationMinutes'
  | 'codeValidity'
  | 'radiusMetres'
  | 'codeLimit'
  | 'version'
>

// What the server needs. Only call this once flashFieldsProblem has returned null.
export const toFlashDropBody = (
  deal: FlashDealInput,
  outletId: string,
  fields: FlashFieldsState,
): MerchantFlashDropBody => ({
  ...deal,
  outletId,
  usualPriceCents: deal.offerType === 'FIXED_PRICE' ? usualCentsOf(fields) : null,
  startsAt: fields.startMode === 'GO_LIVE' ? null : (pickedStartOf(fields)?.toISOString() ?? null),
  durationMinutes: fields.durationMinutes,
  codeValidity: fields.codeValidity,
  radiusMetres: fields.radiusMetres,
  codeLimit: fields.codeLimit,
})

// ----- Text for showing a flash deal -----

export const radiusLabel = (metres: number) =>
  metres >= 1000 ? `${metres / 1000} km` : `${metres} m`

// The chips for how long a claimed code works once claiming closes.
export const CODE_VALIDITY_LABELS: Record<FlashCodeValidity, string> = {
  TWO_HOURS: '2 hours',
  END_OF_DAY: 'Until end of day',
  THREE_DAYS: '3 days',
  SEVEN_DAYS: '7 days',
}

// "until today 8:00 pm" for codes that still work, or null once they have expired.
const codesUntil = (drop: MerchantFlashDrop, now: Date) =>
  Date.parse(drop.codesExpireAt) > now.getTime()
    ? `until ${whenText(drop.codesExpireAt, now).toLowerCase()}`
    : null

// When a flash deal starts, in words: a draft may start "when you press Go live".
const startText = (drop: MerchantFlashDrop, now: Date) =>
  drop.status === 'DRAFT' && drop.startsOnGoLive
    ? 'Starts at Go live'
    : whenText(drop.startsAt, now)

// When a flash deal runs, for its card: "Today 6:00 pm · 30 min" or "Starts at Go live · 30 min".
export const flashWhenText = (drop: MerchantFlashDrop, now: Date) =>
  `${startText(drop, now)} · ${durationMinutesOf(drop)} min`

// How far the banner reaches and how many codes there are: "500 m · 40 codes".
export const flashReachText = (drop: MerchantFlashDrop) =>
  `${radiusLabel(drop.radiusMetres)} · ${drop.codeLimit} codes`

// "Maxwell · Today 6:00 pm · 30 min · 500 m · 40 codes"
export const summaryLine = (drop: MerchantFlashDrop, now: Date) =>
  [
    drop.outletName,
    startText(drop, now),
    `${durationMinutesOf(drop)} min`,
    radiusLabel(drop.radiusMetres),
    `${drop.codeLimit} codes`,
  ].join(' · ')

const minutesLeft = (drop: MerchantFlashDrop, now: Date) =>
  Math.max(1, Math.ceil((Date.parse(drop.endsAt) - now.getTime()) / MINUTE_MS))

export const statusSentence = (drop: MerchantFlashDrop, now: Date) => {
  const sentences: Record<FlashDropDisplayStatus, () => string> = {
    DRAFT: () =>
      drop.startsOnGoLive
        ? 'Draft. Nobody can see it yet. It starts as soon as you press Go live.'
        : `Draft. Nobody can see it yet. Press Go live to start it ${whenText(drop.startsAt, now).toLowerCase()}.`,
    SCHEDULED: () =>
      `Going live ${whenText(drop.startsAt, now).toLowerCase()} for ${durationMinutesOf(drop)} min.`,
    LIVE: () => {
      const left = `Live now · ${minutesLeft(drop, now)} min left to claim`
      const until = codesUntil(drop, now)
      return until ? `${left} · codes work ${until}` : left
    },
    ENDED: () => {
      const claimed =
        drop.claimedCount >= drop.codeLimit
          ? `All ${drop.codeLimit} codes claimed.`
          : `Ended. ${drop.claimedCount} of ${drop.codeLimit} codes claimed.`
      // Codes outlive claiming, so the merchant knows to keep honouring them.
      const until = codesUntil(drop, now)
      return until && drop.claimedCount > 0 ? `${claimed} Codes still work ${until}.` : claimed
    },
    STOPPED: () => 'Removed by LoBangers.',
  }
  return sentences[drop.status]()
}

export const STATUS_LABELS: Record<FlashDropDisplayStatus, string> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  LIVE: 'Live',
  ENDED: 'Ended',
  STOPPED: 'Removed',
}

// The flash offer in words, e.g. "$1.50", "1-for-1" or "30% off" ('' for another offer).
export const flashOfferText = (drop: MerchantFlashDrop) => offerText(drop)

// The small banner people near the stall will see, as text, with the same wording as the map:
// "FLASH DROP · 1-for-1 chicken rice · 30:00 · within 500 m"
export const bannerPreview = (
  fields: FlashFieldsState,
  title: string,
  offer: Pick<MerchantFlashDrop, 'offerType' | 'discountPercent' | 'flashPriceCents'>,
) => {
  const name = offerTitle({ ...offer, dealTitle: title.trim() || 'your deal' })
  return `FLASH DROP · ${name} · ${fields.durationMinutes}:00 · within ${radiusLabel(fields.radiusMetres)}`
}
