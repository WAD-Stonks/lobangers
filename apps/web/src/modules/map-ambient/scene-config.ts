// SPIKE: ambient 3D decoration for the browse map. Routes are hand-traced and approximate.
export type LatLngTuple = readonly [number, number]

export type SpriteName = 'mbs' | 'flyer' | 'ferry' | 'bus' | 'plane' | 'bird' | 'cloudA'

export type SpriteMeta = {
  readonly frames: number
  readonly frameCssPx: number
  readonly angles: readonly number[]
  readonly anchor: readonly [number, number]
}

export type Landmark = { readonly sprite: SpriteName; readonly at: LatLngTuple; readonly scale: number }

export type Mover = {
  readonly sprite: SpriteName
  readonly route: readonly LatLngTuple[]
  readonly seconds: number
  readonly pingPong: boolean
  readonly mobile: boolean
}

export const SPRITE_BASE = '/map-ambient/'

// Zoom bands: sky things at island view, ground things while browsing.
export const SKY_MAX_ZOOM = 12
export const GROUND_MIN_ZOOM = 13
export const MOVERS_MAX_ZOOM = 15

// Sprite scale per zoom so models grow a little as the visitor zooms in.
export const zoomScale = (zoom: number): number => Math.min(1.15, Math.max(0.55, 0.55 + (zoom - 13) * 0.22))

export const LANDMARKS: readonly Landmark[] = [
  { sprite: 'mbs', at: [1.2834, 103.8607], scale: 0.42 },
  { sprite: 'flyer', at: [1.2893, 103.8631], scale: 0.42 },
]

export const MOVERS: readonly Mover[] = [
  {
    sprite: 'ferry',
    route: [
      [1.2712, 103.8636],
      [1.2550, 103.8620],
      [1.2380, 103.8560],
      [1.2230, 103.8500],
    ],
    seconds: 45,
    pingPong: true,
    mobile: true,
  },
  {
    sprite: 'bus',
    route: [
      [1.2905, 103.869],
      [1.299, 103.883],
      [1.303, 103.905],
      [1.31, 103.93],
      [1.319, 103.955],
    ],
    seconds: 40,
    pingPong: true,
    mobile: true,
  },
  {
    sprite: 'bus',
    route: [
      [1.327, 103.745],
      [1.334, 103.78],
      [1.333, 103.81],
      [1.329, 103.84],
      [1.332, 103.87],
    ],
    seconds: 50,
    pingPong: true,
    mobile: false,
  },
]
