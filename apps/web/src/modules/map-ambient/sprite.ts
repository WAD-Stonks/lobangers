import { SPRITE_BASE, type SpriteMeta, type SpriteName } from '@web/modules/map-ambient/scene-config'

export type Manifest = Record<SpriteName, SpriteMeta>

export const loadManifest = async (): Promise<Manifest> => {
  const res = await fetch(`${SPRITE_BASE}sprites.json`)
  if (!res.ok) throw new Error(`Ambient sprites unavailable (${res.status})`)
  return (await res.json()) as Manifest
}

// A sprite is one div showing one frame of a horizontal strip.
export const createSprite = (name: SpriteName): HTMLDivElement => {
  const el = document.createElement('div')
  el.className = 'ambient-sprite'
  el.style.backgroundImage = `url(${SPRITE_BASE}${name}.webp)`
  return el
}

// Positions the sprite so its ground anchor sits on (x, y), at the given scale and frame.
export const placeSprite = (el: HTMLDivElement, meta: SpriteMeta, x: number, y: number, scale: number, frame: number) => {
  const size = meta.frameCssPx * scale
  el.style.width = `${size}px`
  el.style.height = `${size}px`
  el.style.backgroundSize = `${size * meta.frames}px ${size}px`
  el.style.backgroundPosition = `${-frame * size}px 0`
  el.style.transform = `translate3d(${x - meta.anchor[0] * scale}px, ${y - meta.anchor[1] * scale}px, 0)`
}

// Picks the rendered heading whose on-screen direction is closest to the travel direction.
export const frameForDirection = (meta: SpriteMeta, dx: number, dy: number): number => {
  const want = (Math.atan2(dy, dx) * 180) / Math.PI
  let best = 0
  let bestDiff = Number.POSITIVE_INFINITY
  meta.angles.forEach((angle, index) => {
    const diff = Math.abs(((want - angle + 540) % 360) - 180)
    if (diff < bestDiff) {
      best = index
      bestDiff = diff
    }
  })
  return best
}
