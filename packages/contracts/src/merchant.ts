import {
  checkDealFields,
  dealContentShape,
  dealDateSchema,
  dealLocationIdsSchema,
  dealObjectIdSchema,
  dealPhotoKeySchema,
} from '@contracts/deal-forms'
import { offerTypeSchema } from '@contracts/deals'
import { z } from 'zod'

export const merchantEmptyQuerySchema = z.strictObject({})
export const merchantDealParamsSchema = z.strictObject({ dealId: dealObjectIdSchema })

export const merchantOutletSchema = z.strictObject({
  id: dealObjectIdSchema,
  name: z.string(),
  address: z.string(),
})
export const merchantOutletsResponseSchema = z.strictObject({
  items: z.array(merchantOutletSchema),
})

export const merchantDealBodySchema = z
  .strictObject({
    ...dealContentShape,
    outletIds: dealLocationIdsSchema,
    startDate: dealDateSchema.or(z.literal('')),
    endDate: dealDateSchema.or(z.literal('')),
    terms: z.string().trim().max(1000),
    photoKey: dealPhotoKeySchema.nullable().optional(),
  })
  .superRefine(checkDealFields)

export const merchantDealPhotoSchema = z.strictObject({
  key: z.string(),
  url: z.string().url(),
})

export const merchantDealSchema = z.strictObject({
  id: dealObjectIdSchema,
  title: z.string(),
  description: z.string(),
  category: z.string(),
  cuisine: z.string().nullable(),
  outletIds: z.array(dealObjectIdSchema),
  offerType: offerTypeSchema,
  discountPercent: z.number().int().nullable(),
  priceCents: z.number().int().nullable(),
  startDate: z.string(),
  endDate: z.string(),
  terms: z.string(),
  endedAt: z.string().datetime().nullable(),
  photo: merchantDealPhotoSchema.nullable(),
})
export const merchantDealsResponseSchema = z.strictObject({
  items: z.array(merchantDealSchema),
})

export type MerchantOutlet = z.infer<typeof merchantOutletSchema>
export type MerchantDealBody = z.infer<typeof merchantDealBodySchema>
export type MerchantDeal = z.infer<typeof merchantDealSchema>
