import type { FoodKind } from '@web/modules/browse-map/food-kind'

export type FoodSprite = {
  readonly src: string
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

const endPosition = (sprite: FoodSprite): string =>
  sprite.alternate ? '100%' : `${((sprite.frames / (sprite.frames - 1)) * 100).toFixed(4)}%`

type Options = {
  readonly animated: boolean
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
