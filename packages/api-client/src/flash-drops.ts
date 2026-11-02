import { request, validateInput } from '@api-client/transport'
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
  type MerchantFlashDropBody,
  merchantFlashDropBodySchema,
  merchantFlashDropEndSchema,
  merchantFlashDropSchema,
  merchantFlashDropsResponseSchema,
} from '@broke-oclock/contracts/flash-drops'
import type { AxiosInstance } from 'axios'

const id = (dropId: string) => validateInput(flashDropParamsSchema, { dropId }).dropId

// Flash Drop: the live drops on the map, claim codes, the merchant's drops and admin review.
export const createFlashDropsClient = (http: AxiosInstance) => ({
  active: () => request(http.get('/flash-drops/active'), activeFlashDropsResponseSchema),
  claim: (dropId: string) =>
    request(http.post(`/flash-drops/${id(dropId)}/claims`), flashCodeSchema),
  myCodes: () => request(http.get('/flash-drops/codes'), flashCodesResponseSchema),
  merchant: {
    list: () => request(http.get('/merchant/flash-drops'), merchantFlashDropsResponseSchema),
    create: (input: MerchantFlashDropBody) =>
      request(
        http.post('/merchant/flash-drops', validateInput(merchantFlashDropBodySchema, input)),
        merchantFlashDropSchema,
      ),
    resubmit: (dropId: string, input: MerchantFlashDropBody) =>
      request(
        http.put(
          `/merchant/flash-drops/${id(dropId)}`,
          validateInput(merchantFlashDropBodySchema, input),
        ),
        merchantFlashDropSchema,
      ),
    end: (dropId: string, version: number) =>
      request(
        http.post(
          `/merchant/flash-drops/${id(dropId)}/end`,
          validateInput(merchantFlashDropEndSchema, { version }),
        ),
        merchantFlashDropSchema,
      ),
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
