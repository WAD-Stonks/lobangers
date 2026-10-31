import {
  adminAuditActionSchema,
  adminAuditDetailsSchema,
  adminSubjectTypeSchema,
} from '@contracts/admin-common'
import { ingestionRunsResponseSchema } from '@contracts/ingestion'
import { boundedQueryInteger } from '@contracts/query'
import { z } from 'zod'

export const platformObjectIdSchema = z.string().regex(/^[a-f0-9]{24}$/)
export const platformRoleSchema = z.enum(['USER', 'MERCHANT', 'MODERATOR', 'ADMIN'])
export const merchantRequestStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED'])
export const platformVersionSchema = z.number().int().min(0).max(2_147_483_646)
export const platformNoteSchema = z.string().trim().min(1).max(500)
const paginationQuery = {
  cursor: platformObjectIdSchema.optional(),
  limit: boundedQueryInteger(1, 100, 25),
}
const searchQuery = z.string().trim().max(100).optional()

export const platformAccountSummarySchema = z.object({
  id: platformObjectIdSchema,
  name: z.string(),
  email: z.string(),
  role: platformRoleSchema,
  version: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
})
export const platformPageSchema = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: platformObjectIdSchema.nullable() })

export const platformAccountsQuerySchema = z.strictObject({
  ...paginationQuery,
  search: searchQuery,
  role: platformRoleSchema.optional(),
})
export const platformAccountParamsSchema = z.strictObject({ userId: platformObjectIdSchema })
export const platformAccountResponseSchema = platformAccountSummarySchema.extend({
  grants: z.array(
    z.object({
      id: platformObjectIdSchema,
      venueId: platformObjectIdSchema,
      venueName: z.string(),
      merchantName: z.string(),
      version: platformVersionSchema,
      createdAt: z.string().datetime(),
    }),
  ),
})
export const platformVenuesQuerySchema = z.strictObject({ ...paginationQuery, search: searchQuery })
export const platformVenueSchema = z.object({
  id: platformObjectIdSchema,
  name: z.string(),
  merchantName: z.string(),
  address: z.string(),
})
export const merchantRequestsQuerySchema = z.strictObject({
  ...paginationQuery,
  status: merchantRequestStatusSchema.optional(),
})
export const merchantRequestSchema = z.object({
  id: platformObjectIdSchema,
  userId: platformObjectIdSchema,
  userName: z.string(),
  userEmail: z.string(),
  venueId: platformObjectIdSchema,
  venueName: z.string(),
  merchantName: z.string(),
  status: merchantRequestStatusSchema,
  version: platformVersionSchema,
  message: z.string(),
  reviewNote: z.string().nullable(),
  createdAt: z.string().datetime(),
})
export const reviewMerchantRequestParamsSchema = z.strictObject({
  requestId: platformObjectIdSchema,
})
export const reviewMerchantRequestBodySchema = z.strictObject({
  confirmed: z.literal(true),
  expectedVersion: platformVersionSchema,
  decision: z.enum(['APPROVE', 'REJECT']),
  note: platformNoteSchema,
})
export const changePlatformRoleBodySchema = z.strictObject({
  confirmed: z.literal(true),
  expectedVersion: platformVersionSchema,
  role: platformRoleSchema,
  note: platformNoteSchema,
})
export const grantStallBodySchema = z.strictObject({
  confirmed: z.literal(true),
  userId: platformObjectIdSchema,
  venueId: platformObjectIdSchema,
  expectedUserVersion: platformVersionSchema,
  note: platformNoteSchema,
})
export const grantParamsSchema = z.strictObject({ grantId: platformObjectIdSchema })
export const revokeStallBodySchema = z.strictObject({
  confirmed: z.literal(true),
  expectedVersion: platformVersionSchema,
  note: platformNoteSchema,
})
export const platformMutationResponseSchema = z.object({
  id: platformObjectIdSchema,
  version: platformVersionSchema,
})
export const platformAuditQuerySchema = z
  .strictObject({
    ...paginationQuery,
    userId: platformObjectIdSchema.optional(),
    actorId: platformObjectIdSchema.optional(),
    action: adminAuditActionSchema.optional(),
    from: z.iso.datetime().optional(),
    until: z.iso.datetime().optional(),
    subjectType: adminSubjectTypeSchema.optional(),
    subjectId: platformObjectIdSchema.optional(),
  })
  .superRefine((value, context) => {
    if (Boolean(value.from) !== Boolean(value.until)) {
      context.addIssue({
        code: 'custom',
        message: 'Supply both from and until in UTC',
        path: ['until'],
      })
    } else if (value.from && value.until) {
      const duration = Date.parse(value.until) - Date.parse(value.from)
      if (duration <= 0 || duration > 90 * 24 * 60 * 60 * 1000)
        context.addIssue({
          code: 'custom',
          message: 'UTC interval must be positive and at most 90 days',
          path: ['until'],
        })
    }
    if (value.subjectId && !value.subjectType)
      context.addIssue({
        code: 'custom',
        message: 'Subject ID requires a subject type',
        path: ['subjectType'],
      })
  })
