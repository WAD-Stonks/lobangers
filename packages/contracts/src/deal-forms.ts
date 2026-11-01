import { dealCategorySchema } from '@contracts/deal-categories'
import { dealCuisineSchema } from '@contracts/deal-cuisines'
import { offerTypeSchema } from '@contracts/deals'
import { z } from 'zod'

// Browser-safe schemas shared by the two deal forms: community submission and the merchant
// dashboard. No database or server imports here.

export const dealObjectIdSchema = z.string().regex(/^[a-f0-9]{24}$/)

// A calendar day typed into a date box, 'YYYY-MM-DD'. Rejects impossible days like 2026-02-30.
export const dealDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const time = Date.parse(`${value}T00:00:00Z`)
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
  })

const MAX_PRICE_CENTS = 1_000_000
const MAX_LOCATIONS = 20

// Fields both forms send. Offer extras are null unless the offer type uses them.
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

type OfferFields = {
  offerType: z.infer<typeof offerTypeSchema>
  discountPercent: number | null
  priceCents: number | null
}
type DateFields = { startDate: string; endDate: string }

// A discount goes only with % off and a price only with a fixed price; the last day may not
// come before the start. Empty dates (merchant form only) skip the order check.
export const checkDealFields = (value: OfferFields & DateFields, context: z.RefinementCtx) => {
  if ((value.offerType === 'PERCENT_OFF') !== (value.discountPercent !== null))
    context.addIssue({ code: 'custom', path: ['discountPercent'], message: 'Invalid discount' })
  if ((value.offerType === 'FIXED_PRICE') !== (value.priceCents !== null))
    context.addIssue({ code: 'custom', path: ['priceCents'], message: 'Invalid price' })
  if (value.startDate && value.endDate && value.endDate < value.startDate)
    context.addIssue({ code: 'custom', path: ['endDate'], message: 'Ends before it starts' })
}

// ----- Community submission: POST /api/deals -----

export const submitDealBodySchema = z
  .strictObject({
    ...dealContentShape,
    stallIds: dealLocationIdsSchema,
    startDate: dealDateSchema,
    endDate: dealDateSchema,
    terms: z.string().trim().min(1).max(1000),
    // UploadThing key from uploadPhoto(); the server checks this user uploaded it.
    photoKey: z.string().trim().min(1).max(256),
  })
  .superRefine(checkDealFields)

export const submitDealResponseSchema = z.strictObject({
  id: dealObjectIdSchema,
  reviewStatus: z.literal('PENDING'),
})

export type SubmitDealBody = z.infer<typeof submitDealBodySchema>
export type SubmitDealResponse = z.infer<typeof submitDealResponseSchema>
