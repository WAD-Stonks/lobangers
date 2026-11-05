import { useSquadEffects } from '@web/modules/squad/use-squad-effects'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const photo = { left: 20, top: 300, width: 340, height: 190 }

describe('squad effects', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('sticks yays only on the photo, flying in from the voter', () => {
    const effects = useSquadEffects(() => 0.5)
    effects.yay('bao', photo, { x: 60, y: 120 })
    const [sticker] = effects.stickers.value
    expect(sticker?.x).toBeGreaterThanOrEqual(photo.left)
    expect(sticker?.x).toBeLessThanOrEqual(photo.left + photo.width)
    expect(sticker?.y).toBeGreaterThanOrEqual(photo.top)
    expect(sticker?.y).toBeLessThanOrEqual(photo.top + photo.height)
    expect(sticker?.fromX).toBe(60 - (sticker?.x ?? 0))
    expect(effects.bursts.value).toHaveLength(1)
    vi.advanceTimersByTime(800)
    expect(effects.bursts.value).toHaveLength(0)
    expect(effects.stickers.value).toHaveLength(1)
  })

  it('caps stickers and thumbs so spamming never piles up', () => {
    const effects = useSquadEffects(() => 0.3)
    for (let tap = 0; tap < 40; tap += 1) {
      effects.yay('kopi', photo, { x: 0, y: 0 })
      effects.nah(390)
    }
    expect(effects.stickers.value.length).toBeLessThanOrEqual(14)
    expect(effects.drops.value).toHaveLength(40)
    vi.advanceTimersByTime(3000)
    expect(effects.drops.value).toHaveLength(0)
  })

  it('names who wants to vote again or move on, and clears the photo for a new deal', () => {
    const effects = useSquadEffects()
    effects.whoosh('again', 'Ashley')
    effects.whoosh('next', 'Damien')
    effects.whoosh('look', 'Noah')
    expect(effects.whooshes.value.map((item) => item.text)).toEqual([
      'Ashley wants to vote again',
      'Damien wants the next deal',
      'Noah wants to keep looking',
    ])
    effects.yay('teh', photo, { x: 0, y: 0 })
    effects.clearStickers()
    expect(effects.stickers.value).toHaveLength(0)
  })
})
