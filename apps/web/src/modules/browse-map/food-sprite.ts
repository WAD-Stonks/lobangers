import type { FoodKind } from '@web/modules/browse-map/food-kind'

// Animated 3D food for each food kind (see food-kind.ts): pre-rendered three.js frames in one horizontal strip
// (public/food-anim, 128px frames for 2x screens). Looping strips run once round; `alternate`
// strips hold half a loop and play forward then back. Styled in food-sprite.css.
export type FoodSprite = {
  readonly src: string
  // Same frames at 256px, for heroes drawn large enough that the 128px strip looks soft.
  readonly srcLarge: string
  readonly frames: number
  readonly seconds: number
  readonly alternate: boolean
}

export const FOOD_SPRITE_CLASS = 'food-sprite'

const STRIP_BASE = '/food-anim/'
const STRIP_SIZE = 128
const STRIP_SIZE_LARGE = 256

const strip = (name: string, frames: number, seconds: number, alternate: boolean): FoodSprite => ({
  src: `${STRIP_BASE}${name}-${STRIP_SIZE}.webp`,
  srcLarge: `${STRIP_BASE}${name}-${STRIP_SIZE_LARGE}.webp`,
  frames,
  seconds,
  alternate,
})

// Kept in step with public/food-anim/food-anim.json and food-anim-extra.json, which the render
// scripts write. The first six files are named after the category they were made for.
const FOOD_SPRITES: Record<FoodKind, FoodSprite> = {
  kopi: strip('drinks', 24, 2.4, false),
  laksa: strip('food', 24, 2.4, false),
  softserve: strip('dessert', 12, 1.2, true),
  puff: strip('snacks', 12, 1.1, true),
  tart: strip('bakery', 10, 0.8, true),
  ticket: strip('other', 36, 3.6, false),
  pasta: strip('pasta', 24, 2.4, false),
  burger: strip('burger', 12, 1.0, true),
  chicken: strip('chicken', 24, 2.4, false),
  sushi: strip('sushi', 12, 1.0, true),
  hotpot: strip('hotpot', 24, 2.4, false),
  pizza: strip('pizza', 12, 1.3, true),
  boba: strip('boba', 24, 3.2, false),
}

export const foodSpriteFor = (kind: FoodKind): FoodSprite => FOOD_SPRITES[kind]

// Where the background must travel so every CSS step lands exactly on a frame: a loop takes n
// steps over n/(n-1) of the strip; a back-and-forth takes n positions from 0% to 100%.
const endPosition = (sprite: FoodSprite): string =>
  sprite.alternate ? '100%' : `${((sprite.frames / (sprite.frames - 1)) * 100).toFixed(4)}%`

type Options = {
  readonly animated: boolean
  // 0..1 through the loop to start at, so neighbouring pins never move in lockstep.
  readonly phase: number
  readonly large?: boolean
}

export const applyFoodSprite = (
  el: HTMLElement,
  kind: FoodKind,
  { animated, phase, large = false }: Options,
) => {
  const sprite = foodSpriteFor(kind)
  el.classList.add(FOOD_SPRITE_CLASS)
  if (sprite.alternate) el.classList.add(`${FOOD_SPRITE_CLASS}--alt`)
  if (!animated) el.classList.add(`${FOOD_SPRITE_CLASS}--still`)
  el.style.backgroundImage = `url(${large ? sprite.srcLarge : sprite.src})`
  el.style.setProperty('--food-frames', String(sprite.frames))
  el.style.setProperty('--food-end', endPosition(sprite))
  el.style.setProperty('--food-seconds', `${sprite.seconds}s`)
  if (animated && phase > 0) {
    // A negative delay starts the loop part-way through.
    const lead = Number((phase * sprite.seconds).toFixed(3))
    el.style.animationDelay = `${-lead}s`
  }
  el.setAttribute('aria-hidden', 'true')
}

export const createFoodSprite = (kind: FoodKind, options: Options): HTMLSpanElement => {
  const el = document.createElement('span')
  applyFoodSprite(el, kind, options)
  return el
}
