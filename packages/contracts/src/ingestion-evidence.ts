import { boundedQueryInteger } from '@contracts/query'
import { z } from 'zod'
export const evidenceId = z.string().regex(/^[a-f0-9]{24}$/)
export const evidencePageQuerySchema = z.strictObject({
  limit: boundedQueryInteger(1, 20, 20, /^\d{1,2}$/),
  cursor: evidenceId.optional(),
})
export const evidenceParamsSchema = z.strictObject({ dealId: evidenceId })
export const citationParamsSchema = z.strictObject({ dealId: evidenceId, citationId: evidenceId })
export const evidenceSourceSchema = z.strictObject({
  id: evidenceId,
  name: z.string(),
  provider: z.string(),
  externalId: z.string(),
  url: z.string(),
  enabled: z.boolean(),
})
export const citationMetadataSchema = z.strictObject({
  id: evidenceId,
  dealId: evidenceId,
  postId: evidenceId,
  sourceUrl: z.string(),
  pinnedHash: z.string(),
  currentHash: z.string(),
  latestSnapshotHash: z.string().nullable(),
  hashMatchesCurrent: z.boolean(),
  postStatus: z.string(),
  errorCode: z.string().nullable(),
  createdAt: z.string(),
  fetchedAt: z.string(),
  imageCount: z.number().int().nonnegative(),
  source: evidenceSourceSchema,
})
export const evidencePageSchema = z.strictObject({
  items: z.array(citationMetadataSchema).max(20),
  nextCursor: evidenceId.nullable(),
})
export const citationImageSchema = z.strictObject({
  id: evidenceId,
  sha256: z.string(),
  sourceUrl: z.string(),
  // Historical immutable citations may predate redirect provenance capture.
  // Null is unavailable evidence, never an invitation to substitute sourceUrl.
  finalUrl: z.string().nullable(),
  altText: z.string().nullable(),
  url: z.string().nullable(),
  status: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
})
export const citationDetailSchema = z.strictObject({
  citation: citationMetadataSchema,
  snapshot: z.string().nullable(),
  snapshotBytes: z.number().int().nonnegative(),
  format: z.enum(['moneydigest-v1', 'source-post-v1', 'UNKNOWN']),
  availability: z.enum(['COMPLETE', 'UNKNOWN_FORMAT', 'OVERSIZE']),
  hashVerified: z.boolean(),
  parsed: z.unknown().nullable(),
  parseError: z.string().nullable(),
  images: z.array(citationImageSchema).max(20),
  nextImageCursor: evidenceId.nullable(),
})
export type CitationMetadata = z.infer<typeof citationMetadataSchema>
export type CitationDetail = z.infer<typeof citationDetailSchema>
export type EvidencePage = z.infer<typeof evidencePageSchema>
