import type { MerchantFlashDrop, MerchantFlashDropBody } from '@broke-oclock/contracts/flash-drops'
import { ApiClientError, api } from '@web/lib/api-client'

export type { MerchantFlashDrop, MerchantFlashDropBody }

// ---------------------------------------------------------------------------------------------
// Requests for the merchant's flash deals, through the project's typed client
// (api.flashDrops.merchant). The server only ever returns this merchant's own flash deals.
// ---------------------------------------------------------------------------------------------

export const getFlashDrops = async (): Promise<MerchantFlashDrop[]> => {
  const response = await api.flashDrops.merchant.list()
  return response.items
}

// "Save as flash deal": a new draft, or changes to an existing one. Nothing goes public.
export const saveFlashDraft = (
  draft: MerchantFlashDrop | null,
  body: MerchantFlashDropBody,
): Promise<MerchantFlashDrop> =>
  draft
    ? api.flashDrops.merchant.update(draft.id, { ...body, version: draft.version })
    : api.flashDrops.merchant.create(body)

// Go live: the draft shows on the map from its start time.
export const goLiveFlashDrop = (drop: MerchantFlashDrop): Promise<MerchantFlashDrop> =>
  api.flashDrops.merchant.goLive(drop.id, drop.version)

// Ends a scheduled or live flash deal early.
export const endFlashDrop = (drop: MerchantFlashDrop): Promise<MerchantFlashDrop> =>
  api.flashDrops.merchant.end(drop.id, drop.version)

// Deletes a draft for good (it was never public), or removes a past flash deal from the
// merchant's history. Codes people claimed from it stay in their My codes.
export const deleteFlashDrop = (drop: MerchantFlashDrop): Promise<void> =>
  api.flashDrops.merchant.remove(drop.id, drop.version)

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
  if (error.status === 409) return 'This flash deal changed just now. Refresh and try again.'
  return fallback
}
