import {
  adminNoteSchema,
  adminVersionSchema,
  adminObjectIdSchema as id,
} from '@contracts/admin-common'
import { boundedQueryInteger } from '@contracts/query'
import { z } from 'zod'
export const moderationTargetTypeSchema = z.enum(['DEAL', 'COMMENT'])
export const moderationReportParamsSchema = z.strictObject({
  targetType: moderationTargetTypeSchema,
  id,
})
export const moderationCommentParamsSchema = z.strictObject({ id })
const pagination = {
  limit: boundedQueryInteger(1, 50, 25),
  cursor: id.optional(),
  dealId: id.optional(),
}
export const moderationReportsQuerySchema = z.strictObject({
  ...pagination,
  targetType: moderationTargetTypeSchema,
  status: z.enum(['OPEN', 'RESOLVED', 'DISMISSED']).default('OPEN'),
  reason: z.enum(['SPAM', 'MISLEADING', 'INAPPROPRIATE', 'OTHER']).optional(),
})
export const moderationCommentsQuerySchema = z.strictObject({
  ...pagination,
  state: z.enum(['VISIBLE', 'HIDDEN', 'AUTHOR_DELETED']).default('VISIBLE'),
})
export const moderationResolveSchema = z.strictObject({
  expectedVersion: adminVersionSchema,
  decision: z.enum(['RESOLVED', 'DISMISSED']),
  resolution: adminNoteSchema,
  confirmed: z.literal(true),
})
export const moderationVisibilitySchema = z.strictObject({
  expectedVersion: adminVersionSchema,
  visibility: z.enum(['HIDDEN', 'VISIBLE']),
  note: adminNoteSchema,
  confirmed: z.literal(true),
})
const date = z.string().datetime().nullable()
export const moderationDealSchema = z.strictObject({
  id,
  title: z.string(),
  deletedAt: date,
  publishedAt: date,
  reviewStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'HIDDEN']),
  contentVersion: z.number().int(),
  reviewedVersion: z.number().int().nullable(),
  applicability: z.enum([
    'SELECTED_OUTLETS',
    'ALL_MERCHANT_OUTLETS',
    'ONLINE',
    'NO_FIXED_LOCATION',
  ]),
})
export const moderationCommentSchema = z.strictObject({
  id,
  dealId: id,
  body: z.string(),
  author: z.strictObject({ id, name: z.string() }).nullable(),
  createdAt: z.string().datetime(),
  deletedAt: date,
  hiddenAt: date,
  state: z.enum(['VISIBLE', 'HIDDEN', 'AUTHOR_DELETED']),
  moderationVersion: adminVersionSchema,
  deal: moderationDealSchema.nullable(),
})
export const moderationReportSchema = z.strictObject({
  id,
  targetType: moderationTargetTypeSchema,
  targetId: id,
  reporter: z.strictObject({ id, name: z.string() }).nullable(),
  reason: z.enum(['SPAM', 'MISLEADING', 'INAPPROPRIATE', 'OTHER']),
  details: z.string().nullable(),
  status: z.enum(['OPEN', 'RESOLVED', 'DISMISSED']),
  resolution: z.string().nullable(),
  resolvedAt: date,
  createdAt: z.string().datetime(),
  moderationVersion: adminVersionSchema,
  deal: moderationDealSchema.nullable(),
  comment: moderationCommentSchema.nullable(),
})
export const moderationReportsPageSchema = z.strictObject({
  items: z.array(moderationReportSchema),
  nextCursor: id.nullable(),
})
export const moderationCommentsPageSchema = z.strictObject({
  items: z.array(moderationCommentSchema),
  nextCursor: id.nullable(),
})
export type ModerationReport = z.infer<typeof moderationReportSchema>
export type ModerationComment = z.infer<typeof moderationCommentSchema>
export type ModerationTargetType = z.infer<typeof moderationTargetTypeSchema>
export type ModerationReportsQuery = z.infer<typeof moderationReportsQuerySchema>
export type ModerationCommentsQuery = z.infer<typeof moderationCommentsQuerySchema>
export type ModerationResolution = z.infer<typeof moderationResolveSchema>
export type ModerationVisibility = z.infer<typeof moderationVisibilitySchema>
