import {
  evidenceId,
  evidencePageQuerySchema,
  evidenceSourceSchema,
} from '@contracts/ingestion-evidence'
import { z } from 'zod'
export const recoveryModeSchema = z.enum(['REPROCESS_STORED', 'REFRESH_SOURCE_WINDOW'])
export const recoveryRequestSchema = z.strictObject({
  expectedUpdatedAt: z.iso.datetime(),
  expectedContentHash: z.string().regex(/^[a-f0-9]{64}$/),
  mode: recoveryModeSchema,
  note: z.string().trim().min(1).max(500),
  confirmed: z.literal(true),
})
export const postsQuerySchema = evidencePageQuerySchema.extend({
  status: z.enum(['NEW', 'PARSED', 'NEEDS_REVIEW', 'FAILED', 'IGNORED']).default('FAILED'),
  sourceId: evidenceId.optional(),
  errorCode: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{0,79}$/)
    .optional(),
})
export const postParamsSchema = z.strictObject({ postId: evidenceId })
export const recoveryParamsSchema = z.strictObject({ recoveryId: evidenceId })
export const postSummarySchema = z.strictObject({
  id: evidenceId,
  externalId: z.string(),
  url: z.string(),
  title: z.string().nullable(),
  source: evidenceSourceSchema,
  status: z.string(),
  errorCode: z.string().nullable(),
  failureStage: z.string().nullable(),
  contentHash: z.string(),
  latestSnapshotHash: z.string().nullable(),
  snapshotFormat: z.string().nullable(),
  updatedAt: z.string(),
  fetchedAt: z.string(),
  processedAt: z.string().nullable(),
  snapshotAvailable: z.boolean(),
})
export const postsPageSchema = z.strictObject({
  items: z.array(postSummarySchema).max(20),
  nextCursor: evidenceId.nullable(),
})
export const recoveryResponseSchema = z.strictObject({
  id: evidenceId,
  postId: evidenceId,
  sourceId: evidenceId,
  mode: recoveryModeSchema,
  expectedUpdatedAt: z.string(),
  expectedContentHash: z.string(),
  note: z.string(),
  status: z.enum(['REQUESTED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'INTERRUPTED']),
  targetOutcome: z.enum(['RECOVERED', 'UNCHANGED', 'NOT_OBSERVED', 'STILL_FAILED', 'UNKNOWN']),
  runId: evidenceId.nullable(),
  errorCode: z.string().nullable(),
  requestedAt: z.string(),
  finishedAt: z.string().nullable(),
})
export const postDetailSchema = z.strictObject({
  post: postSummarySchema,
  citations: z
    .array(
      z.strictObject({
        id: evidenceId,
        dealId: evidenceId,
        pinnedHash: z.string(),
        reviewStatus: z.string(),
        contentVersion: z.number().int(),
      }),
    )
    .max(20),
  nextCitationCursor: evidenceId.nullable(),
  capabilities: z
    .array(
      z.strictObject({
        mode: recoveryModeSchema,
        allowed: z.boolean(),
        blockers: z.array(z.string()),
      }),
    )
    .max(2),
  latestRecovery: recoveryResponseSchema.nullable(),
})
export type RecoveryRequest = z.infer<typeof recoveryRequestSchema>
export type RecoveryResult = z.infer<typeof recoveryResponseSchema>
export type PostDetail = z.infer<typeof postDetailSchema>
export type PostsPage = z.infer<typeof postsPageSchema>
