import { api } from '@web/lib/api-client'
import { uploadPhoto } from '@web/lib/photo-upload'
import axios from 'axios'

// The photo rules the upload server enforces: one JPEG, PNG or WebP image, up to 4 MB.
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024

// A stall returned by the stall search.
export interface Stall {
  id: string
  name: string
  merchantName: string
  address: string
}

export type OfferType = 'BUY_ONE_GET_ONE' | 'PERCENT_OFF' | 'FIXED_PRICE' | 'OTHER'

// Everything the form sends, apart from the photo.
export interface NewDeal {
  title: string
  description: string
  category: string // 'FOOD', 'DRINKS', ...
  cuisine: string | null // 'CHINESE', 'MALAY', ... or null for "No specific cuisine"
  offerType: OfferType
  discountPercent: number | null // only for PERCENT_OFF
  priceCents: number | null // only for FIXED_PRICE, e.g. 450 means $4.50
  stallIds: string[]
  startDate: string // 'YYYY-MM-DD'
  endDate: string // 'YYYY-MM-DD' (last day of the deal)
  terms: string
}

// ---------------------------------------------------------------------------------------------
// Requests to the server. api.http is the project's shared axios instance: it already starts
// URLs with /api and sends the login cookie, so '/account/venues' becomes /api/account/venues.
// ---------------------------------------------------------------------------------------------

// Finds stalls whose name contains the search words (any capitals). An empty search lists all.
// It only returns stalls with verified occupancy.
export const searchStalls = async (search: string): Promise<Stall[]> => {
  const response = await api.http.get('/account/venues', { params: { search } })
  return response.data
}

export const submitDeal = async (deal: NewDeal, photo: File): Promise<void> => {
  // Step 1: upload the photo to UploadThing. It gives back a "key" that names the file.
  let photoKey: string
  try {
    photoKey = (await uploadPhoto(photo)).key
  } catch {
    throw new Error(PHOTO_UPLOAD_FAILED)
  }
  // Step 2: send the deal as normal JSON, with the photo's key. The server checks that
  // this same user uploaded that photo before attaching it to the deal.
  await api.http.post('/deals', { ...deal, photoKey })
}

const PHOTO_UPLOAD_FAILED = 'PHOTO_UPLOAD_FAILED'

// Turns a failed request into a sentence the user can understand.
export const errorMessageFor = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message === PHOTO_UPLOAD_FAILED)
    return 'Could not upload the photo. Please try again.'
  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    if (status === 401) return 'Your session has ended. Please log in again.'
    // For these the server explains what is wrong, e.g. "All stalls must belong to the
    // same merchant". Its generic "Invalid request" is less helpful than our own fallback.
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
