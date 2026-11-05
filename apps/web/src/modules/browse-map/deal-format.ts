import { splitTerms } from '@broke-oclock/contracts/deal-copy'
import type { DealPin } from '@broke-oclock/contracts/deals'
import { isEndingToday, isVerified } from '@web/modules/browse-map/apply-filters'
import { OFFER_TYPE_LABELS } from '@web/modules/browse-map/filters'

const SINGAPORE_TIME_ZONE = 'Asia/Singapore'
const NO_END_DATE = 'No end date given'
export const LIMITED_PROMOTION = 'Limited promotion'

const endDateFormat = new Intl.DateTimeFormat('en-SG', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: SINGAPORE_TIME_ZONE,
})

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

export const formatCategory = (category: string): string => {
  const words = category.toLowerCase().replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

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

export const dealFreshness = (
  deal: Pick<DealPin, 'validUntil' | 'votes'>,
  now: Date = new Date(),
): { readonly label: string; readonly tone: FreshnessTone } => {
  if (deal.validUntil && new Date(deal.validUntil).getTime() <= now.getTime())
    return { label: 'Expired', tone: 'end' }
  if (isEndingToday(deal, now)) return { label: 'Ends today', tone: 'end' }
  if (isVerified(deal.votes)) return { label: 'Likely still on', tone: 'ok' }
  if (deal.votes.dead > 0) return { label: 'Mixed reports', tone: 'end' }
  return { label: 'Unverified', tone: 'new' }
}

export const OUTLET_NOT_CONFIRMED = 'Outlet not confirmed'
export const OUTLET_NOT_CONFIRMED_NOTE =
  'Not confirmed for this outlet. The deal may not apply here, so check before you go.'

export type NoticeTag = { readonly label: string; readonly tone: 'info' }

export const dealNoticeTags = (
  deal: Pick<DealPin, 'validUntil' | 'limitedTime'>,
): readonly NoticeTag[] =>
  deal.limitedTime && deal.validUntil === null ? [{ label: LIMITED_PROMOTION, tone: 'info' }] : []

export const offerTypeTag = (offerType: DealPin['offerType']): string | null =>
  offerType === 'OTHER' ? null : OFFER_TYPE_LABELS[offerType]

export const priceText = (deal: Pick<DealPin, 'label' | 'title'>): string | null => {
  const label = deal.label.trim()
  return label && label !== deal.title.trim() ? label : null
}

export const termsList = splitTerms
