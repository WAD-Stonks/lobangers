import { api } from '@web/lib/api-client'
import { uploadPhoto } from '@web/lib/photo-upload'
import axios from 'axios'

// ⚠️ SAMPLE DATA SWITCH ⚠️
// The backend (POST /api/deals) is built. While this is true, the page still uses fakes:
// - submitDeal() pretends the deal was sent and does not contact the server.
// - searchStalls() searches the fake stalls at the bottom of this file.
// Set it to false once BOTH are ready:
// - some stalls have verified occupancy (the real search returns no others), and
// - photo uploads are set up (PHOTO_STORAGE_PROVIDER and UPLOADTHING_TOKEN in .env).
export const USE_SAMPLE_DATA = true

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
export const searchStalls = async (search: string): Promise<Stall[]> => {
  if (USE_SAMPLE_DATA) {
    const words = search.trim().toLowerCase()
    return sampleStalls.filter((stall) => stall.name.toLowerCase().includes(words))
  }
  // Real route (already built). It only returns stalls with verified occupancy.
  const response = await api.http.get('/account/venues', { params: { search } })
  return response.data
}

export const submitDeal = async (deal: NewDeal, photo: File): Promise<void> => {
  if (USE_SAMPLE_DATA) {
    // Wait half a second so you can see the "Submitting…" button, like a real request.
    await new Promise((resolve) => setTimeout(resolve, 500))
    return
  }
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

// ---------------------------------------------------------------------------------------------
// Sample stalls (only used while USE_SAMPLE_DATA is true). Two branches of one chain, so you can
// try a deal at more than one stall.
// ---------------------------------------------------------------------------------------------

const sampleStalls: Stall[] = [
  {
    id: 'sample-stall-1',
    name: 'Ah Seng Chicken Rice (Maxwell)',
    merchantName: 'Ah Seng Chicken Rice',
    address: '1 Kadayanallur St, #01-10',
  },
  {
    id: 'sample-stall-2',
    name: 'Ah Seng Chicken Rice (Tiong Bahru)',
    merchantName: 'Ah Seng Chicken Rice',
    address: '30 Seng Poh Rd, #02-05',
  },
  {
    id: 'sample-stall-3',
    name: 'Kopi Corner',
    merchantName: 'Kopi Corner',
    address: '2 Orchard Link, #B1-03',
  },
  {
    id: 'sample-stall-4',
    name: 'Mr Bean Waffles',
    merchantName: 'Mr Bean Waffles',
    address: '80 Marine Parade Rd, #01-15',
  },
]
