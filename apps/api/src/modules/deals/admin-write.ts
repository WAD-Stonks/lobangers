import { type AuthenticatedActor, requireCurrentAdmin } from '@api/modules/account/security-access'
import { DomainError } from '@api/modules/domain-error'
import { type AdminAuditInput, appendAdminAudit } from '@api/modules/platform-admin/audit'
import { legacyVersionWhere, normalizeVersion } from '@api/modules/platform-admin/operation-version'
import {
  type AccessTransaction,
  accessTransaction,
  type Database,
} from '@api/modules/platform-admin/transaction'
import type { adminDealWriteEnvelopeSchema } from '@broke-oclock/contracts/admin-deals'
import type { z } from 'zod'
export const loadAdminDeal = (tx: Pick<Database, 'deal'>, id: string) =>
  tx.deal.findUnique({
    where: { id },
    include: {
      venues: { include: { venue: true } },
      sources: { include: { importedPost: true, images: { include: { image: true } } } },
      images: true,
      submittedBy: { select: { id: true } },
    },
  })
export type AdminDealRecord = NonNullable<Awaited<ReturnType<typeof loadAdminDeal>>>
export type WriteEnvelope = z.infer<typeof adminDealWriteEnvelopeSchema>
export const invalidateReview = {
  reviewStatus: 'PENDING' as const,
  reviewedVersion: null,
  reviewedById: null,
  reviewedAt: null,
  reviewNote: null,
  publishedAt: null,
  scopeConfirmation: null,
}
export const requireEditable = (deal: AdminDealRecord) => {
  if (!['PENDING', 'APPROVED'].includes(deal.reviewStatus))
    throw new DomainError('PRECONDITION_FAILED', 'Reopen this deal before correcting it')
}
export const mutateAdminDeal = async (
  db: Database,
  actor: AuthenticatedActor,
  id: string,
  input: WriteEnvelope,
  work: (
    tx: AccessTransaction,
    deal: AdminDealRecord,
    admin: { id: string; name: string },
  ) => Promise<{
    data: Parameters<AccessTransaction['deal']['updateMany']>[0]['data']
    action: AdminAuditInput['action']
    changedFields?: NonNullable<AdminAuditInput['details']>['changedFields']
    evidenceIds?: string[]
  }>,
) =>
  accessTransaction(db, async (tx) => {
    const admin = await requireCurrentAdmin(tx, actor)
    const deal = await loadAdminDeal(tx, id)
    if (!deal) throw new DomainError('NOT_FOUND')
    if (
      deal.contentVersion !== input.expectedContentVersion ||
      normalizeVersion(deal.operationVersion) !== input.expectedOperationVersion
    )
      throw new DomainError('CONFLICT', 'Deal changed; refresh this exact deal')
    if (deal.deletedAt)
      throw new DomainError('PRECONDITION_FAILED', 'Deleted deals are investigation only')
    const result = await work(tx, deal, admin)
    const changed = await tx.deal.updateMany({
      where: {
        id,
        contentVersion: input.expectedContentVersion,
        reviewStatus: deal.reviewStatus,
        ...legacyVersionWhere('operationVersion', input.expectedOperationVersion),
      },
      data: { ...result.data, operationVersion: input.expectedOperationVersion + 1 },
    })
    if (changed.count !== 1) throw new DomainError('CONFLICT')
    await appendAdminAudit(tx, admin, {
      action: result.action,
      subjectType: 'DEAL',
      subjectId: id,
      note: input.note,
      details: {
        operationVersionBefore: input.expectedOperationVersion,
        operationVersionAfter: input.expectedOperationVersion + 1,
        contentVersionBefore: input.expectedContentVersion,
        contentVersionAfter:
          typeof result.data.contentVersion === 'number'
            ? result.data.contentVersion
            : input.expectedContentVersion,
        previousStatus: deal.reviewStatus,
        newStatus:
          typeof result.data.reviewStatus === 'string'
            ? result.data.reviewStatus
            : deal.reviewStatus,
        changedFields: result.changedFields,
        evidenceIds: result.evidenceIds,
      },
    })
    const updated = await loadAdminDeal(tx, id)
    if (!updated) throw new DomainError('NOT_FOUND')
    return updated
  })
