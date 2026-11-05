import type { PublicFlashDrop } from '@broke-oclock/contracts/flash-drops'
import { distanceMetres } from '@web/modules/browse-map/distance'
import type { Coordinates } from '@web/modules/browse-map/types'
import { BANNER_LIFE_MS, isDue, nextBannerDrop } from '@web/modules/flash-drop/banner-schedule'
import {
  type EdgePoint,
  type FlashLayer,
  mountFlashLayer,
} from '@web/modules/flash-drop/flash-layer'
import type { FlashDrops } from '@web/modules/flash-drop/use-flash-drops'
import type L from 'leaflet'
import { onBeforeUnmount, type Ref, shallowRef, watch } from 'vue'

const CHECK_MS = 400
const EDGE_MARGIN_PX = 16
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

type Padding = { top: number; right: number; bottom: number; left: number }

export type EdgeBanner = {
  readonly drop: PublicFlashDrop
  readonly point: EdgePoint
  readonly distanceMetres: number | null
}

export const useFlashMap = (options: {
  readonly map: Ref<L.Map | null>
  readonly store: FlashDrops
  readonly enabled: Ref<boolean>
  readonly user: Ref<Coordinates | null>
  readonly padding: Ref<Padding>
  readonly reducedMotion: Ref<boolean>
  readonly open: (drop: PublicFlashDrop) => void
}) => {
  const { store } = options
  let layer: FlashLayer | null = null
  const edge = shallowRef<EdgeBanner | null>(null)
  let lastActivity = Date.now()
  let shownCount = 0
  let showing = false
  let shownDropId: string | null = null
  let hideAt = 0
  let pausedLeft: number | null = null

  const noteActivity = () => {
    lastActivity = Date.now()
  }

  const hide = () => {
    if (!showing) return
    showing = false
    shownDropId = null
    pausedLeft = null
    layer?.hideBanner()
    edge.value = null
    shownCount += 1
    lastActivity = Date.now()
  }

  const setPaused = (paused: boolean) => {
    if (!showing) return
    if (paused && pausedLeft === null) pausedLeft = Math.max(0, hideAt - Date.now())
    if (!paused && pausedLeft !== null) {
      hideAt = Date.now() + pausedLeft
      pausedLeft = null
    }
  }

  const openDrop = (drop: PublicFlashDrop) => {
    const offScreen = layer ? !layer.inView(drop, options.padding.value) : false
    hide()
    if (offScreen) layer?.flyTo(drop, options.reducedMotion.value)
    options.open(drop)
  }

  const show = (drop: PublicFlashDrop) => {
    if (!layer) return
    showing = true
    shownDropId = drop.id
    hideAt = Date.now() + BANNER_LIFE_MS
    const handlers = { onOpen: openDrop, onHover: setPaused, lifeMs: BANNER_LIFE_MS }
    const placement = layer.placementFor(drop, options.padding.value)
    if (placement) {
      layer.showBanner(drop, store.now.value, handlers, placement, options.padding.value)
      return
    }
    const from = options.user.value
    edge.value = {
      drop,
      point: layer.edgeFor(drop, options.padding.value, EDGE_MARGIN_PX),
      distanceMetres: from ? distanceMetres(from, drop) : null,
    }
  }

  const check = () => {
    const now = Date.now()
    if (showing) {
      if (pausedLeft === null && now >= hideAt) hide()
      return
    }
    if (!options.enabled.value || !isDue(now, lastActivity, shownCount)) return
    const drop = nextBannerDrop(store.drops.value, options.user.value, now, shownCount)
    if (drop) show(drop)
  }

  watch(
    options.map,
    (map) => {
      layer?.dispose()
      layer = map ? mountFlashLayer(map, openDrop) : null
      layer?.update(store.drops.value, store.now.value)
    },
    { immediate: true },
  )
  watch([store.drops, store.now], ([drops, now]) => {
    layer?.update(drops, now)
    if (showing && !drops.some((drop) => drop.id === shownDropId)) hide()
  })
  watch(options.enabled, (enabled) => {
    if (!enabled) hide()
    noteActivity()
  })

  const timer = setInterval(check, CHECK_MS)
  for (const name of ACTIVITY_EVENTS) window.addEventListener(name, noteActivity, { passive: true })

  onBeforeUnmount(() => {
    clearInterval(timer)
    for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, noteActivity)
    layer?.dispose()
    layer = null
  })

  return { edge, openDrop, setPaused, dismiss: hide }
}
