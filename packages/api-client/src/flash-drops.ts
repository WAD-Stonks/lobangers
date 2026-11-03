import { request, toApiClientError, validateInput } from '@api-client/transport'
import {
  type AdminFlashDropDecision,
  activeFlashDropsResponseSchema,
  adminFlashDropDecisionSchema,
  adminFlashDropSchema,
  adminFlashDropsQuerySchema,
  adminFlashDropsResponseSchema,
  type FlashDropView,
  flashCodeSchema,
  flashCodesResponseSchema,
  flashDropParamsSchema,
  flashRealtimeConfigSchema,
  type MerchantFlashDropBody,
  type MerchantFlashRealtimeAuth,
  merchantFlashDropBodySchema,
  merchantFlashDropSchema,
  merchantFlashDropsResponseSchema,
  merchantFlashDropVersionSchema,
  merchantFlashRealtimeAuthResponseSchema,
  merchantFlashRealtimeAuthSchema,
} from '@broke-oclock/contracts/flash-drops'
import type { AxiosInstance } from 'axios'

const id = (dropId: string) => validateInput(flashDropParamsSchema, { dropId }).dropId

// Flash deals: the live ones on the map, claim codes, the merchant's own (drafts, Go live, end)
// and admin removal.
export const createFlashDropsClient = (http: AxiosInstance) => ({
  active: () => request(http.get('/flash-drops/active'), activeFlashDropsResponseSchema),
  claim: (dropId: string) =>
    request(http.post(`/flash-drops/${id(dropId)}/claims`), flashCodeSchema),
  myCodes: () => request(http.get('/flash-drops/codes'), flashCodesResponseSchema),
  // The Pusher key for live updates, or null when the API has none and browsers poll.
  realtimeConfig: () => request(http.get('/flash-drops/realtime'), flashRealtimeConfigSchema),
  merchant: {
    realtimeAuth: (input: MerchantFlashRealtimeAuth) =>
      request(
        http.post(
          '/merchant/flash-drops/realtime/auth',
          validateInput(merchantFlashRealtimeAuthSchema, input),
        ),
        merchantFlashRealtimeAuthResponseSchema,
      ),
    list: () => request(http.get('/merchant/flash-drops'), merchantFlashDropsResponseSchema),
    create: (input: MerchantFlashDropBody) =>
      request(
        http.post('/merchant/flash-drops', validateInput(merchantFlashDropBodySchema, input)),
        merchantFlashDropSchema,
      ),
    update: (dropId: string, input: MerchantFlashDropBody) =>
      request(
        http.put(
          `/merchant/flash-drops/${id(dropId)}`,
          validateInput(merchantFlashDropBodySchema, input),
        ),
        merchantFlashDropSchema,
      ),
    goLive: (dropId: string, version: number) =>
      request(
        http.post(
          `/merchant/flash-drops/${id(dropId)}/go-live`,
          validateInput(merchantFlashDropVersionSchema, { version }),
        ),
        merchantFlashDropSchema,
      ),
    end: (dropId: string, version: number) =>
      request(
        http.post(
          `/merchant/flash-drops/${id(dropId)}/end`,
          validateInput(merchantFlashDropVersionSchema, { version }),
        ),
        merchantFlashDropSchema,
      ),
    // Answers 204 with no body, so there is nothing to parse.
    // Deletes a draft, or removes a past flash deal from the merchant's history.
    remove: async (dropId: string, version: number): Promise<void> => {
      const data = validateInput(merchantFlashDropVersionSchema, { version })
      try {
        await http.delete(`/merchant/flash-drops/${id(dropId)}`, { data })
      } catch (error) {
        throw toApiClientError(error)
      }
    },
  },
  admin: {
    list: (view: FlashDropView) =>
      request(
        http.get('/admin/flash-drops', {
          params: validateInput(adminFlashDropsQuerySchema, { view }),
        }),
        adminFlashDropsResponseSchema,
      ),
    decide: (dropId: string, input: AdminFlashDropDecision) =>
      request(
        http.post(
          `/admin/flash-drops/${id(dropId)}/decision`,
          validateInput(adminFlashDropDecisionSchema, input),
        ),
        adminFlashDropSchema,
      ),
  },
})
