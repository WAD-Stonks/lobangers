import {
  checkDealFields,
  dealContentShape,
  dealDateSchema,
  dealLocationIdsSchema,
  dealObjectIdSchema,
} from '@contracts/deal-forms'
import { offerTypeSchema } from '@contracts/deals'
import { z } from 'zod'

// Browser-safe schemas for the merchant dashboard (/api/merchant/...).

export const merchantEmptyQuerySchema = z.strictObject({})
export const merchantDealParamsSchema = z.strictObject({ dealId: dealObjectIdSchema })

// An outlet the merchant holds an active stall grant for.
export const merchantOutletSchema = z.strictObject({
  id: dealObjectIdSchema,
  name: z.string(),
  address: z.string(),
})
export const merchantOutletsResponseSchema = z.strictObject({
  items: z.array(merchantOutletSchema),
})

// Create and edit send the same body. Dates are optional here: '' means "from now" or "no end".
export const merchantDealBodySchema = z
  .strictObject({
    ...dealContentShape,
    outletIds: dealLocationIdsSchema,
    startDate: dealDateSchema.or(z.literal('')),
    endDate: dealDateSchema.or(z.literal('')),
    terms: z.string().trim().max(1000),
  })
  .superRefine(checkDealFields)

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
  startDate: z.string(), // 'YYYY-MM-DD' or ''
  endDate: z.string(), // last day, 'YYYY-MM-DD' or ''
  terms: z.string(),
  // When the deal stopped running, once its end has passed (ended early or ran out).
  endedAt: z.string().datetime().nullable(),
})
export const merchantDealsResponseSchema = z.strictObject({
  items: z.array(merchantDealSchema),
})

export type MerchantOutlet = z.infer<typeof merchantOutletSchema>
export type MerchantDealBody = z.infer<typeof merchantDealBodySchema>
export type MerchantDeal = z.infer<typeof merchantDealSchema>
