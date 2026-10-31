import { splitTerms } from '@broke-oclock/contracts/deal-copy'
import type { DealPin } from '@broke-oclock/contracts/deals'
import { isEndingToday, isVerified } from '@web/modules/browse-map/apply-filters'
import { OFFER_TYPE_LABELS } from '@web/modules/browse-map/filters'

// Small text helpers for the deal detail view. Dates are shown in Singapore time because
// every deal is local, whatever time zone the visitor's browser reports.
const SINGAPORE_TIME_ZONE = 'Asia/Singapore'
const NO_END_DATE = 'No end date given'
// An imported offer with no published end. The server drops it after a while; no date is shown.
export const LIMITED_PROMOTION = 'Limited promotion'

const endDateFormat = new Intl.DateTimeFormat('en-SG', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: SINGAPORE_TIME_ZONE,
})

// "Until 31 Dec 2026", else a limited promotion, else the deal's own wording, else a plain note.
export const formatValidity = (
  validUntil: string | null,
  rawValidityText: string | null,
  limitedTime = false,
): string => {
  if (validUntil !== null) {
    const endDate = new Date(validUntil)
    if (!Number.isNaN(endDate.getTime())) return `Until ${endDateFormat.format(endDate)}`
  }
  if (limitedTime) return LIMITED_PROMOTION
  return rawValidityText ?? NO_END_DATE
}

// Category codes are stored upper case with underscores, for example FAST_FOOD.
export const formatCategory = (category: string): string => {
  const words = category.toLowerCase().replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// The outlets a list row stands for beyond the one it shows; null for a single outlet.
export const formatMoreOutlets = (totalOutlets: number): string | null => {
  const others = totalOutlets - 1
  if (others < 1) return null
  return `+${others} more ${others === 1 ? 'outlet' : 'outlets'}`
}

const endTimeFormat = new Intl.DateTimeFormat('en-SG', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: SINGAPORE_TIME_ZONE,
})
const endDayFormat = new Intl.DateTimeFormat('en-SG', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: SINGAPORE_TIME_ZONE,
})
const singaporeDay = new Intl.DateTimeFormat('en-CA', { timeZone: SINGAPORE_TIME_ZONE })

// Short end for rows and the hot card: "Ends today, 10:00 pm" or "Ends Sat, 24 Oct".
export const formatEnding = (
  validUntil: string | null,
  now: Date = new Date(),
  limitedTime = false,
): string => {
  if (validUntil === null) return limitedTime ? LIMITED_PROMOTION : NO_END_DATE
  const end = new Date(validUntil)
  if (Number.isNaN(end.getTime())) return NO_END_DATE
  if (end.getTime() <= now.getTime()) return 'Ended'
  return singaporeDay.format(end) === singaporeDay.format(now)
    ? `Ends today, ${endTimeFormat.format(end)}`
    : `Ends ${endDayFormat.format(end)}`
}

export type FreshnessTone = 'ok' | 'end' | 'new'

// The small status tag on rows, cards and the deal panel.
export const dealFreshness = (
  deal: Pick<DealPin, 'validUntil' | 'votes'>,
  now: Date = new Date(),
): { readonly label: string; readonly tone: FreshnessTone } => {
  if (deal.validUntil && new Date(deal.validUntil).getTime() <= now.getTime())
    return { label: 'Expired', tone: 'end' }
  if (isEndingToday(deal, now)) return { label: 'Ends today', tone: 'end' }
  if (isVerified(deal.votes)) return { label: 'Likely still on', tone: 'ok' }
  if (deal.votes.dead > 0) return { label: 'Conflicting reports', tone: 'end' }
  return { label: 'Unverified', tone: 'new' }
}

// A guessed outlet is shown as quiet text beside the outlet count, not as a tag.
export const OUTLET_NOT_CONFIRMED = 'Outlet not confirmed'
export const OUTLET_NOT_CONFIRMED_NOTE =
  'Not confirmed for this outlet. The deal may not apply here, so check before you go.'

// Extra tags for rows, cards and the deal panel: currently only an open-ended offer.
export type NoticeTag = { readonly label: string; readonly tone: 'info' }

export const dealNoticeTags = (
  deal: Pick<DealPin, 'validUntil' | 'limitedTime'>,
): readonly NoticeTag[] =>
  deal.limitedTime && deal.validUntil === null ? [{ label: LIMITED_PROMOTION, tone: 'info' }] : []

// "Other" is the importer's catch-all and tells a visitor nothing, so it gets no tag.
export const offerTypeTag = (offerType: DealPin['offerType']): string | null =>
  offerType === 'OTHER' ? null : OFFER_TYPE_LABELS[offerType]

// The API falls back to the title when a deal has no price or offer wording, so a label that
// merely repeats the title is left out rather than shown twice.
export const priceText = (deal: Pick<DealPin, 'label' | 'title'>): string | null => {
  const label = deal.label.trim()
  return label && label !== deal.title.trim() ? label : null
}

// Terms are stored as plain sentences; the deal panel lists them as points so the fine print can
// be scanned. The split is shared with the copy tidy-up tool, which limits the number of points.
export const termsList = splitTerms
