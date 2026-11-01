import { findIngestionDrafts, ingestionDraftSelect } from '@api/modules/ingestion/draft-queries'
import { resolveImportedDealReadScope } from '@api/modules/ingestion/imported-read-scope'
import { importedDealBaseScope, importedDealScope } from '@api/modules/ingestion/review-policy'
import { type Prisma, PrismaClient } from '@broke-oclock/db/constructor'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Query-boundary unit tests never connect; native policy/result parity is covered
// by query-performance.test.ts against its owned disposable loopback replica.
const db = new PrismaClient({ datasourceUrl: 'mongodb://127.0.0.1:1/unused_query_unit' })
const objectId = (index: number) => index.toString(16).padStart(24, '0')
const now = new Date('2026-11-01T00:00:00Z')
const draft = (index: number) =>
  ({
    id: objectId(index),
    operationVersion: null,
    title: 'Synthetic draft',
    description: 'Synthetic evidence only',
    category: 'FOOD',
    cuisine: null,
    offerType: 'OTHER',
    terms: null,
    priceMinor: null,
    currency: 'SGD',
    discountPercent: null,
    validFrom: null,
    validUntil: null,
    rawValidityText: null,
    applicability: 'NO_FIXED_LOCATION',
    origin: 'IMPORTED',
    reviewStatus: 'PENDING',
    contentVersion: 1,
    reviewedVersion: null,
    reviewNote: null,
    reviewedAt: null,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    merchantId: null,
    submittedById: null,
    reviewedById: null,
    scopeConfirmation: null,
    merchant: null,
    venues: [],
    sources: [],
  }) satisfies Prisma.DealGetPayload<{ select: typeof ingestionDraftSelect }> &
    Prisma.DealGetPayload<true>
const window = (start: number, length = 64) =>
  Array.from({ length }, (_, index) => draft(start + index))
const source = (index: number) => ({
  id: objectId(index),
  provider: 'WORDPRESS' as const,
  externalId: `synthetic-${index}`,
  name: 'Synthetic disabled source',
  url: 'https://example.test/',
  enabled: false,
  cursor: null,
  leaseToken: null,
  leaseExpiresAt: null,
  createdAt: now,
  updatedAt: now,
})
afterEach(() => vi.restoreAllMocks())

describe('bounded complete draft keyset reads', () => {
  it('does not hydrate an empty candidate window', async () => {
    const read = vi.spyOn(db.deal, 'findMany').mockResolvedValue([])
    expect(await findIngestionDrafts(db, { limit: 2, status: 'PENDING' })).toEqual([])
    expect(read).toHaveBeenCalledExactlyOnceWith({
      where: { ...importedDealBaseScope, reviewStatus: 'PENDING' },
      orderBy: { id: 'asc' },
      take: 64,
      select: { id: true },
    })
  })

  it('preserves strict cursor and status on scalar and canonical rich reads', async () => {
    const read = vi
      .spyOn(db.deal, 'findMany')
      .mockResolvedValueOnce(window(65, 2))
      .mockResolvedValueOnce([draft(66)])
    expect(
      await findIngestionDrafts(db, { cursor: objectId(64), limit: 2, status: 'REJECTED' }),
    ).toEqual([draft(66)])
    expect(read).toHaveBeenNthCalledWith(1, {
      where: { ...importedDealBaseScope, reviewStatus: 'REJECTED', id: { gt: objectId(64) } },
      orderBy: { id: 'asc' },
      take: 64,
      select: { id: true },
    })
    expect(read).toHaveBeenNthCalledWith(2, {
      where: {
        ...importedDealScope,
        reviewStatus: 'REJECTED',
        id: { in: [objectId(65), objectId(66)] },
      },
      orderBy: { id: 'asc' },
      take: 3,
      select: ingestionDraftSelect,
    })
  })

  it('continues through 65 fully rejected windows rather than imposing a scan cap', async () => {
    const read = vi.spyOn(db.deal, 'findMany')
    for (let index = 0; index < 65; index++)
      read.mockResolvedValueOnce(window(index * 64 + 1)).mockResolvedValueOnce([])
    read.mockResolvedValueOnce(window(4161, 2)).mockResolvedValueOnce([draft(4162)])
    const rows = await findIngestionDrafts(db, { limit: 1, status: 'PENDING' })
    expect(rows).toEqual([draft(4162)])
    expect(read).toHaveBeenCalledTimes(132)
    expect(read).toHaveBeenNthCalledWith(
      131,
      expect.objectContaining({
        where: { ...importedDealBaseScope, reviewStatus: 'PENDING', id: { gt: objectId(4160) } },
      }),
    )
  })

  it('reduces rich take to the remaining lookahead budget and stops at limit plus one', async () => {
    const read = vi
      .spyOn(db.deal, 'findMany')
      .mockResolvedValueOnce(window(1))
      .mockResolvedValueOnce([draft(64)])
      .mockResolvedValueOnce(window(65))
      .mockResolvedValueOnce([draft(65), draft(66)])
    expect(await findIngestionDrafts(db, { limit: 2, status: 'APPROVED' })).toEqual([
      draft(64),
      draft(65),
      draft(66),
    ])
    expect(read).toHaveBeenCalledTimes(4)
    expect(read).toHaveBeenNthCalledWith(2, expect.objectContaining({ take: 3 }))
    expect(read).toHaveBeenNthCalledWith(4, expect.objectContaining({ take: 2 }))
  })

  it('checks exhaustion after an exactly full rejected window', async () => {
    const read = vi
      .spyOn(db.deal, 'findMany')
      .mockResolvedValueOnce(window(1))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    expect(await findIngestionDrafts(db, { limit: 1, status: 'PENDING' })).toEqual([])
    expect(read).toHaveBeenCalledTimes(3)
  })
})

describe('request-local canonical imported read scope', () => {
  it('uses the exact canonical source predicate with no enabled filter, page limit or cache', async () => {
    const sources = Array.from({ length: 75 }, (_, index) => source(index + 1))
    const read = vi
      .spyOn(db.importSource, 'findMany')
      .mockResolvedValueOnce(sources)
      .mockResolvedValueOnce([])
    expect(await resolveImportedDealReadScope(db)).toEqual({
      ...importedDealBaseScope,
      sources: { some: { importedPost: { sourceId: { in: sources.map((row) => row.id) } } } },
    })
    expect(read).toHaveBeenCalledExactlyOnceWith({
      where: importedDealScope.sources.some.importedPost.source,
      select: { id: true },
    })
    expect(await resolveImportedDealReadScope(db)).toEqual({
      ...importedDealBaseScope,
      sources: { some: { importedPost: { sourceId: { in: [] } } } },
    })
    expect(read).toHaveBeenCalledTimes(2)
  })
})
