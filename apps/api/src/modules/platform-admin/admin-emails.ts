import {
  activeAccount,
  authGeneration,
  isRecentSignIn,
  requireActiveSessionWrite,
} from '@api/modules/account/security-access'
import { DomainError } from '@api/modules/domain-error'
import {
  type AccessTransaction,
  accessTransaction,
  checkVersion,
  conflict,
  type Database,
} from '@api/modules/platform-admin/transaction'
import type { VerifiedAuthenticationEvent } from '@broke-oclock/auth/server'
import { z } from 'zod'

export const canonicalAdminEmail = (input: string): string => {
  const result = z.email().max(254).safeParse(input.trim().toLowerCase())
  if (!result.success) throw new DomainError('BAD_REQUEST', 'A valid email is required')
  return result.data
}

// Refuse legacy case collisions, never pick an arbitrary owner or normalize aliases.
const uniqueIdentity = async (db: Pick<Database, 'user'>, email: string) => {
  const users = await db.user.findMany({
    where: { email: { equals: email, mode: 'insensitive' } },
    take: 2,
  })
  if (users.length > 1) throw new DomainError('PRECONDITION_FAILED', 'Ambiguous email identity')
  return users[0] ?? null
}

type OperatorAction = 'preapprove' | 'revoke'
const operatorText = (value: string, max: number) => {
  const result = z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (text) => ![...text].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127),
    )
    .safeParse(value)
  if (!result.success)
    throw new DomainError('BAD_REQUEST', 'Bounded operator label and reason are required')
  return result.data
}
export const inspectAdminEmail = async (
  db: Pick<Database, 'user' | 'adminEmail'>,
  input: string,
) => {
  const email = canonicalAdminEmail(input)
  const user = await uniqueIdentity(db, email)
  const approval = await db.adminEmail.findUnique({ where: { email } })
  return {
    email,
    approval,
    warning: user?.suspendedAt
      ? 'Suspended account: no grant until reinstatement and new successful native authentication'
      : null,
    user: user
      ? {
          id: user.id,
          role: user.role,
          emailVerified: user.emailVerified,
          suspended: Boolean(user.suspendedAt),
        }
      : null,
  }
}
export const adminEmailHistory = async (db: Database, input: string, limit = 20) => {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new DomainError('BAD_REQUEST')
  const inspected = await inspectAdminEmail(db, input)
  const events = inspected.approval
    ? await db.adminEmailEvent.findMany({
        where: { approvalId: inspected.approval.id },
        orderBy: { id: 'desc' },
        take: limit,
      })
    : []
  return { ...inspected, events }
}
const checkOperatorTarget = (
  state: Awaited<ReturnType<typeof inspectAdminEmail>>,
  action: OperatorAction,
) => {
  if (
    (action === 'preapprove' && ['MERCHANT', 'MODERATOR'].includes(state.user?.role ?? '')) ||
    (action === 'revoke' && state.user?.role === 'ADMIN')
  )
    throw new DomainError(
      'PRECONDITION_FAILED',
      'Use the guarded Accounts UI for an explicit role change',
    )
}
export const operateAdminEmail = async (
  db: Database,
  input: {
    action: OperatorAction
    email: string
    apply: boolean
    expectedVersion?: number
    operatorLabel?: string
    reason?: string
  },
) => {
  const email = canonicalAdminEmail(input.email)
  if (!['preapprove', 'revoke'].includes(input.action)) throw new DomainError('BAD_REQUEST')
  if (!input.apply) {
    const state = await inspectAdminEmail(db, email)
    checkOperatorTarget(state, input.action)
    return {
      ...state,
      dryRun: true,
      changed: false,
      wouldChange: Boolean(state.approval?.active) !== (input.action === 'preapprove'),
    }
  }
  const expectedVersion = input.expectedVersion
  if (
    expectedVersion === undefined ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 0
  )
    throw new DomainError('BAD_REQUEST', 'Expected approval version is required')
  const operatorLabel = operatorText(input.operatorLabel ?? '', 80)
  const reason = operatorText(input.reason ?? '', 500)
  return accessTransaction(db, async (tx) => {
    const state = await inspectAdminEmail(tx, email)
    checkOperatorTarget(state, input.action)
    checkVersion(state.approval?.version ?? 0, expectedVersion)
    const active = input.action === 'preapprove'
    if ((!state.approval && !active) || state.approval?.active === active)
      return { ...state, dryRun: false, changed: false }
    const approval = state.approval
      ? await tx.adminEmail.update({
          where: { id: state.approval.id },
          data: { active, version: { increment: 1 } },
        })
      : await tx.adminEmail.create({ data: { email, active: true, version: 1 } })
    await tx.adminEmailEvent.create({
      data: {
        approvalId: approval.id,
        approvalVersion: approval.version,
        source: 'OPERATOR',
        action: active ? 'APPROVED' : 'REVOKED',
        actorUserId: null,
        operatorLabel,
        reason,
        targetUserId: state.user?.id ?? null,
        roleBefore: state.user?.role ?? null,
        roleAfter: state.user?.role ?? null,
        invalidatedRequestCount: null,
      },
    })
    return { ...state, approval, dryRun: false, changed: true }
  })
}

