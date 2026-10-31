import { DomainError } from '@api/modules/domain-error'
import type { AccessTransaction } from '@api/modules/platform-admin/transaction'
import {
  type AdminAuditAction,
  type AdminAuditDetails,
  type AdminSubjectType,
  adminAuditActionSchema,
  adminAuditDetailsSchema,
  adminObjectIdSchema,
  adminSubjectTypeSchema,
} from '@broke-oclock/contracts/admin-common'
import { z } from 'zod'

export type AdminAuditInput = {
  action: AdminAuditAction
  subjectType: AdminSubjectType
  subjectId: string
  note: string
  targetUserId?: string | null
  venueId?: string | null
  details?: AdminAuditDetails
}
const auditInputSchema = z.strictObject({
  action: adminAuditActionSchema,
  subjectType: adminSubjectTypeSchema,
  subjectId: adminObjectIdSchema,
  // Internal append preserves the legacy ingestion review's full 1000-character note.
  // Public/new/security write schemas continue to enforce adminNoteSchema's 500 limit.
  note: z.string().trim().min(1).max(1000),
  targetUserId: adminObjectIdSchema.nullish(),
  venueId: adminObjectIdSchema.nullish(),
  details: adminAuditDetailsSchema.optional(),
})

// Caller supplies the actor returned by its authoritative in-transaction access
// check. Never call with browser identity or outside the protected write's tx.
export const appendAdminAudit = async (
  tx: AccessTransaction,
  actor: { id: string; name: string },
  input: AdminAuditInput,
): Promise<void> => {
  const parsed = auditInputSchema.safeParse(input)
  if (!parsed.success || !adminObjectIdSchema.safeParse(actor.id).success)
    throw new DomainError('BAD_REQUEST', 'Invalid administrator audit facts')
  const value = parsed.data
  await tx.platformAudit.create({
    data: {
      actorId: actor.id,
      actorName: actor.name,
      action: value.action,
      subjectType: value.subjectType,
      subjectId: value.subjectId,
      targetUserId:
        value.targetUserId === undefined
          ? value.subjectType === 'USER'
            ? value.subjectId
            : null
          : value.targetUserId,
      venueId: value.venueId ?? null,
      note: value.note,
      roleBefore: null,
      roleAfter: null,
      detailsJson: value.details ?? null,
    },
  })
}
