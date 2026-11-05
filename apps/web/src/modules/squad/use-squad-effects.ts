import type { SquadAvatar } from '@broke-oclock/contracts/squad'
import { shallowRef } from 'vue'

const MAX_STICKERS = 14
const MAX_DROPS = 40
const BURST_MS = 700
const DROP_MS = 1400
const WHOOSH_MS = 1100
const DROPS_PER_NAH = 6

export type Sticker = {
  readonly id: number
  readonly avatar: SquadAvatar
  readonly x: number
  readonly y: number
  readonly rotate: number
  readonly fromX: number
  readonly fromY: number
}
export type Burst = { readonly id: number; readonly x: number; readonly y: number }
export type Drop = {
  readonly id: number
  readonly x: number
  readonly y: number
  readonly delay: number
  readonly rotate: number
}
export type WhooshKind = 'again' | 'next' | 'look'
export type Whoosh = { readonly id: number; readonly text: string; readonly kind: WhooshKind }

const wants = (name: string) => `${name} ${name === 'You' ? 'want' : 'wants'}`

const WHOOSH_TEXT: Record<WhooshKind, (name: string) => string> = {
  again: (name) => `${wants(name)} to vote again`,
  next: (name) => `${wants(name)} the next deal`,
  look: (name) => `${wants(name)} to keep looking`,
}

type Box = { left: number; top: number; width: number; height: number }

export const useSquadEffects = (random: () => number = Math.random) => {
  const stickers = shallowRef<readonly Sticker[]>([])
  const bursts = shallowRef<readonly Burst[]>([])
  const drops = shallowRef<readonly Drop[]>([])
  const whooshes = shallowRef<readonly Whoosh[]>([])
  let nextId = 1

  const later = (ms: number, work: () => void) => setTimeout(work, ms)

  const yay = (avatar: SquadAvatar, photo: Box, from: { x: number; y: number }) => {
    const id = nextId++
    const margin = 22
    const x = photo.left + margin + random() * Math.max(0, photo.width - margin * 2)
    const y = photo.top + margin + random() * Math.max(0, photo.height - margin * 2)
    stickers.value = [
      ...stickers.value,
      {
        id,
        avatar,
        x,
        y,
        rotate: Math.round(random() * 40 - 20),
        fromX: from.x - x,
        fromY: from.y - y,
      },
    ].slice(-MAX_STICKERS)
    bursts.value = [...bursts.value, { id, x, y }]
    later(BURST_MS, () => {
      bursts.value = bursts.value.filter((burst) => burst.id !== id)
    })
  }

  const nah = (width: number) => {
    const fresh = Array.from({ length: DROPS_PER_NAH }, (_, index) => ({
      id: nextId++,
      x: Math.round(random() * Math.max(0, width - 40)),
      y: Math.round(random() * 100) / 100,
      delay: index * 60 + Math.round(random() * 80),
      rotate: Math.round(random() * 70 - 35),
    }))
    drops.value = [...drops.value, ...fresh].slice(-MAX_DROPS)
    const ids = new Set(fresh.map((drop) => drop.id))
    later(DROP_MS + 600, () => {
      drops.value = drops.value.filter((drop) => !ids.has(drop.id))
    })
  }

  const whoosh = (kind: WhooshKind, name: string) => {
    const id = nextId++
    const text = WHOOSH_TEXT[kind](name)
    whooshes.value = [...whooshes.value, { id, text, kind }].slice(-4)
    later(WHOOSH_MS, () => {
      whooshes.value = whooshes.value.filter((item) => item.id !== id)
    })
  }

  const clearStickers = () => {
    stickers.value = []
  }

  return { stickers, bursts, drops, whooshes, yay, nah, whoosh, clearStickers }
}

export type SquadEffects = ReturnType<typeof useSquadEffects>
