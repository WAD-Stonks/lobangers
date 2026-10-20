import type L from 'leaflet'
import type { Manifest } from '@web/modules/map-ambient/sprite'
import { createSprite, frameForDirection, placeSprite } from '@web/modules/map-ambient/sprite'

type Sky = { draw: (seconds: number) => void; setVisible: (on: boolean) => void; pin: () => void; dispose: () => void }

// Seconds per crossing, and where each thing travels in fractions of the map's size.
const CLOUDS = [
  { y: 0.18, seconds: 90, offset: 0, scale: 1 },
  { y: 0.62, seconds: 120, offset: 0.55, scale: 0.8 },
]
const BIRDS = { seconds: 16, y: 0.35, flock: [[0, 0], [-34, 18], [-60, -10]] as const, flapPerSecond: 9 }
const PLANE = { seconds: 24, from: [-0.1, 0.85], to: [1.1, 0.1] }
const CLOUD_SHADOW_OFFSET = { x: 70, y: 150 }

// Screen-space sky over the tiles: drifting clouds with ground shadows, a passing flock and a plane.
// It lives in a Leaflet pane (so it stays under the pins) and is pinned back to the screen
// on every move, since panes travel with the map.
export const createSky = (map: L.Map, pane: HTMLElement, manifest: Manifest, { phone }: { phone: boolean }): Sky => {
  const root = document.createElement('div')
  root.className = 'ambient-sky'
  pane.appendChild(root)
  const pin = () => {
    const origin = map.containerPointToLayerPoint([0, 0])
    const size = map.getSize()
    root.style.width = `${size.x}px`
    root.style.height = `${size.y}px`
    root.style.transform = `translate3d(${origin.x}px, ${origin.y}px, 0)`
  }
  pin()

  const clouds = (phone ? CLOUDS.slice(0, 1) : CLOUDS).map((c) => {
    const shadow = root.appendChild(document.createElement('div'))
    shadow.className = 'ambient-cloud-shadow'
    const el = root.appendChild(createSprite('cloudA'))
    el.classList.add('ambient-cloud')
    return { ...c, el, shadow }
  })
  const birds = BIRDS.flock.map(() => root.appendChild(createSprite('bird')))
  const plane = root.appendChild(createSprite('plane'))

  const draw = (s: number) => {
    const w = root.clientWidth
    const h = root.clientHeight
    for (const c of clouds) {
      const meta = manifest.cloudA
      const span = w + meta.frameCssPx * 2
      const x = (((s / c.seconds + c.offset) % 1) * span) - meta.frameCssPx
      const y = c.y * h
      placeSprite(c.el, meta, x, y, c.scale, 0)
      c.shadow.style.transform = `translate3d(${x - 80 + CLOUD_SHADOW_OFFSET.x}px, ${y + CLOUD_SHADOW_OFFSET.y}px, 0) scale(${c.scale})`
    }
    const bt = (s % BIRDS.seconds) / BIRDS.seconds
    birds.forEach((el, i) => {
      const [ox, oy] = BIRDS.flock[i] as readonly [number, number]
      const frame = Math.floor(s * BIRDS.flapPerSecond + i * 2) % manifest.bird.frames
      placeSprite(el, manifest.bird, bt * (w + 200) - 100 + ox, BIRDS.y * h + oy + Math.sin(s * 2 + i) * 4, 0.8, frame)
    })
    const pt = (s % PLANE.seconds) / PLANE.seconds
    const dx = (PLANE.to[0] - PLANE.from[0]) * w
    const dy = (PLANE.to[1] - PLANE.from[1]) * h
    placeSprite(plane, manifest.plane, PLANE.from[0] * w + dx * pt, PLANE.from[1] * h + dy * pt, 0.7, frameForDirection(manifest.plane, dx, dy))
  }

  return {
    draw,
    pin,
    setVisible: (on) => root.classList.toggle('is-hidden', !on),
    dispose: () => root.remove(),
  }
}
