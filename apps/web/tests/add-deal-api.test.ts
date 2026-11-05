import {
  addStallFromPlace,
  errorMessageFor,
  searchPlaces,
  searchStalls,
  submitDeal,
} from '@web/modules/add-deal/add-deal-api'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), uploadPhoto: vi.fn() }))

vi.mock('@web/lib/api-client', () => ({ api: { http: { get: mocks.get, post: mocks.post } } }))
vi.mock('@web/lib/photo-upload', () => ({ uploadPhoto: mocks.uploadPhoto }))

afterEach(() => {
  vi.clearAllMocks()
})

const deal = {
  title: 'Synthetic 1-for-1',
  description: 'Two plates for one.',
  category: 'FOOD',
  cuisine: null,
  offerType: 'BUY_ONE_GET_ONE' as const,
  discountPercent: null,
  priceCents: null,
  stallIds: ['a'.repeat(24)],
  startDate: '2099-01-01',
  endDate: '2099-01-31',
  terms: 'Dine-in only',
}
const photo = new File(['image'], 'lunch.png', { type: 'image/png' })

describe('add a deal requests', () => {
  it('searches the stalls on the server', async () => {
    const stalls = [
      { id: 'a'.repeat(24), name: 'Synthetic Stall', merchantName: 'S', address: '1' },
    ]
    mocks.get.mockResolvedValue({ data: stalls })

    expect(await searchStalls('synthetic')).toEqual(stalls)
    expect(mocks.get).toHaveBeenCalledWith('/deals/stalls', { params: { search: 'synthetic' } })
  })

  it('searches the map and adds a picked place by its ID and shop name', async () => {
    mocks.get.mockResolvedValue({ data: [] })
    mocks.post.mockResolvedValue({ data: { id: 'c'.repeat(24) } })

    await searchPlaces('synthetic kopi')
    expect(mocks.get).toHaveBeenCalledWith('/deals/places', {
      params: { search: 'synthetic kopi' },
    })
    expect(await addStallFromPlace('SyntheticPlace_01', 'Synthetic Kopi')).toEqual({
      id: 'c'.repeat(24),
    })
    expect(mocks.post).toHaveBeenCalledWith('/deals/stalls', {
      placeId: 'SyntheticPlace_01',
      merchantName: 'Synthetic Kopi',
    })
  })

  it('uploads the photo, then sends the deal with its key', async () => {
    mocks.uploadPhoto.mockResolvedValue({ key: 'synthetic-key' })
    mocks.post.mockResolvedValue({ data: { id: 'b'.repeat(24), reviewStatus: 'PENDING' } })

    await submitDeal(deal, photo)
    expect(mocks.uploadPhoto).toHaveBeenCalledWith(photo)
    expect(mocks.post).toHaveBeenCalledWith('/deals', { ...deal, photoKey: 'synthetic-key' })
  })

  it('sends nothing and explains when the photo upload fails', async () => {
    mocks.uploadPhoto.mockRejectedValue(new Error('Photo storage is not configured'))

    const failure = await submitDeal(deal, photo).catch((error: unknown) => error)
    expect(mocks.post).not.toHaveBeenCalled()
    expect(errorMessageFor(failure, 'fallback')).toBe(
      'Could not upload the photo. Please try again.',
    )
  })
})
