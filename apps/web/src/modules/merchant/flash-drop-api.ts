import type { MerchantFlashDrop, MerchantFlashDropBody } from '@broke-oclock/contracts/flash-drops'
import { ApiClientError, api } from '@web/lib/api-client'

export type { MerchantFlashDrop, MerchantFlashDropBody }

// ---------------------------------------------------------------------------------------------
// Requests to the server, through the project's typed client (api.flashDrops.merchant).
// ---------------------------------------------------------------------------------------------

export const getFlashDrops = async (): Promise<MerchantFlashDrop[]> => {
  const response = await api.flashDrops.merchant.list()
  return response.items
}

export const createFlashDrop = (body: MerchantFlashDropBody): Promise<MerchantFlashDrop> =>
  api.flashDrops.merchant.create(body)

// Sends a drop that LoBangers sent back again, after the merchant fixed it.
export const resendFlashDrop = (
  drop: MerchantFlashDrop,
  body: MerchantFlashDropBody,
): Promise<MerchantFlashDrop> =>
  api.flashDrops.merchant.resubmit(drop.id, { ...body, version: drop.version })

// Withdraws a drop that is still in review, or ends a scheduled or live drop early.
export const endFlashDrop = (drop: MerchantFlashDrop): Promise<MerchantFlashDrop> =>
  api.flashDrops.merchant.end(drop.id, drop.version)

// Turns a failed request into a sentence the merchant can understand.
export const flashDropErrorMessage = (error: unknown, fallback: string): string => {
  if (!(error instanceof ApiClientError)) return fallback
  if (error.status === 401) return 'Your session has ended. Please log in again.'
  if (error.status === 403) return 'You do not have access to this outlet any more.'
  // For these the server explains what is wrong, e.g. "The flash price has to be lower than
  // the usual price". Its generic one-word messages are less helpful than our own fallback.
  const generic = ['Invalid request', 'Not found', 'Not Found', 'Conflict']
  if ([400, 404, 409, 412].includes(error.status) && !generic.includes(error.message)) {
    return error.message
  }
  if (error.status === 409) return 'Someone changed this drop just now. Refresh and try again.'
  return fallback
}
