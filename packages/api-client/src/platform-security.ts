import { request, validateInput } from '@api-client/transport'
import {
  type AccountSecurityMutationBody,
  type AccountSessionsQuery,
  accountSecurityMutationBodySchema,
  accountSecurityMutationResponseSchema,
  accountSecurityResponseSchema,
  accountSessionParamsSchema,
  accountSessionsQuerySchema,
  accountSessionsResponseSchema,
  platformAccountParamsSchema,
  securityContextResponseSchema,
} from '@broke-oclock/contracts/platform-security'
import type { AxiosInstance } from 'axios'

export const createPlatformSecurityClient = (http: AxiosInstance) => {
  const accountPath = (userId: string) =>
    `/admin/accounts/${validateInput(platformAccountParamsSchema, { userId }).userId}`
  return {
    account: (userId: string) =>
      request(http.get(`${accountPath(userId)}/security`), accountSecurityResponseSchema),
    sessions: (userId: string, query: AccountSessionsQuery = {}) =>
      request(
        http.get(`${accountPath(userId)}/sessions`, {
          params: validateInput(accountSessionsQuerySchema, query),
        }),
        accountSessionsResponseSchema,
      ),
    context: () => request(http.get('/admin/security-context'), securityContextResponseSchema),
    suspend: (userId: string, body: AccountSecurityMutationBody) =>
      request(
        http.post(
          `${accountPath(userId)}/suspend`,
          validateInput(accountSecurityMutationBodySchema, body),
        ),
        accountSecurityMutationResponseSchema,
      ),
    reinstate: (userId: string, body: AccountSecurityMutationBody) =>
      request(
        http.post(
          `${accountPath(userId)}/reinstate`,
          validateInput(accountSecurityMutationBodySchema, body),
        ),
        accountSecurityMutationResponseSchema,
      ),
    revokeSession: (userId: string, sessionId: string, body: AccountSecurityMutationBody) => {
      const params = validateInput(accountSessionParamsSchema, { userId, sessionId })
      return request(
        http.delete(`${accountPath(params.userId)}/sessions/${params.sessionId}`, {
          data: validateInput(accountSecurityMutationBodySchema, body),
        }),
        accountSecurityMutationResponseSchema,
      )
    },
    revokeSessions: (userId: string, body: AccountSecurityMutationBody) =>
      request(
        http.delete(`${accountPath(userId)}/sessions`, {
          data: validateInput(accountSecurityMutationBodySchema, body),
        }),
        accountSecurityMutationResponseSchema,
      ),
  }
}
