import { type AuthenticatedActor, activeAccount } from '@api/modules/account/security-access'
import { DomainError } from '@api/modules/domain-error'
import { syncRoleAdminEmail } from '@api/modules/platform-admin/admin-emails'
import { invalidatePendingRequests } from '@api/modules/platform-admin/invalidation'
import {
  accessTransaction,
  checkVersion,
  conflict,
  currentUser,
  type Database,
  requireRecentAdminWrite,
} from '@api/modules/platform-admin/transaction'
import { activeGrant } from '@api/modules/platform-admin/venues'

export const changeRole = (
  db: Database,
  actorRef: AuthenticatedActor,
  input: {
    userId: string
    expectedVersion: number
    role: 'USER' | 'MERCHANT' | 'MODERATOR' | 'ADMIN'
    note: string
    confirmed: true
  },
) =>
  accessTransaction(db, async (tx) => {
    const actorId = actorRef.userId
    const actor = await requireRecentAdminWrite(tx, actorRef)
    if (input.confirmed !== true) throw new DomainError('BAD_REQUEST')
    if (input.userId === actorId) throw new DomainError('FORBIDDEN', 'Cannot change your own role')
    const target = await currentUser(tx, input.userId)
    checkVersion(target.platformVersion, input.expectedVersion)
    if (target.role === input.role) throw conflict()
    if (
      target.role === 'ADMIN' &&
      !target.suspendedAt &&
      (await tx.user.count({ where: { role: 'ADMIN', ...activeAccount } })) <= 1
    )
      throw new DomainError('PRECONDITION_FAILED', 'At least one administrator must remain')
    await syncRoleAdminEmail(tx, target, input.role, actorId, input.note)
    await invalidatePendingRequests(
      tx,
      actor,
      target.id,
      'Permission context changed; submit a fresh request',
    )
    if (target.role === 'MERCHANT') {
      const grants = await tx.stallGrant.findMany({ where: { userId: target.id, ...activeGrant } })
      for (const grant of grants) {
        await tx.stallGrant.update({
          where: { id: grant.id },
          data: { revokedAt: new Date(), version: { increment: 1 } },
        })
        await tx.platformAudit.create({
          data: {
            actorId,
            actorName: actor.name,
            action: 'STALL_REVOKED',
            targetUserId: target.id,
            venueId: grant.venueId,
            note: input.note,
            roleBefore: null,
            roleAfter: null,
          },
        })
      }
    }
    const version = (target.platformVersion ?? 0) + 1
    await tx.user.update({
      where: { id: target.id },
      data: { role: input.role, platformVersion: version },
    })
    await tx.platformAudit.create({
      data: {
        actorId,
        actorName: actor.name,
        action: 'ROLE_CHANGED',
        targetUserId: target.id,
        venueId: null,
        note: input.note,
        roleBefore: target.role,
        roleAfter: input.role,
      },
    })
    return { id: target.id, version }
  })
