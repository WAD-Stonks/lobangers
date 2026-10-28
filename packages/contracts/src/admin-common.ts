import { z } from 'zod'

export const adminObjectIdSchema = z.string().regex(/^[a-f0-9]{24}$/)
// Nullable/missing stored counters are legacy zero. Callers submit explicit zero.
export const adminVersionSchema = z.number().int().min(0).max(2_147_483_646)
export const adminNoteSchema = z.string().trim().min(1).max(500)
export const adminSubjectTypeSchema = z.enum([
  'USER',
  'DEAL',
  'MERCHANT',
  'VENUE',
  'COMMENT',
  'DEAL_REPORT',
  'COMMENT_REPORT',
  'IMPORTED_POST',
  'INGESTION_RECOVERY',
])
export const adminAuditActionSchema = z.enum([
  'ROLE_CHANGED',
  'STALL_GRANTED',
  'STALL_REVOKED',
  'REQUEST_SUBMITTED',
  'REQUEST_APPROVED',
  'REQUEST_REJECTED',
  'DEAL_UPDATED',
  'DEAL_APPROVED',
  'DEAL_REJECTED',
  'DEAL_HIDDEN',
  'DEAL_RESTORED',
  'DEAL_ARCHIVED',
  'DEAL_OUTLETS_CHANGED',
  'DEAL_SCOPE_CONFIRMED',
  'MERCHANT_CREATED',
  'MERCHANT_UPDATED',
  'MERCHANT_ARCHIVED',
  'MERCHANT_RESTORED',
  'VENUE_CREATED',
  'VENUE_UPDATED',
  'VENUE_ARCHIVED',
  'VENUE_RESTORED',
  'EVIDENCE_RECORDED',
  'COMMENT_HIDDEN',
  'COMMENT_RESTORED',
  'DEAL_REPORT_RESOLVED',
  'DEAL_REPORT_DISMISSED',
  'COMMENT_REPORT_RESOLVED',
  'COMMENT_REPORT_DISMISSED',
  'INGESTION_RECOVERY_REQUESTED',
  'INGESTION_RECOVERY_SUCCEEDED',
  'INGESTION_RECOVERY_FAILED',
  'INGESTION_RECOVERY_FINISHED',
  'ACCOUNT_SUSPENDED',
  'ACCOUNT_REINSTATED',
  'SESSION_REVOKED',
  'SESSIONS_REVOKED',
])
const auditStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'HIDDEN',
  'OPEN',
  'RESOLVED',
  'DISMISSED',
  'NEW',
  'PARSED',
  'NEEDS_REVIEW',
  'FAILED',
  'IGNORED',
  'REQUESTED',
  'RUNNING',
  'SUCCEEDED',
  'PARTIAL',
  'INTERRUPTED',
  'ACTIVE',
  'SUSPENDED',
])
// Flat, explicit facts only. Never accept arbitrary JSON, source text, auth payloads or secrets.
export const adminAuditDetailsSchema = z
  .strictObject({
    operationVersionBefore: adminVersionSchema.optional(),
    operationVersionAfter: adminVersionSchema.optional(),
    contentVersionBefore: adminVersionSchema.optional(),
    contentVersionAfter: adminVersionSchema.optional(),
    catalogueVersionBefore: adminVersionSchema.optional(),
    catalogueVersionAfter: adminVersionSchema.optional(),
    moderationVersionBefore: adminVersionSchema.optional(),
    moderationVersionAfter: adminVersionSchema.optional(),
    changedFields: z
      .array(
        z.enum([
          'title',
          'description',
          'category',
          'cuisine',
          'offerType',
          'terms',
          'priceMinor',
          'currency',
          'discountPercent',
          'validFrom',
          'validUntil',
          'rawValidityText',
          'applicability',
          'merchantId',
          'venueIds',
          'name',
          'address',
          'area',
          'postalCode',
          'latitude',
          'longitude',
          'imageUrl',
          'geographyEvidence',
          'geographyPrecision',
          'occupancyEvidence',
          'scopeConfirmation',
          'reviewStatus',
          'deletedAt',
          'hiddenAt',
          'status',
          'resolution',
        ]),
      )
      .max(40)
      .optional(),
    previousStatus: auditStatusSchema.optional(),
    newStatus: auditStatusSchema.optional(),
    evidenceIds: z.array(adminObjectIdSchema).max(20).optional(),
    runId: adminObjectIdSchema.optional(),
    sessionId: adminObjectIdSchema.optional(),
    revokedSessionCount: z.number().int().nonnegative().max(1_000_000).optional(),
    mode: z.enum(['REPROCESS_STORED', 'REFRESH_SOURCE_WINDOW']).optional(),
    targetOutcome: z
      .enum(['RECOVERED', 'UNCHANGED', 'NOT_OBSERVED', 'STILL_FAILED', 'UNKNOWN'])
      .optional(),
    errorCode: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{0,79}$/)
      .optional(),
  })
  .refine((value) => JSON.stringify(value).length <= 4096, 'Audit details exceed 4096 characters')

export type AdminSubjectType = z.infer<typeof adminSubjectTypeSchema>
export type AdminAuditAction = z.infer<typeof adminAuditActionSchema>
export type AdminAuditDetails = z.infer<typeof adminAuditDetailsSchema>
