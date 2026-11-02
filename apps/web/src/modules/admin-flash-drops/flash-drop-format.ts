import type {
  AdminFlashDrop,
  FlashDropDisplayStatus,
  FlashDropView,
} from '@broke-oclock/contracts/flash-drops'
import { formatMoneyMinor } from '@web/lib/format'

// Presentation helpers for the admin Flash Drop review. Times are always shown in SGT.
export const SINGAPORE_TIME_ZONE = 'Asia/Singapore'

export type DecisionKind = 'APPROVE' | 'SEND_BACK' | 'STOP'
export type CheckTone = 'ok' | 'warn' | 'bad'
export type CheckRow = {
  key: string
  tone: CheckTone
  text: string
  details?: readonly string[]
}

export const FLASH_DROP_VIEWS: readonly { view: FlashDropView; label: string }[] = [
  { view: 'review', label: 'Needs review' },
  { view: 'scheduled', label: 'Scheduled' },
  { view: 'live', label: 'Live' },
  { view: 'ended', label: 'Ended' },
]

const STATUS_LABELS: Record<FlashDropDisplayStatus, string> = {
  IN_REVIEW: 'Needs review',
  SCHEDULED: 'Scheduled',
  LIVE: 'Live',
  ENDED: 'Ended',
  SENT_BACK: 'Sent back',
  STOPPED: 'Stopped',
}
const STATUS_TONES: Record<FlashDropDisplayStatus, string> = {
  IN_REVIEW: 'review',
  SCHEDULED: 'ok',
  LIVE: 'live',
  ENDED: 'neutral',
  SENT_BACK: 'bad',
  STOPPED: 'bad',
}
export const statusLabel = (status: FlashDropDisplayStatus) => STATUS_LABELS[status]
export const statusTone = (status: FlashDropDisplayStatus) => STATUS_TONES[status]
export const listStatusLabel = (drop: AdminFlashDrop) =>
  drop.status === 'LIVE'
    ? `${drop.claimedCount}/${drop.codeLimit} claimed`
    : statusLabel(drop.status)

// "$5.00" via the shared Intl formatter.
export const formatPrice = (cents: number) => formatMoneyMinor(cents)

export const percentOff = (flashCents: number, usualCents: number | null) =>
  usualCents && usualCents > flashCents ? Math.round(100 - (100 * flashCents) / usualCents) : null

export const offerLine = (drop: AdminFlashDrop) => {
  const flash = formatPrice(drop.flashPriceCents)
  if (drop.usualPriceCents == null) return `${flash} (no usual price recorded)`
  const off = percentOff(drop.flashPriceCents, drop.usualPriceCents)
  const usual = `usual ${formatPrice(drop.usualPriceCents)}`
  return off == null ? `${flash} (${usual})` : `${flash} (${usual}, ${off}% off)`
}

const dayFormatter = new Intl.DateTimeFormat('en-SG', {
  day: 'numeric',
  month: 'short',
  timeZone: SINGAPORE_TIME_ZONE,
})
const timeFormatter = new Intl.DateTimeFormat('en-SG', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: SINGAPORE_TIME_ZONE,
})
const valid = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
export const formatTime = (value: string) => {
  const date = valid(value)
  return date ? timeFormatter.format(date).replace(/\s?([ap])\.?m\.?$/i, ' $1m') : 'Unavailable'
}
export const formatDay = (value: string) => {
  const date = valid(value)
  return date ? dayFormatter.format(date) : 'Unavailable'
}
export const durationMinutes = (drop: Pick<AdminFlashDrop, 'startsAt' | 'endsAt'>) =>
  Math.max(0, Math.round((Date.parse(drop.endsAt) - Date.parse(drop.startsAt)) / 60_000))
export const windowLine = (drop: Pick<AdminFlashDrop, 'startsAt' | 'endsAt'>) =>
  `${formatDay(drop.startsAt)}, ${formatTime(drop.startsAt)} – ${formatTime(drop.endsAt)}`
export const formatUpdated = (date: Date) =>
  `${formatDay(date.toISOString())}, ${formatTime(date.toISOString())}`