export const syncRoleAdminEmail = async (
  tx: AccessTransaction,
  target: {
    id: string
    email: string
    emailVerified: boolean
    role: 'USER' | 'MERCHANT' | 'MODERATOR' | 'ADMIN'
  },
  role: typeof target.role,
  actorUserId: string,
  reason: string,
) => {
  const email = canonicalAdminEmail(target.email)
  if ((await uniqueIdentity(tx, email))?.id !== target.id) throw conflict()
  if (role === 'ADMIN' && !target.emailVerified)
    throw new DomainError('PRECONDITION_FAILED', 'Verify the target email before assigning ADMIN')
  const existing = await tx.adminEmail.findUnique({ where: { email } })
  const active = role === 'ADMIN'
  if ((!existing && !active) || existing?.active === active) return
  const approval = existing
    ? await tx.adminEmail.update({
        where: { id: existing.id },
        data: { active, version: { increment: 1 } },
      })
    : await tx.adminEmail.create({ data: { email, active: true, version: 1 } })
  await tx.adminEmailEvent.create({
    data: {
      approvalId: approval.id,
      approvalVersion: approval.version,
      action: active ? 'APPROVED' : 'REVOKED',
      source: 'ADMIN_ROLE_CHANGE',
      actorUserId,
      targetUserId: target.id,
      reason,
      roleBefore: target.role,
      roleAfter: role,
      operatorLabel: null,
      invalidatedRequestCount: null,
    },
  })
}

type VerificationIdentity = Pick<
  VerifiedAuthenticationEvent,
  'userId' | 'email' | 'authVersion' | 'platformVersion'
>

// The caller is the native ownership-proof callback, never a public request-body dispatcher.
// Commit retirement before native emailVerified=true; failure must abort that transition.
export const prepareAdminEmailVerification = (db: Database, identity: VerificationIdentity) =>
  accessTransaction(db, async (tx): Promise<VerificationIdentity | null> => {
    const email = canonicalAdminEmail(identity.email)
    if (identity.email !== email) throw conflict()
    const user = await tx.user.findUnique({ where: { id: identity.userId } })
    if (!user || user.email !== email || user.role !== 'USER') return null
    if (user.emailVerified) return null
    checkVersion(user.platformVersion, identity.platformVersion)
    const version = user.authVersion ?? 0
    if (
      version !== identity.authVersion ||
      !Number.isSafeInteger(version) ||
      version < 0 ||
      version >= 2_147_483_647
    )
      throw conflict()
    if ((await uniqueIdentity(tx, email))?.id !== user.id) throw conflict()
    if (!(await tx.adminEmail.findUnique({ where: { email } }))?.active) return null
    if (user.suspendedAt) throw new DomainError('UNAUTHORIZED')
    const changed = await tx.user.updateMany({
      where: {
        id: user.id,
        email,
        emailVerified: false,
        role: 'USER',
        updatedAt: user.updatedAt,
        AND: [activeAccount, authGeneration(version)],
      },
      data: {
        authVersion: version + 1,
        updatedAt: new Date(Math.max(Date.now(), user.updatedAt.getTime() + 1)),
      },
    })
    if (changed.count !== 1) throw conflict()
    await tx.account.deleteMany({ where: { userId: user.id } })
    await tx.session.deleteMany({ where: { userId: user.id } })
    return { ...identity, authVersion: version + 1 }
  })

export const provisionVerifiedAdminEmail = (db: Database, event: VerifiedAuthenticationEvent) =>
  accessTransaction(db, async (tx) => {
    const email = canonicalAdminEmail(event.email)
    // Native identity is already canonical; do not repair malformed internal evidence.
    if (event.email !== email) throw conflict()
    const active =
      event.type === 'primary-session'
        ? await requireActiveSessionWrite(tx, { userId: event.userId, sessionId: event.sessionId })
        : null
    const user = active?.user ?? (await tx.user.findUnique({ where: { id: event.userId } }))
    if (!user || user.suspendedAt || !user.emailVerified || user.email !== email) return null
    checkVersion(user.platformVersion, event.platformVersion)
    if ((user.authVersion ?? 0) !== event.authVersion) throw conflict()
    if (active && !isRecentSignIn(active.session)) throw conflict()
    if ((await uniqueIdentity(tx, email))?.id !== user.id) throw conflict()
    const approval = await tx.adminEmail.findUnique({ where: { email } })
    if (!approval?.active || user.role !== 'USER') return null
    if (!active) {
      const touched = await tx.user.updateMany({
        where: { id: user.id, updatedAt: user.updatedAt, AND: [activeAccount] },
        data: { updatedAt: new Date(Math.max(Date.now(), user.updatedAt.getTime() + 1)) },
      })
      if (touched.count !== 1) throw conflict()
    }
    const invalidated = await tx.merchantAccessRequest.updateMany({
      where: { userId: user.id, status: 'PENDING' },
      data: {
        status: 'REJECTED',
        version: { increment: 1 },
        reviewedById: null,
        reviewedAt: new Date(),
        reviewNote:
          'Approved admin-email policy changed permission context; submit a fresh request',
      },
    })
    await tx.user.update({
      where: { id: user.id },
      data: { role: 'ADMIN', platformVersion: (user.platformVersion ?? 0) + 1 },
    })
    await tx.adminEmailEvent.create({
      data: {
        approvalId: approval.id,
        approvalVersion: approval.version,
        action: 'PROVISIONED',
        source: 'NATIVE_AUTH',
        actorUserId: null,
        targetUserId: user.id,
        operatorLabel: null,
        reason: 'Verified owner claimed approved admin-email policy',
        roleBefore: 'USER',
        roleAfter: 'ADMIN',
        invalidatedRequestCount: invalidated.count,
      },
    })
    return { userId: user.id, role: 'ADMIN' as const }
  })
