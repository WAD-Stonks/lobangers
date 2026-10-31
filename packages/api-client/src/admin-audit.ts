import { type QueryInput, request, validateInput } from '@api-client/transport'
import {
  platformAuditQuerySchema,
  platformAuditResponseSchema,
} from '@broke-oclock/contracts/platform-admin'
import type { AxiosInstance } from 'axios'

export const createAdminAuditClient = (http: AxiosInstance) => ({
  list: (input: QueryInput<typeof platformAuditQuerySchema> = {}) => {
    const query = validateInput(platformAuditQuerySchema, input)
    return request(http.get('/admin/audit', { params: query }), platformAuditResponseSchema)
  },
})
