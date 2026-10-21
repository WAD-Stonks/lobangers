import {
  applyFoodSprite,
  FOOD_SPRITE_CLASS,
  foodSpriteFor,
} from '@web/modules/browse-map/food-sprite'
import { describe, expect, it } from 'vitest'

describe('foodSpriteFor', () => {
  it('maps each food kind to its animated 3D strip', () => {
    expect(foodSpriteFor('kopi')).toMatchObject({
      src: '/food-anim/drinks-128.webp',
      frames: 24,
      alternate: false,
    })
    expect(foodSpriteFor('laksa').src).toBe('/food-anim/food-128.webp')
    expect(foodSpriteFor('softserve')).toMatchObject({ frames: 12, alternate: true })
    expect(foodSpriteFor('puff').src).toBe('/food-anim/snacks-128.webp')
    expect(foodSpriteFor('tart').src).toBe('/food-anim/bakery-128.webp')
    expect(foodSpriteFor('ticket')).toMatchObject({ src: '/food-anim/other-128.webp', frames: 36 })
    expect(foodSpriteFor('pasta')).toMatchObject({ src: '/food-anim/pasta-128.webp', frames: 24 })
    expect(foodSpriteFor('burger')).toMatchObject({ frames: 12, alternate: true })
    expect(foodSpriteFor('boba').src).toBe('/food-anim/boba-128.webp')
  })
})

describe('applyFoodSprite', () => {
  it('sets the strip and frame maths so each step lands on a whole frame', () => {
    const el = document.createElement('span')
    applyFoodSprite(el, 'kopi', { animated: true, phase: 0 })

    expect(el.classList.contains(FOOD_SPRITE_CLASS)).toBe(true)
    expect(el.style.backgroundImage).toContain('/food-anim/drinks-128.webp')
    expect(el.style.getPropertyValue('--food-frames')).toBe('24')
    // A looping strip of n frames travels n/(n-1) of the way in n steps.
    expect(el.style.getPropertyValue('--food-end')).toBe('104.3478%')
    expect(el.style.getPropertyValue('--food-seconds')).toBe('2.4s')
  })

  it('plays back-and-forth strips with the alternate class', () => {
    const el = document.createElement('span')
    applyFoodSprite(el, 'softserve', { animated: true, phase: 0 })

    expect(el.classList.contains(`${FOOD_SPRITE_CLASS}--alt`)).toBe(true)
    expect(el.style.getPropertyValue('--food-end')).toBe('100%')
  })

  it('offsets the start so neighbouring pins do not move in sync', () => {
    const el = document.createElement('span')
    applyFoodSprite(el, 'kopi', { animated: true, phase: 0.5 })

    expect(el.style.animationDelay).toBe('-1.2s')
  })

  it('uses the 256px strip for large heroes', () => {
    const el = document.createElement('span')
    applyFoodSprite(el, 'kopi', { animated: true, phase: 0, large: true })

    expect(el.style.backgroundImage).toContain('/food-anim/drinks-256.webp')
  })

  it('shows the first frame without animating when asked to hold still', () => {
    const el = document.createElement('span')
    applyFoodSprite(el, 'tart', { animated: false, phase: 0 })

    expect(el.classList.contains(`${FOOD_SPRITE_CLASS}--still`)).toBe(true)
  })
})
