import type { AuthenticatedActor } from '@api/modules/account/security-access'
import {
  contentReady,
  currentScopeReceipt,
  fencePhysicalScope,
  physicalScope,
} from '@api/modules/deals/admin-policy'
import {
  invalidateReview,
  mutateAdminDeal,
  type WriteEnvelope,
} from '@api/modules/deals/admin-write'
import { DomainError } from '@api/modules/domain-error'
import { fenceDraftEvidence } from '@api/modules/ingestion/draft-evidence'
import { requireSelectedOutletAuthority } from '@api/modules/ingestion/review-policy'
import type { Database } from '@api/modules/platform-admin/transaction'
import {
  type AdminDealReviewRequest,
  adminDealReviewRequestSchema,
} from '@broke-oclock/contracts/admin-deals'
export const reviewAdminDeal = (
  db: Database,
  actor: AuthenticatedActor,
  id: string,
  raw: AdminDealReviewRequest,
) => {
  const input = adminDealReviewRequestSchema.parse(raw)
  return mutateAdminDeal(db, actor, id, input, async (tx, deal, admin) => {
    if (deal.reviewStatus !== 'PENDING')
      throw new DomainError('PRECONDITION_FAILED', 'A pending deal is required')
    const now = new Date()
    const approved = input.decision === 'APPROVE'
    const receipt = approved ? await currentScopeReceipt(tx, deal) : null
    if (approved && !contentReady(deal, now))
      throw new DomainError(
        'PRECONDITION_FAILED',
        'Clarify actual submitter, offer and validity or pinned source evidence',
      )
    if (approved && physicalScope(deal)) {
      if (!receipt)
        throw new DomainError(
          'PRECONDITION_FAILED',
          'Current administrator-reviewed source scope required',
        )
      if (deal.origin === 'IMPORTED') await requireSelectedOutletAuthority(tx, deal)
      await fencePhysicalScope(tx, deal)
    }
    if (deal.origin === 'IMPORTED')
      await fenceDraftEvidence(tx, deal.sources, now, approved && physicalScope(deal))
    return {
      data: {
        reviewStatus: approved ? 'APPROVED' : 'REJECTED',
        reviewedById: admin.id,
        reviewedAt: now,
        reviewedVersion: deal.contentVersion,
        reviewNote: input.note,
        publishedAt: approved && receipt ? now : null,
      },
      action: approved ? 'DEAL_APPROVED' : 'DEAL_REJECTED',
      changedFields: ['reviewStatus'],
    }
  })
}
export const unpublishAdminDeal = (
  db: Database,
  actor: AuthenticatedActor,
  id: string,
  input: WriteEnvelope,
) =>
  mutateAdminDeal(db, actor, id, input, async (_tx, deal) => {
    if (deal.reviewStatus !== 'APPROVED')
      throw new DomainError('PRECONDITION_FAILED', 'Only an approved deal can be unpublished')
    return {
      data: { reviewStatus: 'HIDDEN', publishedAt: null },
      action: 'DEAL_HIDDEN',
      changedFields: ['reviewStatus'],
    }
  })
export const reopenAdminDeal = (
  db: Database,
  actor: AuthenticatedActor,
  id: string,
  input: WriteEnvelope,
) =>
  mutateAdminDeal(db, actor, id, input, async (_tx, deal) => {
    if (
      !['HIDDEN', 'REJECTED'].includes(deal.reviewStatus) &&
      !(deal.reviewStatus === 'APPROVED' && !deal.publishedAt)
    )
      throw new DomainError(
        'PRECONDITION_FAILED',
        'Only hidden, rejected or approved-unpublished deals may reopen',
      )
    return {
      data: invalidateReview,
      action: 'DEAL_RESTORED',
      changedFields: ['reviewStatus', 'scopeConfirmation'],
    }
  })
