import { LOOP_FADE, type Mover } from '@web/modules/map-ambient/scene-config'
import type L from 'leaflet'

export type RoutePoint = {
  readonly x: number
  readonly y: number
  readonly dx: number
  readonly dy: number
}

// Point at fraction t along a polyline, with the direction of the segment it is on.
export const along = (pts: readonly L.Point[], t: number): RoutePoint => {
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

const isClosed = (route: Mover['route']) => {
  const first = route[0]
  const last = route[route.length - 1]
  return first !== undefined && last !== undefined && first[0] === last[0] && first[1] === last[1]
}

// Where along its route a mover is after `seconds`, whether it is heading back, and how
// visible it is (open loops fade in and out at their ends instead of jumping).
export const progress = (m: Mover, seconds: number) => {
  const phase = (seconds / m.seconds + m.offset) % 1
  if (m.pingPong) {
    const back = phase >= 0.5
    return { t: back ? 2 - phase * 2 : phase * 2, back, opacity: 1 }
  }
  const opacity = isClosed(m.route) ? 1 : Math.min(1, phase / LOOP_FADE, (1 - phase) / LOOP_FADE)
  return { t: phase, back: false, opacity }
}
