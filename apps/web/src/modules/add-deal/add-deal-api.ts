import { api } from '@web/lib/api-client'
import { uploadPhoto } from '@web/lib/photo-upload'
import axios from 'axios'

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024

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

export interface NewDeal {
  title: string
  description: string
  category: string
  cuisine: string | null
  offerType: OfferType
  discountPercent: number | null
  priceCents: number | null
  stallIds: string[]
  startDate: string
  endDate: string
  terms: string
}

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
  let photoKey: string
  try {
    photoKey = (await uploadPhoto(photo)).key
  } catch {
    throw new Error(PHOTO_UPLOAD_FAILED)
  }
  await api.http.post('/deals', { ...deal, photoKey })
}

const PHOTO_UPLOAD_FAILED = 'PHOTO_UPLOAD_FAILED'

export const errorMessageFor = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message === PHOTO_UPLOAD_FAILED)
    return 'Could not upload the photo. Please try again.'
  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    if (status === 401) return 'Your session has ended. Please log in again.'
    if (status === 429) return 'Too many map searches. Please wait a minute and try again.'
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
