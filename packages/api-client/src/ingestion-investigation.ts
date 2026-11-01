import { type QueryInput, request, validateInput } from '@api-client/transport'
import {
  citationDetailSchema,
  citationParamsSchema,
  evidencePageQuerySchema,
  evidencePageSchema,
  evidenceParamsSchema,
} from '@broke-oclock/contracts/ingestion-evidence'
import {
  postDetailSchema,
  postParamsSchema,
  postsPageSchema,
  postsQuerySchema,
  type RecoveryRequest,
  recoveryParamsSchema,
  recoveryRequestSchema,
  recoveryResponseSchema,
} from '@broke-oclock/contracts/ingestion-recovery'
import type { AxiosInstance } from 'axios'
export const createIngestionInvestigationClient = (http: AxiosInstance) => ({
  evidence: (dealId: string, input: QueryInput<typeof evidencePageQuerySchema> = {}) => {
    const id = validateInput(evidenceParamsSchema, { dealId })
    const params = validateInput(evidencePageQuerySchema, input)
    return request(
      http.get(`/ingestion/drafts/${id.dealId}/evidence`, { params }),
      evidencePageSchema,
    )
  },
  citation: (
    dealId: string,
    citationId: string,
    input: QueryInput<typeof evidencePageQuerySchema> = {},
  ) => {
    const id = validateInput(citationParamsSchema, { dealId, citationId })
    const params = validateInput(evidencePageQuerySchema, input)
    return request(
      http.get(`/ingestion/drafts/${id.dealId}/evidence/${id.citationId}`, { params }),
      citationDetailSchema,
    )
  },
  posts: (input: QueryInput<typeof postsQuerySchema> = {}) => {
    const params = validateInput(postsQuerySchema, input)
    return request(http.get('/ingestion/posts', { params }), postsPageSchema)
  },
  post: (postId: string, input: QueryInput<typeof evidencePageQuerySchema> = {}) => {
    const id = validateInput(postParamsSchema, { postId })
    const params = validateInput(evidencePageQuerySchema, input)
    return request(http.get(`/ingestion/posts/${id.postId}`, { params }), postDetailSchema)
  },
  recover: (postId: string, input: RecoveryRequest) => {
    const id = validateInput(postParamsSchema, { postId })
    const body = validateInput(recoveryRequestSchema, input)
    return request(
      http.post(`/ingestion/posts/${id.postId}/recoveries`, body),
      recoveryResponseSchema,
    )
  },
  recovery: (recoveryId: string) => {
    const id = validateInput(recoveryParamsSchema, { recoveryId })
    return request(http.get(`/ingestion/recoveries/${id.recoveryId}`), recoveryResponseSchema)
  },
})
