import type { AuthenticatedActor } from '@api/modules/account/security-access'
import { invalidateReview, mutateAdminDeal, requireEditable } from '@api/modules/deals/admin-write'
import { DomainError } from '@api/modules/domain-error'
import type { Database } from '@api/modules/platform-admin/transaction'
import {
  type AdminDealContentRequest,
  adminDealContentRequestSchema,
} from '@broke-oclock/contracts/admin-deals'
export const correctAdminDealContent = (
  db: Database,
  actor: AuthenticatedActor,
  id: string,
  raw: AdminDealContentRequest,
) => {
  const input = adminDealContentRequestSchema.parse(raw)
  return mutateAdminDeal(db, actor, id, input, async (_tx, deal) => {
    requireEditable(deal)
    const changes = {
      ...input.changes,
      ...('validFrom' in input.changes
        ? { validFrom: input.changes.validFrom ? new Date(input.changes.validFrom) : null }
        : {}),
      ...('validUntil' in input.changes
        ? { validUntil: input.changes.validUntil ? new Date(input.changes.validUntil) : null }
        : {}),
    }
    const fields = Object.keys(changes) as (keyof typeof changes)[]
    if (!fields.some((key) => JSON.stringify(deal[key]) !== JSON.stringify(changes[key])))
      throw new DomainError('BAD_REQUEST', 'Correction has no changes')
    return {
      data: { ...changes, ...invalidateReview, contentVersion: deal.contentVersion + 1 },
      action: 'DEAL_UPDATED',
      changedFields: fields,
    }
  })
}
