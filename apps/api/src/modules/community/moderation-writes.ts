import type { AuthenticatedActor } from '@api/modules/account/security-access'
import { commentFor, reportFor } from '@api/modules/community/moderation-data'
import { DomainError } from '@api/modules/domain-error'
import { appendAdminAudit } from '@api/modules/platform-admin/audit'
import { legacyVersionWhere } from '@api/modules/platform-admin/operation-version'
import {
  accessTransaction,
  conflict,
  type Database,
  requireCurrentAdmin,
} from '@api/modules/platform-admin/transaction'
import {
  type ModerationResolution,
  type ModerationTargetType,
  type ModerationVisibility,
  moderationResolveSchema,
  moderationVisibilitySchema,
} from '@broke-oclock/contracts/admin-moderation'
export const resolveModerationReport = (
  db: Database,
  actor: AuthenticatedActor,
  type: ModerationTargetType,
  id: string,
  input: ModerationResolution,
) =>
  accessTransaction(db, async (tx) => {
    const parsed = moderationResolveSchema.safeParse(input)
    if (!parsed.success) throw new DomainError('BAD_REQUEST')
    const value = parsed.data
    const admin = await requireCurrentAdmin(tx, actor)
    await reportFor(tx, type, id)
    const where = {
      id,
      status: 'OPEN' as const,
      ...legacyVersionWhere('moderationVersion', value.expectedVersion),
    }
    const data = {
      status: value.decision,
      resolution: value.resolution,
      resolvedById: admin.id,
      resolvedAt: new Date(),
      moderationVersion: value.expectedVersion + 1,
    }
    const result =
      type === 'DEAL'
        ? await tx.dealReport.updateMany({ where, data })
        : await tx.commentReport.updateMany({ where, data })
    if (result.count !== 1) throw conflict()
    await appendAdminAudit(tx, admin, {
      action:
        type === 'DEAL'
          ? value.decision === 'RESOLVED'
            ? 'DEAL_REPORT_RESOLVED'
            : 'DEAL_REPORT_DISMISSED'
          : value.decision === 'RESOLVED'
            ? 'COMMENT_REPORT_RESOLVED'
            : 'COMMENT_REPORT_DISMISSED',
      subjectType: type === 'DEAL' ? 'DEAL_REPORT' : 'COMMENT_REPORT',
      subjectId: id,
      note: value.resolution,
      details: {
        moderationVersionBefore: value.expectedVersion,
        moderationVersionAfter: value.expectedVersion + 1,
        previousStatus: 'OPEN',
        newStatus: value.decision,
        changedFields: ['status', 'resolution'],
      },
    })
    return reportFor(tx, type, id)
  })

export const setModerationVisibility = (
  db: Database,
  actor: AuthenticatedActor,
  id: string,
  input: ModerationVisibility,
) =>
  accessTransaction(db, async (tx) => {
    const parsed = moderationVisibilitySchema.safeParse(input)
    if (!parsed.success) throw new DomainError('BAD_REQUEST')
    const value = parsed.data
    const admin = await requireCurrentAdmin(tx, actor)
    const current = await commentFor(tx, id)
    if (
      current.moderationVersion !== value.expectedVersion ||
      current.deletedAt ||
      (value.visibility === 'HIDDEN') === !!current.hiddenAt
    )
      throw conflict()
    const parent = await tx.deal.findUnique({
      where: { id: current.dealId },
      select: { id: true, updatedAt: true },
    })
    if (!parent) throw new DomainError('NOT_FOUND')
    // Same meaningful parent write as lockCommunityWrite, without public admission.
    await tx.deal.update({
      where: { id: parent.id },
      data: { updatedAt: new Date(Math.max(Date.now(), parent.updatedAt.getTime() + 1)) },
    })
    const claim = await tx.comment.updateMany({
      where: {
        id,
        ...legacyVersionWhere('moderationVersion', value.expectedVersion),
        AND: [{ OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] }],
      },
      data: {
        hiddenAt: value.visibility === 'HIDDEN' ? new Date() : null,
        moderationVersion: value.expectedVersion + 1,
      },
    })
    if (claim.count !== 1) throw conflict()
    await appendAdminAudit(tx, admin, {
      action: value.visibility === 'HIDDEN' ? 'COMMENT_HIDDEN' : 'COMMENT_RESTORED',
      subjectType: 'COMMENT',
      subjectId: id,
      note: value.note,
      details: {
        moderationVersionBefore: value.expectedVersion,
        moderationVersionAfter: value.expectedVersion + 1,
        changedFields: ['hiddenAt'],
      },
    })
    return commentFor(tx, id)
  })
