import { catalogueVenueSelect } from '@api/modules/deals/catalogue-select'
import { importedDealBaseScope, importedDealScope } from '@api/modules/ingestion/review-policy'
import type { Database } from '@api/modules/platform-admin/transaction'
import type { IngestionDraftsQuery } from '@broke-oclock/contracts/ingestion'
import type { Prisma } from '@broke-oclock/db/constructor'

const candidateWindowSize = 64

export const ingestionDraftSelect = {
  id: true,
  title: true,
  description: true,
  terms: true,
  category: true,
  offerType: true,
  validFrom: true,
  validUntil: true,
  rawValidityText: true,
  applicability: true,
  merchantId: true,
  scopeConfirmation: true,
  merchant: { select: { deletedAt: true } },
  venues: {
    select: {
      venueId: true,
      venue: {
        select: catalogueVenueSelect,
      },
    },
  },
  reviewStatus: true,
  contentVersion: true,
  operationVersion: true,
  reviewNote: true,
  priceMinor: true,
  currency: true,
  discountPercent: true,
  sources: {
    take: 1,
    orderBy: { id: 'asc' },
    select: {
      sourceUrl: true,
      sourceContentHash: true,
      images: {
        take: 5,
        orderBy: { id: 'asc' },
        select: {
          sourceUrl: true,
          altText: true,
          image: {
            select: {
              id: true,
              hostedUrl: true,
              mimeType: true,
              sizeBytes: true,
              status: true,
            },
          },
        },
      },
      importedPost: {
        select: { contentHash: true, errorCode: true, source: { select: { name: true } } },
      },
    },
  },
} satisfies Prisma.DealSelect

type DraftRow = Prisma.DealGetPayload<{ select: typeof ingestionDraftSelect }>

// Bound each expensive relation-filtered read without truncating the eligible queue.
// Scan position is internal; the HTTP cursor remains the last displayed eligible ID.
export const findIngestionDrafts = async (
  db: Pick<Database, 'deal'>,
  input: IngestionDraftsQuery,
): Promise<DraftRow[]> => {
  const rows: DraftRow[] = []
  const take = input.limit + 1
  let cursor = input.cursor
  while (rows.length < take) {
    const candidates = await db.deal.findMany({
      where: {
        ...importedDealBaseScope,
        reviewStatus: input.status,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: candidateWindowSize,
      select: { id: true },
    })
    const last = candidates.at(-1)
    if (!last) break
    rows.push(
      ...(await db.deal.findMany({
        where: {
          ...importedDealScope,
          reviewStatus: input.status,
          id: { in: candidates.map((row) => row.id) },
        },
        orderBy: { id: 'asc' },
        take: take - rows.length,
        select: ingestionDraftSelect,
      })),
    )
    cursor = last.id
    if (candidates.length < candidateWindowSize) break
  }
  return rows
}
