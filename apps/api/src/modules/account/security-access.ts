import { DomainError } from '@api/modules/domain-error'
import type { AccessTransaction, Database } from '@api/modules/platform-admin/transaction'

export type AuthenticatedActor = { userId: string; sessionId: string }
type Reader = Pick<Database | AccessTransaction, 'user' | 'session'>
export const activeAccount = { OR: [{ suspendedAt: null }, { suspendedAt: { isSet: false } }] }
export const authGeneration = (version: number | null | undefined) =>
  version == null || version === 0
    ? { OR: [{ authVersion: 0 }, { authVersion: null }, { authVersion: { isSet: false } }] }
    : { authVersion: version }
const unauthorized = () => new DomainError('UNAUTHORIZED')
const objectId = /^[a-f0-9]{24}$/

// Never trust cached native-session identity, role, generation or freshness fields.
// A legacy missing/null generation is zero; missing loginAt is NOT fresh login.
export const readActiveSession = async (
  db: Reader,
  actor: AuthenticatedActor,
  now = new Date(),
) => {
  if (
    !actor ||
    !objectId.test(actor.userId ?? '') ||
    !objectId.test(actor.sessionId ?? '') ||
    !Number.isFinite(now.getTime())
  )
    throw unauthorized()
  const session = await db.session.findUnique({
    where: { id: actor.sessionId },
    select: {
      id: true,
      userId: true,
      createdAt: true,
      updatedAt: true,
      expiresAt: true,
      loginAt: true,
      authVersion: true,
    },
  })
  if (!session || session.userId !== actor.userId || session.expiresAt <= now) throw unauthorized()
  const user = await db.user.findUnique({
    where: { id: actor.userId },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      role: true,
      platformVersion: true,
      updatedAt: true,
      suspendedAt: true,
      authVersion: true,
    },
  })
  if (!user || user.suspendedAt || (user.authVersion ?? 0) !== (session.authVersion ?? 0))
    throw unauthorized()
  return { user, session }
}

// Both conditional, meaningful writes must be inside the eventual mutation transaction.
// User touch conflicts with suspension/generation changes; Session touch conflicts with
// single-session revocation. Do not renew expiry or change primary-login origin here.
export const requireActiveSessionWrite = async (
  tx: AccessTransaction,
  actor: AuthenticatedActor,
  now = new Date(),
) => {
  const active = await readActiveSession(tx, actor, now)
  const user = await tx.user.updateMany({
    where: {
      id: actor.userId,
      updatedAt: active.user.updatedAt,
      AND: [activeAccount, authGeneration(active.user.authVersion)],
    },
    data: { updatedAt: new Date(Math.max(now.getTime(), active.user.updatedAt.getTime() + 1)) },
  })
  if (user.count !== 1) throw unauthorized()
  const session = await tx.session.updateMany({
    where: {
      id: actor.sessionId,
      userId: actor.userId,
      updatedAt: active.session.updatedAt,
      expiresAt: { gt: now },
      AND: [authGeneration(active.session.authVersion)],
    },
    data: { updatedAt: new Date(Math.max(now.getTime(), active.session.updatedAt.getTime() + 1)) },
  })
  if (session.count !== 1) throw unauthorized()
  return active
}
export const isRecentSignIn = (
  session: { loginAt?: Date | null; createdAt: Date },
  now = new Date(),
) => {
  const login = session.loginAt?.getTime()
  return (
    login !== undefined &&
    Number.isFinite(login) &&
    login === session.createdAt.getTime() &&
    Number.isFinite(now.getTime()) &&
    login <= now.getTime() &&
    now.getTime() - login <= 300_000
  )
}
export const requireCurrentAdmin = async (
  tx: AccessTransaction,
  actor: AuthenticatedActor,
  now = new Date(),
) => {
  const active = await requireActiveSessionWrite(tx, actor, now)
  if (active.user.role !== 'ADMIN') throw new DomainError('FORBIDDEN')
  return active.user
}
export const requireRecentAdminWrite = async (
  tx: AccessTransaction,
  actor: AuthenticatedActor,
  now = new Date(),
) => {
  const active = await requireActiveSessionWrite(tx, actor, now)
  if (active.user.role !== 'ADMIN') throw new DomainError('FORBIDDEN')
  if (!isRecentSignIn(active.session, now))
    throw new DomainError('PRECONDITION_FAILED', 'Fresh sign-in required')
  return active.user
}
