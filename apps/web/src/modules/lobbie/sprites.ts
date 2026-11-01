import type { DealPin } from '@broke-oclock/contracts/deals'

export type LobbieSprite = 'hello' | 'thinking' | 'deal-found'

export const lobbieSpriteUrl = (sprite: LobbieSprite): string => `/chatbot-sprites/${sprite}.svg`

export const replySprite = (deals: readonly DealPin[]): LobbieSprite =>
  deals.length > 0 ? 'deal-found' : 'thinking'

export const PRELOAD_SPRITES: readonly LobbieSprite[] = ['thinking', 'deal-found']
