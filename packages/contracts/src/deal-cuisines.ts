import { z } from 'zod'

// The cuisine of a food deal, alongside its category (what you get). It is set only when the dish
// plainly has one (sushi, prata, a burger meal) and is never inferred from a brand's origin. Drinks,
// desserts, bakery items, snacks and supermarket offers store null.
export const DEAL_CUISINES = [
  'CHINESE',
  'MALAY',
  'INDIAN',
  'JAPANESE',
  'KOREAN',
  'TAIWANESE',
  'WESTERN',
  'CAFE',
] as const
export type DealCuisine = (typeof DEAL_CUISINES)[number]
export const dealCuisineSchema = z.enum(DEAL_CUISINES)

export const DEAL_CUISINE_LABELS: Record<DealCuisine, string> = {
  CHINESE: 'Chinese',
  MALAY: 'Malay',
  INDIAN: 'Indian',
  JAPANESE: 'Japanese',
  KOREAN: 'Korean',
  TAIWANESE: 'Taiwanese',
  WESTERN: 'Western',
  CAFE: 'Cafe',
}

export const isDealCuisine = (value: string): value is DealCuisine =>
  (DEAL_CUISINES as readonly string[]).includes(value)
