import {
  findPublicBrowseResult,
  type findPublicDeals,
  publicOutletScopeSelect,
} from '@api/modules/deals/public-deals'
import { type Prisma, PrismaClient } from '@broke-oclock/db/constructor'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Only Prisma reads are substituted. Native HTTP/replica tests cover real query validation.
const db = new PrismaClient({ datasourceUrl: 'mongodb://127.0.0.1:1/unused_public_query_unit' })
type PublicDeal = Awaited<ReturnType<typeof findPublicDeals>>[number]
const now = new Date('2026-11-02T00:00:00Z')
const deal = (id: string, category = 'FOOD') =>
  ({
    id,
    merchantId: 'merchant',
    contentVersion: 1,
    reviewedVersion: 1,
    reviewedAt: now,
    publishedAt: now,
    applicability: 'SELECTED_OUTLETS',
    scopeConfirmation: null,
    merchant: { deletedAt: null, venues: [] },
    venues: [
      {
        venueId: 'outlet',
        venue: {
          id: 'outlet',
          merchantId: 'merchant',
          name: 'Synthetic outlet',
          address: '1 Synthetic Road',
          postalCode: null,
          latitude: 1.3,
          longitude: 103.8,
          catalogueKey: null,
          geographyPrecision: null,
          geographyEvidence: null,
          occupancyEvidence: null,
          deletedAt: null,
        },
      },
    ],
    title: id,
    category,
    cuisine: null,
    offerType: 'OTHER',
    priceMinor: null,
    discountPercent: null,
    description: 'Synthetic query fixture',
    terms: null,
    origin: 'USER_SUBMITTED',
    reviewStatus: 'APPROVED',
    validUntil: null,
    rawValidityText: null,
    sources: [],
    votes: [],
    _count: { comments: 0 },
    currency: 'SGD',
    validFrom: null,
    reviewNote: null,
    operationVersion: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    submittedById: null,
    reviewedById: null,
  }) satisfies PublicDeal & Prisma.DealGetPayload<true>

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parallel public browse reads', () => {
  it('starts both independent graphs before either completes and preserves full projections', async () => {
    const row = deal('visible')
    const categoryOnly = deal('category-only', 'DRINKS')
    const read = vi
      .spyOn(db.deal, 'findMany')
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([row, categoryOnly])
    const result = findPublicBrowseResult(db, { validNow: 'true', category: 'FOOD' }, now)
    expect(read).toHaveBeenCalledTimes(2)
    const body = await result
    expect(body.items.map((item) => item.id)).toEqual(['visible'])
    expect(body.categories).toEqual(['DRINKS', 'FOOD'])
    const [filtered, categories] = read.mock.calls.map(([args]) => args)
    expect(filtered?.where).toHaveProperty('category', 'FOOD')
    expect(categories?.where).not.toHaveProperty('category')
    for (const args of [filtered, categories]) {
      expect(args?.select?.venues).toEqual(publicOutletScopeSelect.venues)
      expect(args?.select?.merchant).toEqual(publicOutletScopeSelect.merchant)
      expect(args).not.toHaveProperty('take')
    }
  })

  it('keeps category options when visitor filters return no items', async () => {
    vi.spyOn(db.deal, 'findMany')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([deal('option')])
    expect(await findPublicBrowseResult(db, { validNow: 'true', category: 'DRINKS' }, now)).toEqual(
      { items: [], categories: ['FOOD'] },
    )
  })

  it('returns both empty results without issuing additional reads', async () => {
    const read = vi.spyOn(db.deal, 'findMany').mockResolvedValue([])
    expect(await findPublicBrowseResult(db, { validNow: 'false' }, now)).toEqual({
      items: [],
      categories: [],
    })
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('does not truncate the existing catalogue response', async () => {
    const rows = Array.from({ length: 1025 }, (_, i) => deal(`offer-${i}`))
    vi.spyOn(db.deal, 'findMany').mockResolvedValue(rows)
    const body = await findPublicBrowseResult(db, { validNow: 'false' }, now)
    expect(body.items).toHaveLength(rows.length)
  })

  it('propagates a failed graph rather than returning a partial response', async () => {
    vi.spyOn(db.deal, 'findMany')
      .mockRejectedValueOnce(new Error('Synthetic read failed'))
      .mockResolvedValueOnce([])
    await expect(findPublicBrowseResult(db, { validNow: 'false' }, now)).rejects.toThrow(
      'Synthetic read failed',
    )
  })
})
