import type L from 'leaflet'
import {
  GROUND_MIN_ZOOM,
  LANDMARKS,
  MOVERS,
  MOVERS_MAX_ZOOM,
  SKY_MAX_ZOOM,
  type LatLngTuple,
  zoomScale,
} from '@web/modules/map-ambient/scene-config'
import { createSky } from '@web/modules/map-ambient/sky-layer'
import { createSprite, frameForDirection, loadManifest, placeSprite } from '@web/modules/map-ambient/sprite'
import '@web/modules/map-ambient/ambient.css'

type Options = { readonly reducedMotion: boolean }

const MAX_STEP_S = 0.05
const PHONE_QUERY = '(max-width: 640px)'

// Point at fraction t along a polyline, plus the direction of travel, in layer pixels.
const along = (pts: readonly L.Point[], t: number) => {
  const lengths = pts.slice(1).map((p, i) => p.distanceTo(pts[i] as L.Point))
  let remaining = t * lengths.reduce((a, b) => a + b, 0)
  for (let i = 0; i < lengths.length; i++) {
    const a = pts[i] as L.Point
    const b = pts[i + 1] as L.Point
    const len = lengths[i] as number
    if (remaining <= len || i === lengths.length - 1) {
      const k = len === 0 ? 0 : Math.min(1, remaining / len)
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, dx: b.x - a.x, dy: b.y - a.y }
    }
    remaining -= len
  }
  return { x: 0, y: 0, dx: 1, dy: 0 }
}

// Mounts landmarks and movers in a pane under the deal pins, and a screen-space sky above the
// tiles. Returns a dispose function. Runs one animation loop, paused while the map moves.
export const mountAmbient = (map: L.Map, options: Options): (() => void) => {
  let disposed = false
  let frameId = 0
  let cleanup = () => {}

  loadManifest()
    .then((manifest) => {
      if (disposed) return
      const phone = window.matchMedia(PHONE_QUERY).matches
      const pane = map.createPane('ambient')
      pane.classList.add('leaflet-zoom-hide', 'ambient-pane')
      pane.style.zIndex = '450'
      const skyPane = map.createPane('ambient-sky')
      skyPane.classList.add('leaflet-zoom-hide')
      skyPane.style.zIndex = '440'
      skyPane.style.pointerEvents = 'none'
      const sky = createSky(map, skyPane, manifest, { phone })

      const landmarks = LANDMARKS.map((l) => ({ ...l, el: pane.appendChild(createSprite(l.sprite)) }))
      const movers = MOVERS.filter((m) => !phone || m.mobile).map((m) => ({ ...m, el: pane.appendChild(createSprite(m.sprite)) }))
      let elapsed = 0
      let last = performance.now()
      let moving = false

      const toLayer = (at: LatLngTuple) => map.latLngToLayerPoint(at as [number, number])

      const draw = () => {
        const zoom = map.getZoom()
        const scale = zoomScale(zoom)
        const groundOn = zoom >= GROUND_MIN_ZOOM
        pane.classList.toggle('is-hidden', !groundOn)
        sky.setVisible(zoom <= SKY_MAX_ZOOM)
        if (groundOn) {
          for (const l of landmarks) {
            const p = toLayer(l.at)
            placeSprite(l.el, manifest[l.sprite], p.x, p.y, scale * l.scale, 0)
          }
          const moversOn = zoom <= MOVERS_MAX_ZOOM
          for (const m of movers) {
            m.el.classList.toggle('is-hidden', !moversOn)
            if (!moversOn) continue
            const phase = options.reducedMotion ? 0.3 : (elapsed / m.seconds) % 1
            const t = m.pingPong ? (phase < 0.5 ? phase * 2 : 2 - phase * 2) : phase
            const reverse = m.pingPong && phase >= 0.5
            const at = along(m.route.map(toLayer), t)
            const meta = manifest[m.sprite]
            const frame = frameForDirection(meta, reverse ? -at.dx : at.dx, reverse ? -at.dy : at.dy)
            placeSprite(m.el, meta, at.x, at.y, scale, frame)
          }
        }
        sky.draw(options.reducedMotion ? 4 : elapsed)
      }

      const tick = (now: number) => {
        const dt = Math.min(MAX_STEP_S, (now - last) / 1000)
        last = now
        if (!moving && !document.hidden) {
          elapsed += dt
          draw()
        }
        frameId = requestAnimationFrame(tick)
      }

      const onMoveStart = () => {
        moving = true
      }
      const onMoveEnd = () => {
        moving = false
        draw()
      }
      map.on('movestart zoomstart', onMoveStart)
      map.on('moveend zoomend', onMoveEnd)
      map.on('move resize', sky.pin)
      draw()
      if (!options.reducedMotion) frameId = requestAnimationFrame(tick)

      cleanup = () => {
        cancelAnimationFrame(frameId)
        map.off('movestart zoomstart', onMoveStart)
        map.off('moveend zoomend', onMoveEnd)
        map.off('move resize', sky.pin)
        sky.dispose()
        pane.remove()
        skyPane.remove()
      }
    })
    .catch((error: unknown) => {
      // Decoration only: the map works without it.
      console.warn('Map ambience disabled', error)
    })

  return () => {
    disposed = true
    cleanup()
  }
}
