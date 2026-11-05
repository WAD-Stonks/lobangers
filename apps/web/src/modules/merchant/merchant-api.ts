import { api } from '@web/lib/api-client'
import { uploadPhoto } from '@web/lib/photo-upload'
import axios from 'axios'

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024

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
  category: string
  cuisine: string | null
  outletIds: string[]
  offerType: OfferType
  discountPercent: number | null
  priceCents: number | null
  startDate: string
  endDate: string
  terms: string
  endedAt: string | null
  photo?: DealPhoto | null
}

export interface DealPhoto {
  key: string
  url: string
}

export type DealInput = Omit<MerchantDeal, 'id' | 'endedAt' | 'photo'> & {
  photoKey: string | null
}

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

export const deleteDeal = async (id: string): Promise<void> => {
  await api.http.delete(`/merchant/deals/${id}`)
}

export const savePhoto = async (photo: File): Promise<string> => {
  try {
    return (await uploadPhoto(photo)).key
  } catch {
    throw new Error(PHOTO_UPLOAD_FAILED)
  }
}

const PHOTO_UPLOAD_FAILED = 'PHOTO_UPLOAD_FAILED'

export const errorMessageFor = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message === PHOTO_UPLOAD_FAILED)
    return 'Could not upload the photo. Please try again.'
  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    if (status === 401) return 'Your session has ended. Please log in again.'
    if (status === 403) return 'You do not have access to this outlet any more.'
    if (status === 404) return 'That deal no longer exists.'
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
