import { DomainError } from '@api/modules/domain-error'
import { fenceDraftEvidence } from '@api/modules/ingestion/draft-evidence'
import { importedDealScope } from '@api/modules/ingestion/review-policy'
import {
  accessTransaction,
  type Database,
  requireCurrentAdmin,
} from '@api/modules/platform-admin/transaction'
import type { IngestionCategoryRequest } from '@broke-oclock/contracts/ingestion'

// Corrects the importer's guessed category on a pending draft. Like an outlet change, this is
// new content: the version moves on and any earlier review decision is cleared.
export const setDraftCategory = async (
  db: Database,
  actorId: string,
  dealId: string,
  input: IngestionCategoryRequest,
  now: Date,
) =>
  accessTransaction(db, async (tx) => {
    await requireCurrentAdmin(tx, actorId)
    const deal = await tx.deal.findFirst({
      where: { ...importedDealScope, id: dealId },
      include: { sources: { include: { importedPost: true } } },
    })
    if (!deal) throw new DomainError('NOT_FOUND')
    if (
      deal.reviewStatus !== 'PENDING' ||
      deal.contentVersion !== input.expectedContentVersion ||
      deal.publishedAt
    )
      throw new DomainError('CONFLICT', 'Draft changed or already reviewed')
    if (deal.category === input.category)
      throw new DomainError('PRECONDITION_FAILED', 'Category is unchanged')
    await fenceDraftEvidence(tx, deal.sources, now, true)
    const changed = await tx.deal.updateMany({
      where: {
        ...importedDealScope,
        id: deal.id,
        contentVersion: input.expectedContentVersion,
        reviewStatus: 'PENDING',
        OR: [{ publishedAt: null }, { publishedAt: { isSet: false } }],
      },
      data: {
        category: input.category,
        contentVersion: { increment: 1 },
        reviewedVersion: null,
        reviewedById: null,
        reviewedAt: null,
        reviewNote: null,
        publishedAt: null,
      },
    })
    if (changed.count !== 1) throw new DomainError('CONFLICT', 'Draft changed or already reviewed')
    return {
      id: deal.id,
      contentVersion: deal.contentVersion + 1,
      reviewStatus: 'PENDING' as const,
      category: input.category,
    }
  })