export const formatDistance = (metres: number) =>
  metres >= 1000
    ? `${(metres / 1000).toFixed(metres % 1000 === 0 ? 0 : 1)}\u00a0km`
    : `${metres}\u00a0m`

export const decisionsFor = (status: FlashDropDisplayStatus): readonly DecisionKind[] =>
  status === 'IN_REVIEW'
    ? ['APPROVE', 'SEND_BACK']
    : status === 'SCHEDULED' || status === 'LIVE'
      ? ['STOP']
      : []

export const DECISION_COPY: Record<
  DecisionKind,
  { choice: string; submit: string; verb: string; noteLabel: string; placeholder: string }
> = {
  APPROVE: {
    choice: 'Approve',
    submit: 'Approve drop',
    verb: 'approving',
    noteLabel: 'Note for the merchant (optional)',
    placeholder: 'e.g. Looks good, thanks!',
  },
  SEND_BACK: {
    choice: 'Send back to merchant',
    submit: 'Send back',
    verb: 'sending back',
    noteLabel: 'What should they change? (required)',
    placeholder: 'e.g. Please use 500 m so it does not overlap another drop.',
  },
  STOP: {
    choice: 'Stop drop now',
    submit: 'Stop drop now',
    verb: 'stopping',
    noteLabel: 'Why are you stopping it? (required)',
    placeholder: 'e.g. Stall says they ran out early.',
  },
}

const priceCheck = (drop: AdminFlashDrop): CheckRow => {
  if (drop.checks.priceLower === null)
    return {
      key: 'price',
      tone: 'warn',
      text: 'No usual price is recorded, so the saving cannot be checked.',
    }
  return drop.checks.priceLower
    ? { key: 'price', tone: 'ok', text: 'Flash price is lower than the usual price.' }
    : { key: 'price', tone: 'bad', text: 'Flash price is not lower than the usual price.' }
}

export const checkRows = (drop: AdminFlashDrop): readonly CheckRow[] => {
  const { checks } = drop
  const overlaps = checks.overlaps.map(
    (overlap) =>
      `${overlap.dealTitle} · ${overlap.outletName} · ${formatDistance(overlap.distanceMetres)} away`,
  )
  return [
    checks.merchantHoldsOutlet
      ? { key: 'outlet', tone: 'ok', text: `${drop.merchantName} manages this outlet.` }
      : {
          key: 'outlet',
          tone: 'bad',
          text: `${drop.merchantName} does not have merchant access to this outlet.`,
        },
    checks.outletLocated
      ? {
          key: 'located',
          tone: 'ok',
          text: 'Outlet location is verified, so the banner circle is in the right place.',
        }
      : {
          key: 'located',
          tone: 'bad',
          text: 'Outlet location is not verified. The banner circle could be in the wrong place.',
        },
    priceCheck(drop),
    overlaps.length
      ? {
          key: 'overlaps',
          tone: 'bad',
          text: `Overlaps ${overlaps.length === 1 ? 'another drop' : `${overlaps.length} other drops`} at the same time. Ask for a smaller radius or a later start.`,
          details: overlaps,
        }
      : { key: 'overlaps', tone: 'ok', text: 'No other drop covers this area at the same time.' },
    checks.manyCodes
      ? {
          key: 'codes',
          tone: 'warn',
          text: `${drop.codeLimit} codes is a lot for one stall. Check they can serve it.`,
        }
      : { key: 'codes', tone: 'ok', text: `${drop.codeLimit} codes is fine for one stall.` },
  ]
}

export const CHECK_MARKS: Record<CheckTone, { mark: string; label: string }> = {
  ok: { mark: '✓', label: 'Passed' },
  warn: { mark: '?', label: 'Check' },
  bad: { mark: '!', label: 'Problem' },
}

export const outcomeLine = (drop: AdminFlashDrop) => {
  const note = drop.reviewNote ? `: “${drop.reviewNote}”` : '.'
  if (drop.status === 'SENT_BACK') return `Sent back to the merchant${note}`
  if (drop.status === 'STOPPED') return `Stopped by an admin${note}`
  if (drop.status === 'ENDED')
    return `Ended. ${drop.claimedCount} of ${drop.codeLimit} codes claimed.${drop.reviewNote ? ` Review note: “${drop.reviewNote}”` : ''}`
  return null
}
