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

export type FlashDropDuration = (typeof FLASH_DROP_DURATIONS)[number]
export type FlashDropRadius = (typeof FLASH_DROP_RADII)[number]

export const CODE_STEP = 10
export const DEFAULT_CODES = 40

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000
const START_GRACE_MS = MINUTE_MS
const MAX_PRICE_CENTS = 100_000

export interface FlashFieldsState {
  usualDollars: number | ''
  codeLimit: number
  startMode: 'GO_LIVE' | 'LATER'
  startLocal: string
  durationMinutes: FlashDropDuration
  codeValidity: FlashCodeValidity
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

export const stepCodes = (current: number, direction: 1 | -1) =>
  Math.min(FLASH_DROP_MAX_CODES, Math.max(FLASH_DROP_MIN_CODES, current + direction * CODE_STEP))

const pad = (value: number) => String(value).padStart(2, '0')

export const toLocalInput = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`

export const startLimits = (now: Date) => ({
  min: toLocalInput(now),
  max: toLocalInput(new Date(now.getTime() + FLASH_DROP_MAX_LEAD_DAYS * DAY_MS)),
})

export const pickedStartOf = (fields: FlashFieldsState): Date | null => {
  if (fields.startLocal === '') return null
  const start = new Date(fields.startLocal)
  return Number.isNaN(start.getTime()) ? null : start
}

const usualCentsOf = (fields: FlashFieldsState) =>
  fields.usualDollars === '' ? null : Math.round(fields.usualDollars * 100)

export const moneyText = (cents: number) => formatMoneyMinor(cents)

export type FlashField = 'flashUsual' | 'flashCodes' | 'flashStart'
export type FlashProblem = { field: FlashField; message: string }

export type FlashOfferInput = {
  offerType: MerchantFlashDrop['offerType']
  priceCents: number | null
}

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

export const radiusLabel = (metres: number) =>
  metres >= 1000 ? `${metres / 1000} km` : `${metres} m`

export const CODE_VALIDITY_LABELS: Record<FlashCodeValidity, string> = {
  TWO_HOURS: '2 hours',
  END_OF_DAY: 'Until end of day',
  THREE_DAYS: '3 days',
  SEVEN_DAYS: '7 days',
}

const codesUntil = (drop: MerchantFlashDrop, now: Date) =>
  Date.parse(drop.codesExpireAt) > now.getTime()
    ? `until ${whenText(drop.codesExpireAt, now).toLowerCase()}`
    : null

const startText = (drop: MerchantFlashDrop, now: Date) =>
  drop.status === 'DRAFT' && drop.startsOnGoLive
    ? 'Starts at Go live'
    : whenText(drop.startsAt, now)

export const flashWhenText = (drop: MerchantFlashDrop, now: Date) =>
  `${startText(drop, now)} · ${durationMinutesOf(drop)} min`

export const flashReachText = (drop: MerchantFlashDrop) =>
  `${radiusLabel(drop.radiusMetres)} circle · ${drop.codeLimit} codes`

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

export const flashOfferText = (drop: MerchantFlashDrop) => offerText(drop)

export const bannerPreview = (
  fields: FlashFieldsState,
  title: string,
  offer: Pick<MerchantFlashDrop, 'offerType' | 'discountPercent' | 'flashPriceCents'>,
) => {
  const name = offerTitle({ ...offer, dealTitle: title.trim() || 'your deal' })
  return `FLASH DROP · ${name} · ${fields.durationMinutes}:00 · ${radiusLabel(fields.radiusMetres)} circle`
}
