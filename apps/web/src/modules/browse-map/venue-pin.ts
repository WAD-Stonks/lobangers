import type { DealPin } from '@broke-oclock/contracts/deals'
import { isEndingToday, isVerified } from '@web/modules/browse-map/apply-filters'
import { foodKindFor } from '@web/modules/browse-map/food-kind'
import { createFoodSprite } from '@web/modules/browse-map/food-sprite'
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
  if (
    deals.some(
      (deal) =>
        (!deal.validUntil || new Date(deal.validUntil).getTime() > now.getTime()) &&
        isVerified(deal.votes),
    )
  )
    return 'verified'
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

// The dish the outlet's first deal names, or its category's default model.
export const pinFoodKind = (pin: Pick<VenuePin, 'deals'> & Partial<Pick<VenuePin, 'name'>>) => {
  const first = pin.deals[0]
  return foodKindFor({
    category: first?.category ?? '',
    title: first?.title ?? '',
    venueNames: pin.name ? [pin.name] : [],
  })
}

// Stable 0..1 from text, so a pin always starts its animation at the same point but neighbours
// differ.
const phaseOf = (text: string): number =>
  ([...text].reduce((hash, ch) => (hash * 31 + ch.charCodeAt(0)) % 997, 7) % 100) / 100

// The first deal's animated 3D food, and a black badge underneath. Built from DOM nodes so deal
// text is never parsed as HTML.
export const createVenuePinIcon = (
  pin: Pick<VenuePin, 'deals'> & Partial<Pick<VenuePin, 'name'>>,
  state: PinState = {},
  now: Date = new Date(),
): L.DivIcon => {
  const first = pin.deals[0]
  const kind = pinFoodKind(pin)
  const bubble = document.createElement('span')
  bubble.className = `${DEAL_PIN_CLASS}__bubble`
  bubble.append(createFoodSprite(kind, { animated: true, phase: phaseOf(first?.title ?? '') }))
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
