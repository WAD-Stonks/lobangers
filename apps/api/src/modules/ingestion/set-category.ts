import type { AuthenticatedActor } from '@api/modules/account/security-access'
import { DomainError } from '@api/modules/domain-error'
import { fenceDraftEvidence } from '@api/modules/ingestion/draft-evidence'
import { importedDealScope } from '@api/modules/ingestion/review-policy'
import { appendAdminAudit } from '@api/modules/platform-admin/audit'
import { legacyVersionWhere, normalizeVersion } from '@api/modules/platform-admin/operation-version'
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
  actor: AuthenticatedActor,
  dealId: string,
  input: IngestionCategoryRequest,
  now: Date,
) =>
  accessTransaction(db, async (tx) => {
    const admin = await requireCurrentAdmin(tx, actor)
    const expectedOperationVersion = input.expectedOperationVersion ?? 0
    const deal = await tx.deal.findFirst({
      where: { ...importedDealScope, id: dealId },
      include: { sources: { include: { importedPost: true } } },
    })
    if (!deal) throw new DomainError('NOT_FOUND')
    if (
      normalizeVersion(deal.operationVersion) !== expectedOperationVersion ||
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
        AND: [
          legacyVersionWhere('operationVersion', expectedOperationVersion),
          { OR: [{ publishedAt: null }, { publishedAt: { isSet: false } }] },
        ],
      },
      data: {
        operationVersion: expectedOperationVersion + 1,
        category: input.category,
        contentVersion: { increment: 1 },
        scopeConfirmation: { unset: true },
        reviewedVersion: null,
        reviewedById: null,
        reviewedAt: null,
        reviewNote: null,
        publishedAt: null,
      },
    })
    if (changed.count !== 1) throw new DomainError('CONFLICT', 'Draft changed or already reviewed')
    await appendAdminAudit(tx, admin, {
      action: 'DEAL_UPDATED',
      subjectType: 'DEAL',
      subjectId: deal.id,
      note: 'Correct imported draft category',
      details: {
        operationVersionBefore: expectedOperationVersion,
        operationVersionAfter: expectedOperationVersion + 1,
        contentVersionBefore: deal.contentVersion,
        contentVersionAfter: deal.contentVersion + 1,
        changedFields: ['category'],
      },
    })
    return {
      id: deal.id,
      operationVersion: expectedOperationVersion + 1,
      contentVersion: deal.contentVersion + 1,
      reviewStatus: 'PENDING' as const,
      category: input.category,
    }
  })
