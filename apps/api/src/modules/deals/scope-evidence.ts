import type { AuthenticatedActor } from '@api/modules/account/security-access'
import { currentScopeReceipt, physicalScope, scopeTuple } from '@api/modules/deals/admin-policy'
import { mutateAdminDeal, requireEditable } from '@api/modules/deals/admin-write'
import { outletScopeHash } from '@api/modules/deals/outlet-eligibility'
import { DomainError } from '@api/modules/domain-error'
import { fenceDraftEvidence } from '@api/modules/ingestion/draft-evidence'
import type { Database } from '@api/modules/platform-admin/transaction'
import {
  type AdminDealScopeEvidenceRequest,
  adminDealScopeEvidenceRequestSchema,
} from '@broke-oclock/contracts/admin-deals'
export const recordAdminDealScopeEvidence = (
  db: Database,
  actor: AuthenticatedActor,
  id: string,
  raw: AdminDealScopeEvidenceRequest,
) => {
  const input = adminDealScopeEvidenceRequestSchema.parse(raw)
  return mutateAdminDeal(db, actor, id, input, async (tx, deal, admin) => {
    requireEditable(deal)
    if (deal.reviewStatus !== 'PENDING')
      throw new DomainError('PRECONDITION_FAILED', 'Reopen before confirming a new scope')
    const previous = await currentScopeReceipt(tx, deal)
    if (
      previous &&
      previous.reference === input.reference &&
      previous.statement === input.statement &&
      (previous.citationId ?? undefined) === input.citationId &&
      (previous.sourceContentHash ?? undefined) === input.sourceContentHash
    )
      throw new DomainError('BAD_REQUEST', 'Evidence has no changes')
    const now = new Date()
    let citation: (typeof deal.sources)[number] | undefined
    if (deal.origin === 'IMPORTED') {
      citation = deal.sources.find((source) => source.id === input.citationId)
      if (
        !citation ||
        citation.sourceContentHash !== input.sourceContentHash ||
        citation.sourceContentHash !== citation.importedPost.contentHash ||
        citation.importedPost.errorCode
      )
        throw new DomainError(
          'PRECONDITION_FAILED',
          'Exact current pinned citation and hash required',
        )
      await fenceDraftEvidence(tx, deal.sources, now, physicalScope(deal))
    } else if (!deal.submittedBy || input.citationId || input.sourceContentHash)
      throw new DomainError(
        'PRECONDITION_FAILED',
        'Submission evidence requires the real submitter, not fabricated imported citations',
      )
    const ids = deal.venues.map((v) => v.venueId)
    if (
      (deal.applicability === 'SELECTED_OUTLETS' && (!deal.merchantId || !ids.length)) ||
      (deal.applicability === 'ALL_MERCHANT_OUTLETS' && (!deal.merchantId || ids.length)) ||
      (!physicalScope(deal) && ids.length)
    )
      throw new DomainError(
        'PRECONDITION_FAILED',
        'Correct complete scope before recording evidence',
      )
    const basis =
      deal.applicability === 'SELECTED_OUTLETS'
        ? ('SOURCE_SELECTED' as const)
        : deal.applicability === 'ALL_MERCHANT_OUTLETS'
          ? ('SOURCE_ALL' as const)
          : ('SOURCE_NONSPATIAL' as const)
    const scopeHash = outletScopeHash(scopeTuple(deal))
    const evidence = await tx.adminEvidence.create({
      data: {
        actorId: admin.id,
        actorName: admin.name,
        subjectType: 'DEAL',
        subjectId: id,
        kind: 'SCOPE',
        contentVersion: deal.contentVersion,
        subjectHash: scopeHash,
        basis,
        reference: input.reference,
        statement: input.statement,
        citationId: citation?.id ?? null,
        sourceContentHash: citation?.sourceContentHash ?? null,
        sourceUrl: citation?.sourceUrl ?? input.reference,
        provider: 'ADMIN',
      },
    })
    return {
      data: {
        scopeConfirmation: {
          basis,
          contentVersion: deal.contentVersion,
          scopeHash,
          evidenceRef: `admin-evidence:${evidence.id}`,
          retainedVenueIds: [],
          sourceContentHash: citation?.sourceContentHash ?? null,
          sourceUrl: citation?.sourceUrl ?? input.reference,
          confirmedAt: now,
          reasonCode:
            deal.origin === 'IMPORTED' ? 'ADMIN_SOURCE_REVIEW' : 'ADMIN_SUBMISSION_REVIEW',
        },
      },
      action: 'DEAL_SCOPE_CONFIRMED',
      changedFields: ['scopeConfirmation'],
      evidenceIds: [evidence.id],
    }
  })
}
