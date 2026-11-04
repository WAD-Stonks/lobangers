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

export interface Place {
  placeId: string
  name: string
  address: string
  latitude: number
  longitude: number
  stall: Stall | null
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
// URLs with /api and sends the login cookie, so '/deals/stalls' becomes /api/deals/stalls.
// ---------------------------------------------------------------------------------------------

// Finds up to ten stalls whose own or shop name contains the search words (any capitals).
// An empty search lists the first ten.
export const searchStalls = async (search: string): Promise<Stall[]> => {
  const response = await api.http.get('/deals/stalls', { params: { search } })
  return response.data
}

export const searchPlaces = async (search: string): Promise<Place[]> => {
  const response = await api.http.get('/deals/places', { params: { search } })
  return response.data
}

export const addStallFromPlace = async (placeId: string, merchantName: string): Promise<Stall> => {
  const response = await api.http.post('/deals/stalls', { placeId, merchantName })
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
    if (status === 429) return 'Too many map searches. Please wait a minute and try again.'
    // For these the server explains what is wrong, e.g. "All stalls must belong to the
    // same merchant". Its generic "Invalid request" is less helpful than our own fallback.
    const message = error.response?.data?.error?.message
    if (
      (status === 400 || status === 404 || status === 409 || status === 412 || status === 502) &&
      typeof message === 'string' &&
      message !== 'Invalid request'
    )
      return message
  }
  return fallback
}
