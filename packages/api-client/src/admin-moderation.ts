import { type QueryInput, request, type SchemaInput, validateInput } from '@api-client/transport'
import {
  type ModerationTargetType,
  moderationCommentParamsSchema,
  moderationCommentSchema,
  moderationCommentsPageSchema,
  moderationCommentsQuerySchema,
  moderationReportParamsSchema,
  moderationReportSchema,
  moderationReportsPageSchema,
  moderationReportsQuerySchema,
  moderationResolveSchema,
  moderationVisibilitySchema,
} from '@broke-oclock/contracts/admin-moderation'
import type { AxiosInstance } from 'axios'
export const createAdminModerationClient = (http: AxiosInstance) => ({
  reports: (
    input: QueryInput<typeof moderationReportsQuerySchema> & { targetType: ModerationTargetType },
  ) =>
    request(
      http.get('/admin/moderation/reports', {
        params: validateInput(moderationReportsQuerySchema, input),
      }),
      moderationReportsPageSchema,
    ),
  report: (targetType: ModerationTargetType, id: string) => {
    const p = validateInput(moderationReportParamsSchema, { targetType, id })
    return request(
      http.get(`/admin/moderation/reports/${p.targetType}/${p.id}`),
      moderationReportSchema,
    )
  },
  resolve: (
    targetType: ModerationTargetType,
    id: string,
    input: SchemaInput<typeof moderationResolveSchema>,
  ) => {
    const p = validateInput(moderationReportParamsSchema, { targetType, id })
    const body = validateInput(moderationResolveSchema, input)
    return request(
      http.post(`/admin/moderation/reports/${p.targetType}/${p.id}/resolve`, body),
      moderationReportSchema,
    )
  },
  comments: (input: QueryInput<typeof moderationCommentsQuerySchema> = {}) =>
    request(
      http.get('/admin/moderation/comments', {
        params: validateInput(moderationCommentsQuerySchema, input),
      }),
      moderationCommentsPageSchema,
    ),
  comment: (id: string) => {
    const p = validateInput(moderationCommentParamsSchema, { id })
    return request(http.get(`/admin/moderation/comments/${p.id}`), moderationCommentSchema)
  },
  visibility: (id: string, input: SchemaInput<typeof moderationVisibilitySchema>) => {
    const p = validateInput(moderationCommentParamsSchema, { id })
    const body = validateInput(moderationVisibilitySchema, input)
    return request(
      http.post(`/admin/moderation/comments/${p.id}/visibility`, body),
      moderationCommentSchema,
    )
  },
})
