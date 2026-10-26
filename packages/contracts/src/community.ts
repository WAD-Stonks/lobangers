import { boundedQueryInteger } from '@contracts/query'
import { z } from 'zod'

export const communityEmptySchema = z.strictObject({})
const id = z.string().regex(/^[a-f0-9]{24}$/)
export const communityDealParamsSchema = z.strictObject({ dealId: id })
export const commentParamsSchema = z.strictObject({ commentId: id })
export const voteBodySchema = z.strictObject({ value: z.enum(['ALIVE', 'DEAD']) })
export const commentBodySchema = z.strictObject({ body: z.string().trim().min(1).max(2000) })
export const commentsQuerySchema = z.strictObject({
  limit: boundedQueryInteger(1, 50, 20),
  cursor: id.optional(),
})
export const reportBodySchema = z.strictObject({
  reason: z.enum(['SPAM', 'MISLEADING', 'INAPPROPRIATE', 'OTHER']),
  details: z.string().trim().max(500).optional(),
})
export const communitySummarySchema = z.strictObject({
  alive: z.number().int().min(0),
  dead: z.number().int().min(0),
  status: z.enum(['NO_RECENT_REPORTS', 'UNCERTAIN', 'LIKELY_STILL_ON', 'EXPIRED']),
  myVote: z.enum(['ALIVE', 'DEAD']).nullable(),
  myVoteIsRecent: z.boolean(),
  lastReportedAt: z.string().datetime().nullable(),
  asOf: z.string().datetime(),
  commentCount: z.number().int().min(0),
  policy: z.strictObject({
    minAlive: z.number().int().positive(),
    positivePercent: z.number().int().min(1).max(100),
    windowHours: z.number().positive(),
  }),
})
export const communityCommentSchema = z.strictObject({
  id,
  body: z.string(),
  authorName: z.string(),
  createdAt: z.string().datetime(),
  canDelete: z.boolean(),
})
export const commentsResponseSchema = z.strictObject({
  items: z.array(communityCommentSchema),
  nextCursor: id.nullable(),
})
export const communityOkSchema = z.strictObject({ ok: z.literal(true) })
export type CommunitySummary = z.infer<typeof communitySummarySchema>
export type CommunityComment = z.infer<typeof communityCommentSchema>
