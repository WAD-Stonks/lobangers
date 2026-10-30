import { api } from '@web/lib/api-client'
import axios from 'axios'

// ⚠️ SAMPLE DATA SWITCH ⚠️
// The backend routes (/api/merchant/...) are built. While this is true, every function below
// still uses the fake outlets and deals further down instead of calling the server, so the
// page can be clicked through. Changes are kept in the browser only and reset when you refresh.
// Set this to false to use real data. The merchant then needs an approved stall (an active
// stall grant) or the page shows "You don't manage any outlets yet".
export const USE_SAMPLE_DATA = true

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
}

// Everything the form sends: a deal without the fields the server fills in.
export type DealInput = Omit<MerchantDeal, 'id' | 'endedAt'>

// ---------------------------------------------------------------------------------------------
// Requests to the server. Each function returns the data the page needs.
// api.http is the project's shared axios instance: it already starts URLs with /api and sends
// the login cookie, so '/merchant/deals' becomes a request to /api/merchant/deals.
// ---------------------------------------------------------------------------------------------

export const getOutlets = async (): Promise<MerchantOutlet[]> => {
  if (USE_SAMPLE_DATA) return sampleOutlets
  const response = await api.http.get('/merchant/outlets')
  return response.data.items
}

export const getDeals = async (): Promise<MerchantDeal[]> => {
  if (USE_SAMPLE_DATA) return [...sampleDeals]
  const response = await api.http.get('/merchant/deals')
  return response.data.items
}

export const createDeal = async (input: DealInput): Promise<MerchantDeal> => {
  if (USE_SAMPLE_DATA) {
    const deal = { ...input, id: `sample-${Date.now()}`, endedAt: null }
    sampleDeals.push(deal)
    return deal
  }
  const response = await api.http.post('/merchant/deals', input)
  return response.data
}

export const updateDeal = async (id: string, input: DealInput): Promise<MerchantDeal> => {
  if (USE_SAMPLE_DATA) {
    const index = sampleDeals.findIndex((deal) => deal.id === id)
    const deal = { ...input, id, endedAt: null }
    sampleDeals[index] = deal
    return deal
  }
  const response = await api.http.patch(`/merchant/deals/${id}`, input)
  return response.data
}

export const endDeal = async (id: string): Promise<MerchantDeal> => {
  if (USE_SAMPLE_DATA) {
    const index = sampleDeals.findIndex((deal) => deal.id === id)
    const deal = { ...sampleDeals[index], endedAt: new Date().toISOString() } as MerchantDeal
    sampleDeals[index] = deal
    return deal
  }
  const response = await api.http.post(`/merchant/deals/${id}/end`)
  return response.data
}

// Turns a failed request into a sentence the merchant can understand.
export const errorMessageFor = (error: unknown, fallback: string): string => {
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

// ---------------------------------------------------------------------------------------------
// Sample data (only used while USE_SAMPLE_DATA is true). Two branches of one franchise, so you
// can try a deal that runs at just one branch and one that runs at both.
// ---------------------------------------------------------------------------------------------

const sampleOutlets: MerchantOutlet[] = [
  { id: 'outlet-1', name: 'Ah Seng Chicken Rice (Maxwell)', address: '1 Kadayanallur St, #01-10' },
  { id: 'outlet-2', name: 'Ah Seng Chicken Rice (Tiong Bahru)', address: '30 Seng Poh Rd, #02-05' },
]

const sampleDeals: MerchantDeal[] = [
  {
    id: 'sample-1',
    title: '1-for-1 Roast Chicken Rice',
    description: 'Buy one plate of roast chicken rice and get a second plate free.',
    category: 'FOOD',
    cuisine: 'CHINESE',
    outletIds: ['outlet-1', 'outlet-2'],
    offerType: 'BUY_ONE_GET_ONE',
    discountPercent: null,
    priceCents: null,
    startDate: '',
    endDate: '',
    terms: 'Dine-in only.\nWeekdays 2pm to 5pm.',
    endedAt: null,
  },
  {
    id: 'sample-2',
    title: '20% off set meals',
    description: 'All set meals are 20% off at our Tiong Bahru branch.',
    category: 'FOOD',
    cuisine: 'CHINESE',
    outletIds: ['outlet-2'],
    offerType: 'PERCENT_OFF',
    discountPercent: 20,
    priceCents: null,
    startDate: '2026-12-01',
    endDate: '2026-12-31',
    terms: '',
    endedAt: null,
  },
  {
    id: 'sample-3',
    title: '$3 chicken rice lunch',
    description: 'Plain chicken rice for $3 during lunch.',
    category: 'FOOD',
    cuisine: 'CHINESE',
    outletIds: ['outlet-1'],
    offerType: 'FIXED_PRICE',
    discountPercent: null,
    priceCents: 300,
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    terms: 'While stocks last.',
    endedAt: null,
  },
]
