import type { PublicFlashDrop } from '@broke-oclock/contracts/flash-drops'
import { foodKindFor } from '@web/modules/browse-map/food-kind'
import { createFoodSprite } from '@web/modules/browse-map/food-sprite'
import {
  codesLeftText,
  countdown,
  offerText,
  offerTitle,
} from '@web/modules/flash-drop/flash-format'
import L from 'leaflet'
import '@web/modules/flash-drop/flash-drop.css'

const METRES_PER_DEGREE_LAT = 111_320
const LEAVE_MS = 380

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) => {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

const fakeTag = () => el('span', 'flash-fake', 'Fake deal')

const foodFor = (drop: PublicFlashDrop, size: 'pin' | 'banner') => {
  const sprite = createFoodSprite(
    foodKindFor({ category: drop.category, title: drop.dealTitle, venueNames: [drop.venueName] }),
    { animated: size === 'banner', phase: 0 },
  )
  sprite.classList.add(`flash-${size}__food`)
  return sprite
}

const pinLabel = (drop: PublicFlashDrop) =>
  `Flash drop: ${offerTitle(drop)} at ${drop.venueName}, ${codesLeftText(drop)}`

const bannerLabel = (drop: PublicFlashDrop, now: number) =>
  `Flash drop: ${offerTitle(drop)} at ${drop.venueName}, ${codesLeftText(drop)}, ends in ${countdown(drop.endsAt, now)}. Open the deal.`

const pinIcon = (drop: PublicFlashDrop, now: number) => {
  const oval = el('span', 'flash-pin__oval')
  oval.append(foodFor(drop, 'pin'), el('span', 'flash-pin__price', offerText(drop) || 'Flash'))
  oval.append(el('span', 'flash-pin__timer', countdown(drop.endsAt, now)))
  const stack = el('span', 'flash-pin__stack')
  stack.setAttribute('aria-label', pinLabel(drop))
  stack.append(oval, el('span', 'flash-pin__stem'), el('span', 'flash-pin__dot'))
  return L.divIcon({ className: 'flash-pin', html: stack, iconSize: [0, 0], iconAnchor: [0, 0] })
}

export type BannerHandlers = {
  readonly onOpen: (drop: PublicFlashDrop) => void
  readonly onHover: (paused: boolean) => void
  readonly lifeMs: number
}

export type BannerPlacement = 'above' | 'below' | 'pin' | 'under'

const bannerIcon = (
  drop: PublicFlashDrop,
  now: number,
  handlers: BannerHandlers,
  placement: BannerPlacement,
  shiftPx: number,
) => {
  const button = el('button', 'flash-banner')
  button.type = 'button'
  button.setAttribute('aria-label', bannerLabel(drop, now))
  const text = el('span', 'flash-banner__text')
  const kicker = el('span', 'flash-banner__kicker', 'Flash drop')
  if (drop.demo) kicker.append(fakeTag())
  text.append(
    kicker,
    el('span', 'flash-banner__title', offerTitle(drop)),
    el('span', 'flash-banner__meta', `${codesLeftText(drop)} · ${drop.venueName}`),
  )
  const life = el('span', 'flash-banner__life')
  life.style.setProperty('--flash-life', `${handlers.lifeMs}ms`)
  life.append(el('i', ''))
  button.append(
    foodFor(drop, 'banner'),
    text,
    el('span', 'flash-banner__timer', countdown(drop.endsAt, now)),
    life,
  )
  button.addEventListener('click', () => handlers.onOpen(drop))
  for (const [name, paused] of [
    ['mouseenter', true],
    ['mouseleave', false],
    ['focus', true],
    ['blur', false],
  ] as const)
    button.addEventListener(name, () => {
      button.classList.toggle('is-paused', paused)
      handlers.onHover(paused)
    })
  button.classList.add(`flash-banner--${placement}`)
  const wrap = el('div', `flash-banner-wrap flash-banner-wrap--${placement}`)
  wrap.style.setProperty('--flash-shift', `${shiftPx}px`)
  wrap.append(button)
  return L.divIcon({
    className: 'flash-banner-anchor',
    html: wrap,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

const zoneEdge = (drop: PublicFlashDrop, placement: BannerPlacement) =>
  placement === 'pin' || placement === 'under'
    ? L.latLng(drop.lat, drop.lng)
    : L.latLng(
        drop.lat + ((placement === 'above' ? 1 : -1) * drop.radiusMetres) / METRES_PER_DEGREE_LAT,
        drop.lng,
      )

const BANNER_ROOM_PX = 96
const PIN_HEIGHT_PX = 72
const BANNER_HALF_WIDTH_PX = 165
const SIDE_MARGIN_PX = 8

type Padding = { top: number; right: number; bottom: number; left: number }

export type EdgePoint = {
  readonly x: number
  readonly y: number
  readonly angle: number
}

export const mountFlashLayer = (map: L.Map, onOpen: (drop: PublicFlashDrop) => void) => {
  const layer = L.layerGroup().addTo(map)
  const entries = new Map<string, { zone: L.Circle; pin: L.Marker; drop: PublicFlashDrop }>()
  let banner: L.Marker | null = null
  let bannerDropId: string | null = null

  const update = (drops: readonly PublicFlashDrop[], now: number) => {
    const wanted = new Map(drops.map((drop) => [drop.id, drop]))
    for (const [id, entry] of entries) {
      if (wanted.has(id)) continue
      entries.delete(id)
      entry.pin.getElement()?.querySelector('.flash-pin__stack')?.classList.add('is-leaving')
      entry.zone.getElement()?.classList.add('is-leaving')
      setTimeout(() => {
        layer.removeLayer(entry.zone)
        layer.removeLayer(entry.pin)
      }, LEAVE_MS)
    }
    for (const drop of drops) {
      const kept = entries.get(drop.id)
      if (kept) {
        kept.drop = drop
        const element = kept.pin.getElement()
        const timer = element?.querySelector('.flash-pin__timer')
        if (timer) timer.textContent = countdown(drop.endsAt, now)
        element?.querySelector('.flash-pin__stack')?.setAttribute('aria-label', pinLabel(drop))
        continue
      }
      const centre = L.latLng(drop.lat, drop.lng)
      const zone = L.circle(centre, {
        radius: drop.radiusMetres,
        className: 'flash-zone',
        interactive: false,
      }).addTo(layer)
      const title = pinLabel(drop)
      const pin = L.marker(centre, {
        icon: pinIcon(drop, now),
        title,
        alt: title,
        zIndexOffset: 2000,
      })
        .on('click', () => onOpen(entries.get(drop.id)?.drop ?? drop))
        .addTo(layer)
      entries.set(drop.id, { zone, pin, drop })
    }
    const bannerTimer = banner?.getElement()?.querySelector('.flash-banner__timer')
    const shown = banner && [...entries.values()].find((entry) => entry.drop.id === bannerDropId)
    if (bannerTimer && shown) {
      bannerTimer.textContent = countdown(shown.drop.endsAt, now)
      bannerTimer.closest('.flash-banner')?.setAttribute('aria-label', bannerLabel(shown.drop, now))
    }
  }

  const hideBanner = () => {
    if (!banner) return
    const element = banner.getElement()?.querySelector('.flash-banner')
    const marker = banner
    banner = null
    bannerDropId = null
    if (!element) {
      layer.removeLayer(marker)
      return
    }
    element.classList.add('is-leaving')
    setTimeout(() => layer.removeLayer(marker), 200)
  }

  const showBanner = (
    drop: PublicFlashDrop,
    now: number,
    handlers: BannerHandlers,
    placement: BannerPlacement,
    padding: Padding,
  ) => {
    hideBanner()
    bannerDropId = drop.id
    const anchor = zoneEdge(drop, placement)
    const x = map.latLngToContainerPoint(anchor).x
    const half = Math.min(BANNER_HALF_WIDTH_PX, map.getSize().x * 0.43)
    const minX = padding.left + SIDE_MARGIN_PX + half
    const maxX = map.getSize().x - padding.right - SIDE_MARGIN_PX - half
    const shift = Math.round(Math.min(Math.max(x, minX), Math.max(minX, maxX)) - x)
    banner = L.marker(anchor, {
      icon: bannerIcon(drop, now, handlers, placement, shift),
      zIndexOffset: 3000,
      keyboard: false,
    }).addTo(layer)
  }

  const placementFor = (drop: PublicFlashDrop, padding: Padding): BannerPlacement | null => {
    if (!inView(drop, padding)) return null
    const size = map.getSize()
    const top = map.latLngToContainerPoint(zoneEdge(drop, 'above')).y
    const bottom = map.latLngToContainerPoint(zoneEdge(drop, 'below')).y
    if (top - BANNER_ROOM_PX >= padding.top + SIDE_MARGIN_PX) return 'above'
    if (bottom + BANNER_ROOM_PX <= size.y - padding.bottom - SIDE_MARGIN_PX) return 'below'
    const pin = map.latLngToContainerPoint([drop.lat, drop.lng]).y
    if (pin - PIN_HEIGHT_PX - BANNER_ROOM_PX >= padding.top + SIDE_MARGIN_PX) return 'pin'
    if (pin + BANNER_ROOM_PX <= size.y - padding.bottom - SIDE_MARGIN_PX) return 'under'
    return null
  }

  const inView = (drop: PublicFlashDrop, padding: Padding) => {
    const size = map.getSize()
    const point = map.latLngToContainerPoint([drop.lat, drop.lng])
    return (
      point.x >= padding.left &&
      point.x <= size.x - padding.right &&
      point.y >= padding.top + 60 &&
      point.y <= size.y - padding.bottom
    )
  }

  const edgeFor = (
    drop: PublicFlashDrop,
    padding: { top: number; right: number; bottom: number; left: number },
    margin: number,
  ): EdgePoint => {
    const size = map.getSize()
    const point = map.latLngToContainerPoint([drop.lat, drop.lng])
    const left = padding.left + margin
    const right = size.x - padding.right - margin
    const top = padding.top + margin
    const bottom = size.y - padding.bottom - margin
    const centre = L.point((left + right) / 2, (top + bottom) / 2)
    const dx = point.x - centre.x
    const dy = point.y - centre.y
    const scale = Math.min(
      dx === 0 ? Number.POSITIVE_INFINITY : (dx > 0 ? right - centre.x : left - centre.x) / dx,
      dy === 0 ? Number.POSITIVE_INFINITY : (dy > 0 ? bottom - centre.y : top - centre.y) / dy,
    )
    return {
      x: centre.x + dx * Math.min(1, scale),
      y: centre.y + dy * Math.min(1, scale),
      angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    }
  }

  const flyTo = (drop: PublicFlashDrop, reducedMotion: boolean) => {
    map.flyTo([drop.lat, drop.lng], Math.max(map.getZoom(), 16), {
      animate: !reducedMotion,
      duration: 0.8,
    })
  }

  return {
    update,
    showBanner,
    placementFor,
    hideBanner,
    inView,
    edgeFor,
    flyTo,
    dispose: () => {
      layer.remove()
      entries.clear()
      banner = null
    },
  }
}

export type FlashLayer = ReturnType<typeof mountFlashLayer>
