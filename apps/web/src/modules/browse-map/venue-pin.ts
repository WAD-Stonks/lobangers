import type { DealPin } from '@broke-oclock/contracts/deals'
import { isEndingToday, isVerified } from '@web/modules/browse-map/apply-filters'
import { categoryStyle, createCategoryIconElement } from '@web/modules/browse-map/category-style'
import { DEAL_PIN_CLASS, DEAL_PIN_LABEL_MAX_CHARS } from '@web/modules/browse-map/map-config'
import type { VenuePin } from '@web/modules/browse-map/types'
import L from 'leaflet'

const ELLIPSIS = '…'
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

export type PinState = {
  readonly selected?: boolean
  readonly dimmed?: boolean
  readonly hot?: boolean
}

export const pinLabel = (deal: Pick<DealPin, 'title' | 'label'>): string => {
  // An empty label (no price or offer text yet) falls back to the title.
  const text = deal.label.trim() || deal.title.trim()
  if (text.length <= DEAL_PIN_LABEL_MAX_CHARS) return text
  return `${text.slice(0, DEAL_PIN_LABEL_MAX_CHARS - 1).trimEnd()}${ELLIPSIS}`
}

// One deal: its price or offer. Several deals at the outlet: how many there are.
export const pinBadgeText = (deals: readonly Pick<DealPin, 'title' | 'label'>[]): string => {
  const [first] = deals
  if (deals.length === 1 && first) return pinLabel(first)
  return `${deals.length} deals`
}

// Small corner flags: "ending today" wins over "verified" so the urgent one is never hidden.
export const pinFlag = (
  deals: readonly Pick<DealPin, 'validUntil' | 'votes'>[],
  now: Date,
): 'ending' | 'verified' | null => {
  if (deals.some((deal) => isEndingToday(deal, now))) return 'ending'
  if (deals.some((deal) => isVerified(deal.votes))) return 'verified'
  return null
}

const FLAG_PATHS = {
  verified: ['m5 12 5 5 9-10'],
  ending: ['M12 8v4l2.5 2', 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z'],
}

const createFlag = (flag: 'ending' | 'verified'): HTMLElement => {
  const badge = document.createElement('span')
  badge.className = `${DEAL_PIN_CLASS}__flag ${DEAL_PIN_CLASS}__flag--${flag}`
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '3.5')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  for (const d of FLAG_PATHS[flag]) {
    const path = document.createElementNS(SVG_NAMESPACE, 'path')
    path.setAttribute('d', d)
    svg.append(path)
  }
  badge.append(svg)
  return badge
}

const stateClasses = (state: PinState) =>
  [
    DEAL_PIN_CLASS,
    state.selected ? 'is-selected' : '',
    state.dimmed ? 'is-dimmed' : '',
    state.hot ? 'is-hot' : '',
  ]
    .filter(Boolean)
    .join(' ')

// A tinted bubble with the first deal's category icon, and a black badge underneath. Built from
// DOM nodes so deal text is never parsed as HTML.
export const createVenuePinIcon = (
  pin: Pick<VenuePin, 'deals'>,
  state: PinState = {},
  now: Date = new Date(),
): L.DivIcon => {
  const style = categoryStyle(pin.deals[0]?.category ?? '')
  const bubble = document.createElement('span')
  bubble.className = `${DEAL_PIN_CLASS}__bubble`
  bubble.style.setProperty('--pin-tint', style.tint)
  bubble.append(createCategoryIconElement(style.icon))
  const flag = pinFlag(pin.deals, now)
  if (flag) bubble.append(createFlag(flag))

  const badge = document.createElement('span')
  badge.className = `${DEAL_PIN_CLASS}__badge`
  badge.textContent = pinBadgeText(pin.deals)

  const root = document.createElement('span')
  root.className = `${DEAL_PIN_CLASS}__stack`
  root.append(bubble, badge)
  return L.divIcon({
    className: stateClasses(state),
    html: root,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}
