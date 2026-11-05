import { z } from 'zod'

const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/)
const MAX_CATEGORY_LENGTH = 40
const MAX_PRICE_MINOR = 1_000_000

export const dealsQuerySchema = z.strictObject({
  category: z.string().trim().min(1).max(MAX_CATEGORY_LENGTH).optional(),
  priceMaxMinor: z.coerce.number().int().min(0).max(MAX_PRICE_MINOR).optional(),
  validNow: z.enum(['true', 'false']).default('true'),
})

export const dealVenuePinSchema = z.strictObject({
  id: objectIdSchema,
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
})

export const offerTypeSchema = z.enum(['FIXED_PRICE', 'PERCENT_OFF', 'BUY_ONE_GET_ONE', 'OTHER'])

export const dealVoteSummarySchema = z.strictObject({
  alive: z.number().int().min(0),
  dead: z.number().int().min(0),
  status: z.enum(['NO_RECENT_REPORTS', 'UNCERTAIN', 'LIKELY_STILL_ON', 'EXPIRED']).optional(),
})

export const dealImageSchema = z.strictObject({
  url: z.string().url().startsWith('https://'),
  alt: z.string().nullable(),
})

export const dealPinSchema = z.strictObject({
  id: objectIdSchema,
  title: z.string(),
  category: z.string(),
  cuisine: z.string().nullable(),
  label: z.string(),
  description: z.string(),
  offerType: offerTypeSchema,
  priceMinor: z.number().int().min(0).nullable(),
  discountPercent: z.number().int().min(0).max(100).nullable(),
  terms: z.string().nullable(),
  imageUrl: z.string().url().nullable().optional(),
  imageAltText: z.string().nullable().optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().nullable(),
  rawValidityText: z.string().nullable(),
  limitedTime: z.boolean().optional(),
  outletUnconfirmed: z.boolean().optional(),
  votes: dealVoteSummarySchema,
  commentCount: z.number().int().min(0),
  images: z.array(dealImageSchema),
  venues: z.array(dealVenuePinSchema),
})

export const dealsResponseSchema = z.strictObject({
  items: z.array(dealPinSchema),
  categories: z.array(z.string()),
})

export type DealsQuery = z.infer<typeof dealsQuerySchema>
export type DealVenuePin = z.infer<typeof dealVenuePinSchema>
export type DealVoteSummary = z.infer<typeof dealVoteSummarySchema>
export type DealImage = z.infer<typeof dealImageSchema>
export type DealPin = z.infer<typeof dealPinSchema>
export type DealsResponse = z.infer<typeof dealsResponseSchema>
