import type { MerchantFlashDrop, MerchantFlashDropBody } from '@broke-oclock/contracts/flash-drops'
import { ApiClientError, api } from '@web/lib/api-client'

export type { MerchantFlashDrop, MerchantFlashDropBody }

export const getFlashDrops = async (): Promise<MerchantFlashDrop[]> => {
  const response = await api.flashDrops.merchant.list()
  return response.items
}

export const saveFlashDraft = (
  draft: MerchantFlashDrop | null,
  body: MerchantFlashDropBody,
): Promise<MerchantFlashDrop> =>
  draft
    ? api.flashDrops.merchant.update(draft.id, { ...body, version: draft.version })
    : api.flashDrops.merchant.create(body)

export const goLiveFlashDrop = (drop: MerchantFlashDrop): Promise<MerchantFlashDrop> =>
  api.flashDrops.merchant.goLive(drop.id, drop.version)

export const endFlashDrop = (drop: MerchantFlashDrop): Promise<MerchantFlashDrop> =>
  api.flashDrops.merchant.end(drop.id, drop.version)

export const deleteFlashDrop = (drop: MerchantFlashDrop): Promise<void> =>
  api.flashDrops.merchant.remove(drop.id, drop.version)

export const flashDropErrorMessage = (error: unknown, fallback: string): string => {
  if (!(error instanceof ApiClientError)) return fallback
  if (error.status === 401) return 'Your session has ended. Please log in again.'
  if (error.status === 403) return 'You do not have access to this outlet any more.'
  const generic = ['Invalid request', 'Not found', 'Not Found', 'Conflict']
  if ([400, 404, 409, 412].includes(error.status) && !generic.includes(error.message)) {
    return error.message
  }
  if (error.status === 409) return 'This flash deal changed just now. Refresh and try again.'
  return fallback
}
