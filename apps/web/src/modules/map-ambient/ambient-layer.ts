import { along, progress } from '@web/modules/map-ambient/route-math'
import {
  GROUND_MIN_ZOOM,
  LANDMARKS,
  type LatLngTuple,
  MOVERS,
  type Mover,
  zoomScale,
} from '@web/modules/map-ambient/scene-config'
import {
  createSprite,
  headingFor,
  loadManifest,
  type Manifest,
  placeSprite,
} from '@web/modules/map-ambient/sprite'
import L from 'leaflet'
import '@web/modules/map-ambient/ambient.css'

type Options = {
  readonly reducedMotion: boolean
}

export type Ambient = {
  readonly dispose: () => void
}

const MAX_STEP_S = 0.05
const PHONE_QUERY = '(max-width: 640px)'
const STILL_SECONDS = 8
const SPRITE_CLASS = 'ambient-sprite leaflet-zoom-animated'

// `pos` is where it was last drawn, in layer pixels, so a zoom animation can carry it along.
type Live = Mover & {
  el: HTMLDivElement
  pts: L.Point[]
  pos: L.Point | null
}

// Leaflet's own markers follow a zoom animation with this; it is not in the public typings.
type ZoomProjector = {
  _latLngToNewLayerPoint: (at: L.LatLng, zoom: number, center: L.LatLng) => L.Point
}

// Mid-zoom pose: the sprite keeps its drawn size and is moved and scaled by transform alone,
// which the `leaflet-zoom-animated` class transitions in step with the tiles.
const followZoom = (
  el: HTMLDivElement,
  meta: Manifest[keyof Manifest],
  to: L.Point,
  fromScale: number,
  toScale: number,
) => {
  const ax = meta.anchor[0] * fromScale
  const ay = meta.anchor[1] * fromScale
  el.style.transform = `translate3d(${to.x - ax}px, ${to.y - ay}px, 0) scale(${toScale / fromScale})`
}

const drawMover = (m: Live, meta: Manifest[keyof Manifest], seconds: number, zoom: number) => {
  const { t, back, opacity } = progress(m, seconds)
  const at = along(m.pts, t)
  const dx = back ? -at.dx : at.dx
  const dy = back ? -at.dy : at.dy
  const frame = m.kind === 'heading' ? headingFor(meta, dx, dy).frame : 0
  m.pos = L.point(at.x, at.y)
  placeSprite(m.el, meta, { x: at.x, y: at.y, scale: zoomScale(zoom) * m.scale, frame, opacity })
}

// Mounts the landmarks and ferry in a Leaflet pane under the deal pins, so everything sits at
// real map coordinates and pans with the map. One loop animates them; it only pauses while a
// zoom animation runs (Leaflet hides the pane then) or the tab is hidden. Reduced motion
// draws a single still frame.
export const mountAmbient = (map: L.Map, options: Options): Ambient => {
  let disposed = false
  let cleanup = () => {}

  loadManifest()
    .then((manifest) => {
      if (disposed) return
      const phone = window.matchMedia(PHONE_QUERY).matches
      const pane = map.createPane('ambient-ground')
      pane.classList.add('ambient-pane')
      pane.style.zIndex = '450'
      const toLayer = (at: LatLngTuple) => map.latLngToLayerPoint(at as [number, number])

      let elapsed = options.reducedMotion ? STILL_SECONDS : 0
      const spawn = (m: Mover): Live => ({
        ...m,
        el: pane.appendChild(createSprite(m.sprite, SPRITE_CLASS)),
        pts: m.route.map(toLayer),
        pos: null,
      })

      const landmarks = LANDMARKS.map((l) => ({
        ...l,
        el: pane.appendChild(createSprite(l.sprite, SPRITE_CLASS)),
        pt: toLayer(l.at),
      }))
      const movers: Live[] = MOVERS.filter((m) => !phone || m.mobile).map(spawn)

      let last = performance.now()
      let zooming = false
      let frameId = 0

      // Layer pixels only change when the zoom changes, so routes are projected once per zoom.
      const reproject = () => {
        for (const l of landmarks) l.pt = toLayer(l.at)
        for (const m of movers) m.pts = m.route.map(toLayer)
      }

      const draw = () => {
        const zoom = map.getZoom()
        const on = zoom >= GROUND_MIN_ZOOM
        pane.classList.toggle('is-hidden', !on)
        if (!on) return
        const scale = zoomScale(zoom)
        for (const l of landmarks) {
          const meta = manifest[l.sprite]
          const frame = l.fps ? Math.floor(elapsed * l.fps) % meta.frames : 0
          placeSprite(l.el, meta, { x: l.pt.x, y: l.pt.y, scale: scale * l.scale, frame })
        }
        for (const m of movers) drawMover(m, manifest[m.sprite], elapsed, zoom)
      }

      const tick = (now: number) => {
        const dt = Math.min(MAX_STEP_S, (now - last) / 1000)
        last = now
        if (!zooming && !document.hidden) {
          elapsed += dt
          draw()
        }
        frameId = requestAnimationFrame(tick)
      }

      const onZoomStart = () => {
        zooming = true
      }
      // Sprites ride the zoom animation like markers instead of vanishing and reappearing.
      const onZoomAnim = (e: L.ZoomAnimEvent) => {
        if (map.getZoom() < GROUND_MIN_ZOOM) return
        const projector = map as unknown as ZoomProjector
        const toNew = (at: L.LatLng) => projector._latLngToNewLayerPoint(at, e.zoom, e.center)
        const from = zoomScale(map.getZoom())
        const to = zoomScale(e.zoom)
        for (const l of landmarks) {
          const at = L.latLng(l.at[0], l.at[1])
          followZoom(l.el, manifest[l.sprite], toNew(at), from * l.scale, to * l.scale)
        }
        for (const m of movers) {
          if (!m.pos) continue
          const at = map.layerPointToLatLng(m.pos)
          followZoom(m.el, manifest[m.sprite], toNew(at), from * m.scale, to * m.scale)
        }
      }
      const onZoomEnd = () => {
        zooming = false
        reproject()
        draw()
      }
      map.on('zoomstart', onZoomStart)
      map.on('zoomanim', onZoomAnim)
      map.on('zoomend viewreset', onZoomEnd)
      map.on('moveend', draw)
      draw()
      if (!options.reducedMotion) frameId = requestAnimationFrame(tick)

      cleanup = () => {
        cancelAnimationFrame(frameId)
        map.off('zoomstart', onZoomStart)
        map.off('zoomanim', onZoomAnim)
        map.off('zoomend viewreset', onZoomEnd)
        map.off('moveend', draw)
        pane.remove()
      }
    })
    .catch((error: unknown) => {
      // Decoration only: the map works without it.
      console.warn('Map ambience disabled', error)
    })

  return {
    dispose: () => {
      disposed = true
      cleanup()
    },
  }
}
