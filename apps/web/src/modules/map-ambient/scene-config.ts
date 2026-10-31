// SPIKE: ambient 3D decoration for the browse map: Singapore landmarks that idle in place
// (some loop an animation) and a ferry on a hand-placed route.

export type LatLngTuple = readonly [number, number]

export type SpriteName =
  | 'mbs'
  | 'flyer'
  | 'ferry'
  | 'merlion'
  | 'supertrees'
  | 'elephant'
  | 'dolphins'
  | 'globe'
  | 'jewel'
  | 'controlTower'

export type SpriteMeta = {
  readonly frames: number
  readonly frameCssPx: number
  readonly angles: readonly number[]
  readonly anchor: readonly [number, number]
}

export type Landmark = {
  readonly sprite: SpriteName
  readonly at: LatLngTuple
  readonly scale: number
  // Frames per second for landmarks rendered as a loop (a turning wheel); still when absent.
  readonly fps?: number
}

// `heading` picks a rendered direction; `still` uses frame 0.
export type MoverKind = 'heading' | 'still'

export type Mover = {
  readonly sprite: SpriteName
  readonly kind: MoverKind
  readonly route: readonly LatLngTuple[]
  readonly seconds: number
  // Ping-pong drives back along the route; otherwise it loops, fading at both ends.
  readonly pingPong: boolean
  readonly offset: number
  readonly scale: number
  readonly mobile: boolean
}

export const SPRITE_BASE = '/map-ambient/'
// Bump whenever the strips are re-rendered: a strip and its sprites.json entry must change
// together, or a cached old strip is stretched across the new frame count.
export const SPRITE_VERSION = 2

// Everything shows once the visitor is browsing streets, not at island view.
export const GROUND_MIN_ZOOM = 13
export const LOOP_FADE = 0.06

// Sprites grow a little as the visitor zooms in.
export const zoomScale = (zoom: number): number =>
  Math.min(1.15, Math.max(0.55, 0.55 + (zoom - 13) * 0.22))

export const LANDMARKS: readonly Landmark[] = [
  { sprite: 'mbs', at: [1.2834, 103.8607], scale: 0.42 },
  { sprite: 'flyer', at: [1.2893, 103.8631], scale: 0.42, fps: 3 },
  // Merlion spouting into the bay; Supertrees pulse their canopy lights.
  { sprite: 'merlion', at: [1.2868, 103.8545], scale: 0.42, fps: 10 },
  { sprite: 'supertrees', at: [1.2816, 103.8636], scale: 0.38, fps: 6 },
  // Zoo elephant spraying water; dolphins leaping off Sentosa.
  { sprite: 'elephant', at: [1.4043, 103.793], scale: 0.38, fps: 10 },
  { sprite: 'dolphins', at: [1.2585, 103.819], scale: 0.42, fps: 10 },
  // Universal Studios globe turning on its pedestal.
  { sprite: 'globe', at: [1.254, 103.8238], scale: 0.38, fps: 4 },
  // Jewel's rain vortex falling through the dome, and Changi's control tower.
  { sprite: 'jewel', at: [1.3602, 103.9898], scale: 0.36, fps: 10 },
  { sprite: 'controlTower', at: [1.3566, 103.9935], scale: 0.38 },
]

export const MOVERS: readonly Mover[] = [
  {
    sprite: 'ferry',
    kind: 'heading',
    route: [
      [1.2712, 103.8636],
      [1.255, 103.862],
      [1.238, 103.856],
      [1.223, 103.85],
    ],
    seconds: 70,
    pingPong: true,
    offset: 0,
    scale: 0.8,
    mobile: true,
  },
]
