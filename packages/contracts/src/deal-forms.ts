import { dealCategorySchema } from '@contracts/deal-categories'
import { dealCuisineSchema } from '@contracts/deal-cuisines'
import { offerTypeSchema } from '@contracts/deals'
import { z } from 'zod'

export const dealObjectIdSchema = z.string().regex(/^[a-f0-9]{24}$/)

export const dealDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const time = Date.parse(`${value}T00:00:00Z`)
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
  })

const MAX_PRICE_CENTS = 1_000_000
const MAX_LOCATIONS = 20

export const dealContentShape = {
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(1000),
  category: dealCategorySchema,
  cuisine: dealCuisineSchema.nullable(),
  offerType: offerTypeSchema,
  discountPercent: z.number().int().min(1).max(100).nullable(),
  priceCents: z.number().int().min(1).max(MAX_PRICE_CENTS).nullable(),
}

export const dealLocationIdsSchema = z
  .array(dealObjectIdSchema)
  .min(1)
  .max(MAX_LOCATIONS)
  .refine((ids) => new Set(ids).size === ids.length, 'Each location may be chosen once')

export const dealPhotoKeySchema = z.string().trim().min(1).max(256)

type OfferFields = {
  offerType: z.infer<typeof offerTypeSchema>
  discountPercent: number | null
  priceCents: number | null
}
type DateFields = { startDate: string; endDate: string }

export const checkDealFields = (value: OfferFields & DateFields, context: z.RefinementCtx) => {
  if ((value.offerType === 'PERCENT_OFF') !== (value.discountPercent !== null))
    context.addIssue({ code: 'custom', path: ['discountPercent'], message: 'Invalid discount' })
  if ((value.offerType === 'FIXED_PRICE') !== (value.priceCents !== null))
    context.addIssue({ code: 'custom', path: ['priceCents'], message: 'Invalid price' })
  if (value.startDate && value.endDate && value.endDate < value.startDate)
    context.addIssue({ code: 'custom', path: ['endDate'], message: 'Ends before it starts' })
}

export const submitDealBodySchema = z
  .strictObject({
    ...dealContentShape,
    stallIds: z.array(dealObjectIdSchema).length(1),
    startDate: dealDateSchema,
    endDate: dealDateSchema,
    terms: z.string().trim().min(1).max(1000),
    photoKey: dealPhotoKeySchema,
  })
  .superRefine(checkDealFields)

export const submitDealResponseSchema = z.strictObject({
  id: dealObjectIdSchema,
  reviewStatus: z.literal('PENDING'),
})

export const dealStallsQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
})
export const dealStallSchema = z.strictObject({
  id: dealObjectIdSchema,
  name: z.string(),
  merchantName: z.string(),
  address: z.string(),
})
export const dealStallsResponseSchema = z.array(dealStallSchema)

export const dealPlaceIdSchema = z.string().regex(/^[A-Za-z0-9_-]{10,300}$/)
export const dealPlacesQuerySchema = z.strictObject({
  search: z.string().trim().min(2).max(100),
})
export const dealPlaceSchema = z.strictObject({
  placeId: dealPlaceIdSchema,
  name: z.string(),
  address: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  stall: dealStallSchema.nullable(),
})
export const dealPlacesResponseSchema = z.array(dealPlaceSchema)

export const createDealStallBodySchema = z.strictObject({
  placeId: dealPlaceIdSchema,
  merchantName: z.string().trim().min(1).max(120),
})

export type SubmitDealBody = z.infer<typeof submitDealBodySchema>
export type SubmitDealResponse = z.infer<typeof submitDealResponseSchema>
export type DealStall = z.infer<typeof dealStallSchema>
export type DealPlace = z.infer<typeof dealPlaceSchema>
export type CreateDealStallBody = z.infer<typeof createDealStallBodySchema>
