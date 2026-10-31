import { createAdminAuditClient } from '@api-client/admin-audit'
import { createAdminCatalogueClient } from '@api-client/admin-catalogue'
import { createAdminDealsClient } from '@api-client/admin-deals'
import { createAdminModerationClient } from '@api-client/admin-moderation'
import { createIngestionInvestigationClient } from '@api-client/ingestion-investigation'
import { createPlatformSecurityClient } from '@api-client/platform-security'
import { type QueryInput, request, type SchemaInput, validateInput } from '@api-client/transport'
import {
  accountPageQuerySchema,
  accountProfileSchema,
  accountVenuesQuerySchema,
  accountVenuesResponseSchema,
  bookmarkParamsSchema,
  bookmarkStateSchema,
  bookmarksResponseSchema,
  createMerchantRequestBodySchema,
  myMerchantRequestsResponseSchema,
  submissionsResponseSchema,
} from '@broke-oclock/contracts/account'
import {
  authMethodsResponseSchema,
  currentUserResponseSchema,
  healthResponseSchema,
} from '@broke-oclock/contracts/api'
import {
  assistantChatBodySchema,
  assistantChatResponseSchema,
} from '@broke-oclock/contracts/assistant'
import {
  commentBodySchema,
  commentParamsSchema,
  commentsQuerySchema,
  commentsResponseSchema,
  communityCommentSchema,
  communityDealParamsSchema,
  communityOkSchema,
  communitySummarySchema,
  reportBodySchema,
  voteBodySchema,
} from '@broke-oclock/contracts/community'
import { dealsQuerySchema, dealsResponseSchema } from '@broke-oclock/contracts/deals'
import {
  ingestionAccountsQuerySchema,
  ingestionAccountsResponseSchema,
  ingestionCategoryParamsSchema,
  ingestionCategoryRequestSchema,
  ingestionCategoryResponseSchema,
  ingestionDashboardResponseSchema,
  ingestionDraftsQuerySchema,
  ingestionDraftsResponseSchema,
  ingestionLocationsQuerySchema,
  ingestionLocationsResponseSchema,
  ingestionOutletAssociationParamsSchema,
  ingestionOutletAssociationRequestSchema,
  ingestionOutletAssociationResponseSchema,
  ingestionReviewRequestSchema,
  ingestionReviewResponseSchema,
  ingestionRunResponseSchema,
  ingestionRunsQuerySchema,
  ingestionRunsResponseSchema,
} from '@broke-oclock/contracts/ingestion'
import {
  ingestionAddSourceRequestSchema,
  ingestionSetSourceEnabledRequestSchema,
  ingestionSourceParamsSchema,
  ingestionSourceSchema,
  ingestionSourcesQuerySchema,
  ingestionSourcesResponseSchema,
} from '@broke-oclock/contracts/ingestion-sources'
import {
  adminOverviewResponseSchema,
  changePlatformRoleBodySchema,
  grantParamsSchema,
  grantStallBodySchema,
  merchantRequestSchema,
  merchantRequestsQuerySchema,
  platformAccountParamsSchema,
  platformAccountResponseSchema,
  platformAccountSummarySchema,
  platformAccountsQuerySchema,
  platformAuditEntrySchema,
  platformAuditQuerySchema,
  platformMutationResponseSchema,
  platformObjectIdSchema,
  platformPageSchema,
  platformVenueSchema,
  platformVenuesQuerySchema,
  reviewMerchantRequestBodySchema,
  reviewMerchantRequestParamsSchema,
  revokeStallBodySchema,
} from '@broke-oclock/contracts/platform-admin'
import { venueDetailResponseSchema, venueParamsSchema } from '@broke-oclock/contracts/venues'
import axios from 'axios'

export { ApiClientError, type ApiClientErrorCode, toApiClientError } from '@api-client/transport'

