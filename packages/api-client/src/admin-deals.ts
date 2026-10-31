import { type QueryInput, request, validateInput } from '@api-client/transport'
import {
  type AdminDealContentRequest,
  type AdminDealReviewRequest,
  type AdminDealScopeEvidenceRequest,
  type AdminDealScopeRequest,
  adminDealContentRequestSchema,
  adminDealDetailQuerySchema,
  adminDealDetailSchema,
  adminDealParamsSchema,
  adminDealReviewRequestSchema,
  adminDealScopeEvidenceRequestSchema,
  adminDealScopeRequestSchema,
  adminDealsQuerySchema,
  adminDealsResponseSchema,
  adminDealWriteEnvelopeSchema,
} from '@broke-oclock/contracts/admin-deals'
import type { AxiosInstance } from 'axios'

type Envelope = { expectedContentVersion: number; expectedOperationVersion: number; note: string }
const path = (dealId: string) =>
  `/admin/deals/${validateInput(adminDealParamsSchema, { dealId }).dealId}`
export const createAdminDealsClient = (http: AxiosInstance) => ({
  list: (input: QueryInput<typeof adminDealsQuerySchema> = {}) =>
    request(
      http.get('/admin/deals', { params: validateInput(adminDealsQuerySchema, input) }),
      adminDealsResponseSchema,
    ),
  detail: (id: string, input: QueryInput<typeof adminDealDetailQuerySchema> = {}) =>
    request(
      http.get(path(id), { params: validateInput(adminDealDetailQuerySchema, input) }),
      adminDealDetailSchema,
    ),
  content: (id: string, input: AdminDealContentRequest) =>
    request(
      http.patch(`${path(id)}/content`, validateInput(adminDealContentRequestSchema, input)),
      adminDealDetailSchema,
    ),
  scope: (id: string, input: AdminDealScopeRequest) =>
    request(
      http.patch(`${path(id)}/scope`, validateInput(adminDealScopeRequestSchema, input)),
      adminDealDetailSchema,
    ),
  review: (id: string, input: AdminDealReviewRequest) =>
    request(
      http.post(`${path(id)}/review`, validateInput(adminDealReviewRequestSchema, input)),
      adminDealDetailSchema,
    ),
  unpublish: (id: string, input: Envelope) =>
    request(
      http.post(`${path(id)}/unpublish`, validateInput(adminDealWriteEnvelopeSchema, input)),
      adminDealDetailSchema,
    ),
  reopen: (id: string, input: Envelope) =>
    request(
      http.post(`${path(id)}/reopen`, validateInput(adminDealWriteEnvelopeSchema, input)),
      adminDealDetailSchema,
    ),
  scopeEvidence: (id: string, input: AdminDealScopeEvidenceRequest) =>
    request(
      http.post(
        `${path(id)}/scope-evidence`,
        validateInput(adminDealScopeEvidenceRequestSchema, input),
      ),
      adminDealDetailSchema,
    ),
})
export type AdminDealsClient = ReturnType<typeof createAdminDealsClient>