export const platformAuditEntrySchema = z.object({
  id: platformObjectIdSchema,
  actorId: platformObjectIdSchema,
  actorName: z.string(),
  action: z.string(),
  targetUserId: platformObjectIdSchema.nullable(),
  venueId: platformObjectIdSchema.nullable(),
  note: z.string(),
  roleBefore: platformRoleSchema.nullable(),
  roleAfter: platformRoleSchema.nullable(),
  subjectType: adminSubjectTypeSchema.nullish(),
  subjectId: platformObjectIdSchema.nullish(),
  detailsJson: adminAuditDetailsSchema.nullish(),
  createdAt: z.string().datetime(),
})
export const platformAuditResponseSchema = platformPageSchema(platformAuditEntrySchema).extend({
  items: z.array(platformAuditEntrySchema).max(100),
})
export type PlatformAuditResponse = z.infer<typeof platformAuditResponseSchema>

export const adminOverviewQuerySchema = z.strictObject({})
export const adminOverviewResponseSchema = z.strictObject({
  generatedAt: z.iso.datetime(),
  counts: z.strictObject({
    pendingMerchantRequests: z.number().int().nonnegative(),
    pendingImportedDrafts: z.number().int().nonnegative(),
    failedImportedPosts: z.number().int().nonnegative(),
  }),
  recentRuns: ingestionRunsResponseSchema.shape.items.max(10),
  readiness: z.strictObject({
    googleConfigured: z.boolean(),
    emailConfigured: z.boolean(),
    oneMapConfigured: z.boolean(),
    ingestionOptIn: z.boolean(),
    reuseAttested: z.boolean(),
    sourceRecordEnabled: z.boolean(),
    sourceIdentityValid: z.boolean(),
    importAllowed: z.boolean(),
    liveProviderAcceptance: z.literal('NOT_ESTABLISHED'),
  }),
})
export type AdminOverviewResponse = z.infer<typeof adminOverviewResponseSchema>

export const adminUserAnalyticsQuerySchema = z.strictObject({})
export const adminUserAnalyticsResponseSchema = z.strictObject({
  generatedAt: z.iso.datetime(),
  timeZone: z.literal('Asia/Singapore'),
  totalUsers: z.number().int().nonnegative(),
  newUsersThisWeek: z.number().int().nonnegative(),
  weeks: z.array(z.strictObject({
    weekStart: z.iso.datetime(),
    weekEnd: z.iso.datetime(),
    newUsers: z.number().int().nonnegative(),
  })).length(8),
})
export type AdminUserAnalyticsResponse = z.infer<typeof adminUserAnalyticsResponseSchema>

export type PlatformAccountsQuery = z.input<typeof platformAccountsQuerySchema>
export type PlatformAccountSummary = z.infer<typeof platformAccountSummarySchema>
export type PlatformRole = z.infer<typeof platformRoleSchema>
export type PlatformAccountResponse = z.infer<typeof platformAccountResponseSchema>
export type PlatformVenue = z.infer<typeof platformVenueSchema>
export type MerchantRequestsQuery = z.input<typeof merchantRequestsQuerySchema>
export type MerchantRequest = z.infer<typeof merchantRequestSchema>
export type ReviewMerchantRequestBody = z.infer<typeof reviewMerchantRequestBodySchema>
export type ChangePlatformRoleBody = z.infer<typeof changePlatformRoleBodySchema>
export type GrantStallBody = z.infer<typeof grantStallBodySchema>
export type RevokeStallBody = z.infer<typeof revokeStallBodySchema>
export type PlatformMutationResponse = z.infer<typeof platformMutationResponseSchema>
export type PlatformAuditQuery = z.input<typeof platformAuditQuerySchema>
export type PlatformAuditEntry = z.infer<typeof platformAuditEntrySchema>