export const createApiClient = (baseURL = '/api') => {
  const http = axios.create({
    baseURL,
    withCredentials: true,
    timeout: 30_000,
    maxBodyLength: 100 * 1024,
    maxContentLength: 1024 * 1024,
    headers: { Accept: 'application/json' },
  })

  const platformAccountsResponseSchema = platformPageSchema(platformAccountSummarySchema)
  const platformVenuesResponseSchema = platformPageSchema(platformVenueSchema)
  const merchantRequestsResponseSchema = platformPageSchema(merchantRequestSchema)
  const platformAuditResponseSchema = platformPageSchema(platformAuditEntrySchema)

  return {
    http,
    adminAudit: createAdminAuditClient(http),
    adminCatalogue: createAdminCatalogueClient(http),
    adminDeals: createAdminDealsClient(http),
    adminModeration: createAdminModerationClient(http),
    ingestionInvestigation: createIngestionInvestigationClient(http),
    platformSecurity: createPlatformSecurityClient(http),
    community: {
      summary: (dealId: string) => {
        const { dealId: id } = validateInput(communityDealParamsSchema, { dealId })
        return request(http.get(`/deals/${id}/community`), communitySummarySchema)
      },
      vote: (dealId: string, value: 'ALIVE' | 'DEAD') => {
        const { dealId: id } = validateInput(communityDealParamsSchema, { dealId })
        const body = validateInput(voteBodySchema, { value })
        return request(http.put(`/deals/${id}/vote`, body), communitySummarySchema)
      },
      removeVote: (dealId: string) => {
        const { dealId: id } = validateInput(communityDealParamsSchema, { dealId })
        return request(http.delete(`/deals/${id}/vote`), communitySummarySchema)
      },
      comments: (dealId: string, input: QueryInput<typeof commentsQuerySchema> = {}) => {
        const { dealId: id } = validateInput(communityDealParamsSchema, { dealId })
        const query = validateInput(commentsQuerySchema, input)
        return request(http.get(`/deals/${id}/comments`, { params: query }), commentsResponseSchema)
      },
      addComment: (dealId: string, body: string) => {
        const { dealId: id } = validateInput(communityDealParamsSchema, { dealId })
        const input = validateInput(commentBodySchema, { body })
        return request(http.post(`/deals/${id}/comments`, input), communityCommentSchema)
      },
      deleteComment: (commentId: string) => {
        const { commentId: id } = validateInput(commentParamsSchema, { commentId })
        return request(http.delete(`/comments/${id}`), communityOkSchema)
      },
      reportDeal: (dealId: string, input: SchemaInput<typeof reportBodySchema>) => {
        const { dealId: id } = validateInput(communityDealParamsSchema, { dealId })
        return request(
          http.post(`/deals/${id}/reports`, validateInput(reportBodySchema, input)),
          communityOkSchema,
        )
      },
      reportComment: (commentId: string, input: SchemaInput<typeof reportBodySchema>) => {
        const { commentId: id } = validateInput(commentParamsSchema, { commentId })
        return request(
          http.post(`/comments/${id}/reports`, validateInput(reportBodySchema, input)),
          communityOkSchema,
        )
      },
    },
    infrastructure: {
      health: () => request(http.get('/health'), healthResponseSchema),
      authMethods: () => request(http.get('/auth-methods'), authMethodsResponseSchema),
      me: () => request(http.get('/me'), currentUserResponseSchema),
    },
    ingestion: {
      sources: (input: QueryInput<typeof ingestionSourcesQuerySchema> = {}) => {
        const query = validateInput(ingestionSourcesQuerySchema, input)
        return request(
          http.get('/ingestion/sources', { params: query }),
          ingestionSourcesResponseSchema,
        )
      },
      addSource: (input: SchemaInput<typeof ingestionAddSourceRequestSchema>) => {
        const body = validateInput(ingestionAddSourceRequestSchema, input)
        return request(http.post('/ingestion/sources', body), ingestionSourceSchema)
      },
      setSourceEnabled: (
        sourceId: string,
        input: SchemaInput<typeof ingestionSetSourceEnabledRequestSchema>,
      ) => {
        const { sourceId: id } = validateInput(ingestionSourceParamsSchema, { sourceId })
        const body = validateInput(ingestionSetSourceEnabledRequestSchema, input)
        return request(http.patch(`/ingestion/sources/${id}`, body), ingestionSourceSchema)
      },
      dashboard: () => request(http.get('/ingestion/dashboard'), ingestionDashboardResponseSchema),
      runs: (input: QueryInput<typeof ingestionRunsQuerySchema> = {}) => {
        const query = validateInput(ingestionRunsQuerySchema, input)
        return request(http.get('/ingestion/runs', { params: query }), ingestionRunsResponseSchema)
      },
      run: () => request(http.post('/ingestion/runs'), ingestionRunResponseSchema),
      drafts: (input: QueryInput<typeof ingestionDraftsQuerySchema> = {}) => {
        const query = validateInput(ingestionDraftsQuerySchema, input)
        return request(
          http.get('/ingestion/drafts', { params: query }),
          ingestionDraftsResponseSchema,
        )
      },
      associateDraftOutlet: (
        dealId: string,
        input: SchemaInput<typeof ingestionOutletAssociationRequestSchema>,
      ) => {
        const { dealId: id } = validateInput(ingestionOutletAssociationParamsSchema, { dealId })
        const body = validateInput(ingestionOutletAssociationRequestSchema, input)
        return request(
          http.patch(`/ingestion/drafts/${id}/outlet`, body),
          ingestionOutletAssociationResponseSchema,
        )
      },
      setDraftCategory: (
        dealId: string,
        input: SchemaInput<typeof ingestionCategoryRequestSchema>,
      ) => {
        const { dealId: id } = validateInput(ingestionCategoryParamsSchema, { dealId })
        const body = validateInput(ingestionCategoryRequestSchema, input)
        return request(
          http.patch(`/ingestion/drafts/${id}/category`, body),
          ingestionCategoryResponseSchema,
        )
      },
      reviewDraft: (dealId: string, input: SchemaInput<typeof ingestionReviewRequestSchema>) => {
        const id = validateInput(platformObjectIdSchema, dealId)
        const body = validateInput(ingestionReviewRequestSchema, input)
        return request(
          http.post(`/ingestion/drafts/${id}/review`, body),
          ingestionReviewResponseSchema,
        )
      },
      accounts: (input: QueryInput<typeof ingestionAccountsQuerySchema> = {}) => {
        const query = validateInput(ingestionAccountsQuerySchema, input)
        return request(
          http.get('/ingestion/accounts', { params: query }),
          ingestionAccountsResponseSchema,
        )
      },
      searchLocations: (input: SchemaInput<typeof ingestionLocationsQuerySchema>) => {
        const query = validateInput(ingestionLocationsQuerySchema, input)
        return request(
          http.get('/ingestion/locations', { params: query }),
          ingestionLocationsResponseSchema,
        )
      },
    },
    deals: {
      list: (input: QueryInput<typeof dealsQuerySchema> = {}) => {
        const query = validateInput(dealsQuerySchema, input)
        return request(http.get('/deals', { params: query }), dealsResponseSchema)
      },
    },
    assistant: {
      chat: (input: SchemaInput<typeof assistantChatBodySchema>) => {
        const body = validateInput(assistantChatBodySchema, input)
        return request(http.post('/assistant/chat', body), assistantChatResponseSchema)
      },
    },
    platformAdmin: {
      overview: () => request(http.get('/admin/overview'), adminOverviewResponseSchema),
      accounts: (input: QueryInput<typeof platformAccountsQuerySchema> = {}) => {
        const query = validateInput(platformAccountsQuerySchema, input)
        return request(
          http.get('/admin/accounts', { params: query }),
          platformAccountsResponseSchema,
        )
      },
      account: (userId: string) => {
        const { userId: id } = validateInput(platformAccountParamsSchema, {
          userId,
        })
        return request(http.get(`/admin/accounts/${id}`), platformAccountResponseSchema)
      },
      changeRole: (userId: string, input: SchemaInput<typeof changePlatformRoleBodySchema>) => {
        const { userId: id } = validateInput(platformAccountParamsSchema, {
          userId,
        })
        const body = validateInput(changePlatformRoleBodySchema, input)
        return request(
          http.patch(`/admin/accounts/${id}/role`, body),
          platformMutationResponseSchema,
        )
      },
      venues: (input: QueryInput<typeof platformVenuesQuerySchema> = {}) => {
        const query = validateInput(platformVenuesQuerySchema, input)
        return request(http.get('/admin/venues', { params: query }), platformVenuesResponseSchema)
      },
      requests: (input: QueryInput<typeof merchantRequestsQuerySchema> = {}) => {
        const query = validateInput(merchantRequestsQuerySchema, input)
        return request(
          http.get('/admin/merchant-requests', { params: query }),
          merchantRequestsResponseSchema,
        )
      },
      reviewRequest: (
        requestId: string,
        input: SchemaInput<typeof reviewMerchantRequestBodySchema>,
      ) => {
        const { requestId: id } = validateInput(reviewMerchantRequestParamsSchema, { requestId })
        const body = validateInput(reviewMerchantRequestBodySchema, input)
        return request(
          http.post(`/admin/merchant-requests/${id}/review`, body),
          platformMutationResponseSchema,
        )
      },
      grantStall: (input: SchemaInput<typeof grantStallBodySchema>) => {
        const body = validateInput(grantStallBodySchema, input)
        return request(http.post('/admin/stall-grants', body), platformMutationResponseSchema)
      },
      revokeStall: (grantId: string, input: SchemaInput<typeof revokeStallBodySchema>) => {
        const { grantId: id } = validateInput(grantParamsSchema, { grantId })
        const body = validateInput(revokeStallBodySchema, input)
        return request(
          http.delete(`/admin/stall-grants/${id}`, { data: body }),
          platformMutationResponseSchema,
        )
      },
      audit: (input: QueryInput<typeof platformAuditQuerySchema> = {}) => {
        const query = validateInput(platformAuditQuerySchema, input)
        return request(http.get('/admin/audit', { params: query }), platformAuditResponseSchema)
      },

      //platform deals endpoints
    },
    venues: {
      get: (venueId: string) => {
        const { venueId: id } = validateInput(venueParamsSchema, { venueId })
        return request(http.get(`/venues/${id}`), venueDetailResponseSchema)
      },
    },
    account: {
      profile: () => request(http.get('/account/profile'), accountProfileSchema),
      bookmarks: (input: QueryInput<typeof accountPageQuerySchema> = {}) => {
        const query = validateInput(accountPageQuerySchema, input)
        return request(http.get('/account/bookmarks', { params: query }), bookmarksResponseSchema)
      },
      saveDeal: (dealId: string) => {
        const { dealId: id } = validateInput(bookmarkParamsSchema, { dealId })
        return request(http.put(`/account/bookmarks/${id}`), bookmarkStateSchema)
      },
      unsaveDeal: (dealId: string) => {
        const { dealId: id } = validateInput(bookmarkParamsSchema, { dealId })
        return request(http.delete(`/account/bookmarks/${id}`), bookmarkStateSchema)
      },
      submissions: (input: QueryInput<typeof accountPageQuerySchema> = {}) => {
        const query = validateInput(accountPageQuerySchema, input)
        return request(
          http.get('/account/submissions', { params: query }),
          submissionsResponseSchema,
        )
      },
      venues: (input: QueryInput<typeof accountVenuesQuerySchema> = {}) => {
        const query = validateInput(accountVenuesQuerySchema, input)
        return request(http.get('/account/venues', { params: query }), accountVenuesResponseSchema)
      },
      requestMerchantAccess: (input: SchemaInput<typeof createMerchantRequestBodySchema>) => {
        const body = validateInput(createMerchantRequestBodySchema, input)
        return request(
          http.post('/account/merchant-requests', body),
          platformMutationResponseSchema,
        )
      },
      merchantRequests: (input: QueryInput<typeof accountPageQuerySchema> = {}) => {
        const query = validateInput(accountPageQuerySchema, input)
        return request(
          http.get('/account/merchant-requests', { params: query }),
          myMerchantRequestsResponseSchema,
        )
      },
    },
  }
}
