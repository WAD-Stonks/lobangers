import { api } from '@web/lib/api-client'
import { uploadPhoto } from '@web/lib/photo-upload'
import axios from 'axios'

// The photo rules the upload server enforces: one JPEG, PNG or WebP image, up to 4 MB.
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024

// An outlet (stall/branch) this merchant has been approved to manage.
export interface MerchantOutlet {
  id: string
  name: string
  address: string
}

export type OfferType = 'BUY_ONE_GET_ONE' | 'PERCENT_OFF' | 'FIXED_PRICE' | 'OTHER'

export interface MerchantDeal {
  id: string
  title: string
  description: string
  category: string // 'FOOD', 'DRINKS', ...
  cuisine: string | null // 'CHINESE', 'MALAY', ... or null for "No specific cuisine"
  outletIds: string[] // which of the merchant's outlets the deal runs at
  offerType: OfferType
  discountPercent: number | null // only for PERCENT_OFF
  priceCents: number | null // only for FIXED_PRICE, e.g. 450 means $4.50
  startDate: string // 'YYYY-MM-DD', or '' to start straight away
  endDate: string // 'YYYY-MM-DD' (last day of the deal), or '' for no end date
  terms: string
  endedAt: string | null // set when the merchant ends the deal early
  photo?: DealPhoto | null // the deal's one optional photo (the server always sends it)
}

export interface DealPhoto {
  key: string // the UploadThing key that names the file
  url: string
}

// Everything the form sends: a deal without the fields the server fills in. photoKey is the
// photo to keep or attach (see savePhoto), or null for no photo.
export type DealInput = Omit<MerchantDeal, 'id' | 'endedAt' | 'photo'> & {
  photoKey: string | null
}

// ---------------------------------------------------------------------------------------------
// Requests to the server. Each function returns the data the page needs.
// api.http is the project's shared axios instance: it already starts URLs with /api and sends
// the login cookie, so '/merchant/deals' becomes a request to /api/merchant/deals.
// ---------------------------------------------------------------------------------------------

export const getOutlets = async (): Promise<MerchantOutlet[]> => {
  const response = await api.http.get('/merchant/outlets')
  return response.data.items
}

export const getDeals = async (): Promise<MerchantDeal[]> => {
  const response = await api.http.get('/merchant/deals')
  return response.data.items
}

export const createDeal = async (input: DealInput): Promise<MerchantDeal> => {
  const response = await api.http.post('/merchant/deals', input)
  return response.data
}

export const updateDeal = async (id: string, input: DealInput): Promise<MerchantDeal> => {
  const response = await api.http.patch(`/merchant/deals/${id}`, input)
  return response.data
}

export const endDeal = async (id: string): Promise<MerchantDeal> => {
  const response = await api.http.post(`/merchant/deals/${id}/end`)
  return response.data
}

// Deletes a scheduled or ended deal: it leaves the map and the dashboard. Live deals are ended
// first.
export const deleteDeal = async (id: string): Promise<void> => {
  await api.http.delete(`/merchant/deals/${id}`)
}

// Uploads a newly chosen photo to UploadThing and returns its key, which the deal is then saved
// with. The server checks that this same merchant uploaded it.
export const savePhoto = async (photo: File): Promise<string> => {
  try {
    return (await uploadPhoto(photo)).key
  } catch {
    throw new Error(PHOTO_UPLOAD_FAILED)
  }
}

const PHOTO_UPLOAD_FAILED = 'PHOTO_UPLOAD_FAILED'

// Turns a failed request into a sentence the merchant can understand.
export const errorMessageFor = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message === PHOTO_UPLOAD_FAILED)
    return 'Could not upload the photo. Please try again.'
  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    if (status === 401) return 'Your session has ended. Please log in again.'
    if (status === 403) return 'You do not have access to this outlet any more.'
    if (status === 404) return 'That deal no longer exists.'
    // For these the server explains what is wrong, e.g. "Ended deals cannot be edited".
    // Its generic "Invalid request" is less helpful than our own fallback.
    const message = error.response?.data?.error?.message
    if (
      (status === 400 || status === 409 || status === 412) &&
      typeof message === 'string' &&
      message !== 'Invalid request'
    )
      return message
  }
  return fallback
}
