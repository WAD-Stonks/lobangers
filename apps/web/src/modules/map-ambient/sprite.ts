import {
  SPRITE_BASE,
  SPRITE_VERSION,
  type SpriteMeta,
  type SpriteName,
} from '@web/modules/map-ambient/scene-config'

export type Manifest = Record<SpriteName, SpriteMeta>

export const loadManifest = async (): Promise<Manifest> => {
  const res = await fetch(`${SPRITE_BASE}sprites.json?v=${SPRITE_VERSION}`)
  if (!res.ok) throw new Error(`Ambient sprites unavailable (${res.status})`)
  return (await res.json()) as Manifest
}

export const createSprite = (name: SpriteName, className = 'ambient-sprite'): HTMLDivElement => {
  const el = document.createElement('div')
  el.className = className
  el.style.backgroundImage = `url(${SPRITE_BASE}${name}.webp?v=${SPRITE_VERSION})`
  return el
}

export type Placement = {
  readonly x: number
  readonly y: number
  readonly scale: number
  readonly frame: number
  readonly flip?: boolean
  readonly rotate?: number
  readonly opacity?: number
}

export const placeSprite = (el: HTMLDivElement, meta: SpriteMeta, p: Placement) => {
  const size = meta.frameCssPx * p.scale
  const ax = meta.anchor[0] * p.scale
  const ay = meta.anchor[1] * p.scale
  el.style.width = `${size}px`
  el.style.height = `${size}px`
  el.style.backgroundSize = `${size * meta.frames}px ${size}px`
  el.style.backgroundPosition = `${-p.frame * size}px 0`
  el.style.transformOrigin = `${ax}px ${ay}px`
  el.style.transform = `translate3d(${p.x - ax}px, ${p.y - ay}px, 0) rotate(${p.rotate ?? 0}deg)${p.flip ? ' scaleX(-1)' : ''}`
  el.style.opacity = String(p.opacity ?? 1)
}

export const headingFor = (
  meta: SpriteMeta,
  dx: number,
  dy: number,
): { readonly frame: number; readonly residual: number } => {
  const want = (Math.atan2(dy, dx) * 180) / Math.PI
  return meta.angles.reduce(
    (best, angle, frame) => {
      const residual = ((want - angle + 540) % 360) - 180
      return Math.abs(residual) < Math.abs(best.residual) ? { frame, residual } : best
    },
    { frame: 0, residual: Number.POSITIVE_INFINITY },
  )
}
