import {
  type AuthenticatedActor,
  activeAccount,
  requireRecentAdminWrite,
} from '@api/modules/account/security-access'
import { DomainError } from '@api/modules/domain-error'
import { appendAdminAudit } from '@api/modules/platform-admin/audit'
import {
  accessTransaction,
  checkVersion,
  conflict,
  currentUser,
  type Database,
} from '@api/modules/platform-admin/transaction'
import {
  type AccountSecurityMutationBody,
  accountSecurityMutationBodySchema,
  accountSessionParamsSchema,
  platformAccountParamsSchema,
} from '@broke-oclock/contracts/platform-security'

type Input = AccountSecurityMutationBody & { userId: string }
const securityMutation = (
  db: Database,
  actorRef: AuthenticatedActor,
  input: Input & { sessionId?: string },
  operation: 'suspend' | 'reinstate' | 'one' | 'all',
) => {
  const { userId, sessionId, ...body } = input
  const parsed = accountSecurityMutationBodySchema.safeParse(body)
  if (
    !parsed.success ||
    !platformAccountParamsSchema.safeParse({ userId }).success ||
    (operation === 'one' && !accountSessionParamsSchema.safeParse({ userId, sessionId }).success)
  )
    throw new DomainError('BAD_REQUEST')
  return accessTransaction(db, async (tx) => {
    const actor = await requireRecentAdminWrite(tx, actorRef)
    if (userId === actor.id) throw new DomainError('FORBIDDEN', 'Cannot target your own account')
    const target = await currentUser(tx, userId)
    checkVersion(target.platformVersion, parsed.data.expectedVersion)
    if (
      (operation === 'suspend' && target.suspendedAt) ||
      (operation === 'reinstate' && !target.suspendedAt)
    )
      throw conflict()
    if (
      operation === 'suspend' &&
      target.role === 'ADMIN' &&
      (await tx.user.count({ where: { role: 'ADMIN', ...activeAccount } })) <= 1
    )
      throw new DomainError('PRECONDITION_FAILED', 'At least one administrator must remain')
    // Account + shared platform fences order all target changes. The scoped deletion
    // never touches another user's session; a nonexistent/repeated single ID is stale.
    const deleted = await tx.session.deleteMany({
      where: { userId, ...(operation === 'one' ? { id: sessionId } : {}) },
    })
    if (operation === 'one' && deleted.count !== 1) throw conflict()
    const version = (target.platformVersion ?? 0) + 1
    await tx.user.update({
      where: { id: userId },
      data: {
        platformVersion: version,
        ...(operation !== 'one' ? { authVersion: (target.authVersion ?? 0) + 1 } : {}),
        ...(operation === 'suspend'
          ? { suspendedAt: new Date() }
          : operation === 'reinstate'
            ? { suspendedAt: null }
            : {}),
      },
    })
    await appendAdminAudit(tx, actor, {
      action:
        operation === 'suspend'
          ? 'ACCOUNT_SUSPENDED'
          : operation === 'reinstate'
            ? 'ACCOUNT_REINSTATED'
            : operation === 'one'
              ? 'SESSION_REVOKED'
              : 'SESSIONS_REVOKED',
      subjectType: 'USER',
      subjectId: userId,
      note: parsed.data.note,
      details: {
        revokedSessionCount: deleted.count,
        ...(operation === 'one' ? { sessionId } : {}),
        ...(['suspend', 'reinstate'].includes(operation)
          ? {
              previousStatus: target.suspendedAt ? ('SUSPENDED' as const) : ('ACTIVE' as const),
              newStatus: operation === 'suspend' ? ('SUSPENDED' as const) : ('ACTIVE' as const),
            }
          : {}),
      },
    })
    return { id: userId, version, affectedSessionCount: deleted.count }
  })
}
export const suspendAccount = (db: Database, actor: AuthenticatedActor, input: Input) =>
  securityMutation(db, actor, input, 'suspend')
export const reinstateAccount = (db: Database, actor: AuthenticatedActor, input: Input) =>
  securityMutation(db, actor, input, 'reinstate')
export const revokeAccountSession = (
  db: Database,
  actor: AuthenticatedActor,
  input: Input & { sessionId: string },
) => securityMutation(db, actor, input, 'one')
export const revokeAccountSessions = (db: Database, actor: AuthenticatedActor, input: Input) =>
  securityMutation(db, actor, input, 'all')
