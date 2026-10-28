import { adminNoteSchema, adminObjectIdSchema, adminVersionSchema } from '@contracts/admin-common'
import { dealCategorySchema } from '@contracts/deal-categories'
import { dealCuisineSchema } from '@contracts/deal-cuisines'
import { offerTypeSchema } from '@contracts/deals'
import { boundedQueryInteger } from '@contracts/query'
import { z } from 'zod'
export const adminDealOriginSchema = z.enum(['IMPORTED', 'USER_SUBMITTED'])
export const adminDealReviewStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'HIDDEN'])
export const adminDealsQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  origin: adminDealOriginSchema.optional(),
  reviewStatus: adminDealReviewStatusSchema.optional(),
  publication: z.enum(['PUBLISHED', 'UNPUBLISHED', 'EXPIRED']).optional(),
  merchantId: adminObjectIdSchema.optional(),
  includeDeleted: z.enum(['true', 'false']).default('false'),
  limit: boundedQueryInteger(1, 50, 20),
  cursor: adminObjectIdSchema.optional(),
})
export const adminDealSummarySchema = z.strictObject({
  id: adminObjectIdSchema,
  title: z.string(),
  origin: adminDealOriginSchema,
  reviewStatus: adminDealReviewStatusSchema,
  contentVersion: z.number().int(),
  operationVersion: adminVersionSchema.max(2_147_483_647),
  merchantId: adminObjectIdSchema.nullable(),
  deletedAt: z.string().nullable(),
  publishedAt: z.string().nullable(),
  validFrom: z.string().nullable(),
  validUntil: z.string().nullable(),
  publication: z.enum(['PUBLISHED', 'UNPUBLISHED', 'EXPIRED', 'HIDDEN', 'DELETED']),
})
export const adminDealsResponseSchema = z.strictObject({
  items: z.array(adminDealSummarySchema),
  nextCursor: adminObjectIdSchema.nullable(),
})
export type AdminDealsQuery = z.input<typeof adminDealsQuerySchema>
export type AdminDealSummary = z.infer<typeof adminDealSummarySchema>

export const adminDealParamsSchema = z.strictObject({ dealId: adminObjectIdSchema })
export const adminDealDetailQuerySchema = z.strictObject({
  limit: boundedQueryInteger(1, 50, 20),
  outletCursor: adminObjectIdSchema.optional(),
})
export const adminDealWriteEnvelopeSchema = z.strictObject({
  expectedContentVersion: adminVersionSchema.min(1),
  expectedOperationVersion: adminVersionSchema,
  note: adminNoteSchema,
})
export const adminDealContentChangesSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(40).optional(),
    description: z.string().trim().min(1).max(120).optional(),
    terms: z.string().trim().max(1000).nullable().optional(),
    category: dealCategorySchema.optional(),
    cuisine: dealCuisineSchema.nullable().optional(),
    offerType: offerTypeSchema.optional(),
    priceMinor: z.number().int().min(0).max(1_000_000).nullable().optional(),
    currency: z.literal('SGD').optional(),
    discountPercent: z.number().int().min(1).max(100).nullable().optional(),
    validFrom: z.string().datetime().nullable().optional(),
    validUntil: z.string().datetime().nullable().optional(),
    rawValidityText: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((changes) => Object.keys(changes).length > 0, 'A nonempty correction is required')
export const adminDealContentRequestSchema = adminDealWriteEnvelopeSchema.extend({
  changes: adminDealContentChangesSchema,
})
export const adminDealOutletSchema = z.strictObject({
  id: adminObjectIdSchema,
  name: z.string(),
  address: z.string(),
  merchantId: adminObjectIdSchema,
  deletedAt: z.string().nullable(),
  geographyReady: z.boolean(),
  occupancyReady: z.boolean(),
})
export const adminDealDetailSchema = adminDealSummarySchema.extend({
  description: z.string(),
  terms: z.string().nullable(),
  category: z.string(),
  cuisine: z.string().nullable(),
  offerType: offerTypeSchema,
  priceMinor: z.number().int().nullable(),
  currency: z.string(),
  discountPercent: z.number().int().nullable(),
  rawValidityText: z.string().nullable(),
  applicability: z.enum([
    'SELECTED_OUTLETS',
    'ALL_MERCHANT_OUTLETS',
    'ONLINE',
    'NO_FIXED_LOCATION',
  ]),
  submittedById: adminObjectIdSchema.nullable(),
  reviewedById: adminObjectIdSchema.nullable(),
  reviewedVersion: z.number().int().nullable(),
  reviewedAt: z.string().nullable(),
  reviewNote: z.string().nullable(),
  sources: z.array(
    z.strictObject({
      citationId: adminObjectIdSchema,
      sourceUrl: z.string().nullable(),
      sourceContentHash: z.string(),
      sourceContentSnapshot: z.string(),
      current: z.boolean(),
    }),
  ),
  images: z.array(z.strictObject({ url: z.string().nullable(), mimeType: z.string() })),
  outlets: z.array(adminDealOutletSchema),
  outletCount: z.number().int(),
  selectedVenueIds: z.array(adminObjectIdSchema).max(100).nullable(),
  nextOutletCursor: adminObjectIdSchema.nullable(),
  scopeEditable: z.boolean(),
  scopeConfirmed: z.boolean(),
  blockers: z.array(z.string()),
  approvalReady: z.boolean(),
  publicationReady: z.boolean(),
  scopeEvidenceLabel: z.string().nullable(),
})
export type AdminDealDetail = z.infer<typeof adminDealDetailSchema>
export type AdminDealContentRequest = z.input<typeof adminDealContentRequestSchema>

export const adminDealScopeRequestSchema = adminDealWriteEnvelopeSchema
  .extend({
    applicability: z.enum([
      'SELECTED_OUTLETS',
      'ALL_MERCHANT_OUTLETS',
      'ONLINE',
      'NO_FIXED_LOCATION',
    ]),
    merchantId: adminObjectIdSchema.nullable(),
    venueIds: z.array(adminObjectIdSchema).max(100),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.venueIds).size !== value.venueIds.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate outlets' })
    if (
      value.applicability === 'SELECTED_OUTLETS'
        ? !value.merchantId || !value.venueIds.length
        : value.venueIds.length > 0
    )
      ctx.addIssue({ code: 'custom', message: 'Complete explicit scope required' })
    if (value.applicability === 'ALL_MERCHANT_OUTLETS' && !value.merchantId)
      ctx.addIssue({ code: 'custom', message: 'Merchant required' })
  })
export const adminDealReviewRequestSchema = adminDealWriteEnvelopeSchema.extend({
  decision: z.enum(['APPROVE', 'REJECT']),
})
export const adminDealScopeEvidenceRequestSchema = adminDealWriteEnvelopeSchema.extend({
  reference: z.string().trim().min(3).max(2048),
  statement: z.string().trim().min(10).max(2000),
  staffConfirmed: z.literal(true),
  citationId: adminObjectIdSchema.optional(),
  sourceContentHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
})
export type AdminDealScopeRequest = z.input<typeof adminDealScopeRequestSchema>
export type AdminDealReviewRequest = z.input<typeof adminDealReviewRequestSchema>
export type AdminDealScopeEvidenceRequest = z.input<typeof adminDealScopeEvidenceRequestSchema>
