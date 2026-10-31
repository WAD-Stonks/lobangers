import type { AppConfig } from '@api/config'
import {
  type AuthenticatedActor,
  authGeneration,
  isRecentSignIn,
  readActiveSession,
} from '@api/modules/account/security-access'
import { DomainError } from '@api/modules/domain-error'
import type { Database } from '@api/modules/platform-admin/transaction'
import { page } from '@api/rest/routers/platform-admin/validation'

export const readAccountSecurity = async (db: Database, userId: string, config: AppConfig) => {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, platformVersion: true, emailVerified: true, suspendedAt: true },
  })
  if (!user) throw new DomainError('NOT_FOUND', 'Account not found')
  // Credentials are queried only to derive booleans; no auth payload is projected.
  const accounts = await db.account.findMany({
    where: { userId },
    select: { providerId: true, password: true },
  })
  return {
    userId: user.id,
    version: user.platformVersion ?? 0,
    emailVerified: user.emailVerified,
    state: user.suspendedAt ? ('SUSPENDED' as const) : ('ACTIVE' as const),
    suspendedAt: user.suspendedAt?.toISOString() ?? null,
    methods: {
      passwordConfigured: accounts.some((a) => a.providerId === 'credential' && !!a.password),
      googleLinked: accounts.some((a) => a.providerId === 'google'),
      emailOtpAvailable: !!config.authProviders?.email,
    },
  }
}
export const readAccountSessions = async (
  db: Database,
  userId: string,
  query: { cursor?: string; limit: number },
  now = new Date(),
) => {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, platformVersion: true, suspendedAt: true, authVersion: true },
  })
  if (!user) throw new DomainError('NOT_FOUND', 'Account not found')
  if (user.suspendedAt)
    return { userId: user.id, version: user.platformVersion ?? 0, items: [], nextCursor: null }
  const rows = await db.session.findMany({
    where: {
      userId,
      expiresAt: { gt: now },
      ...(query.cursor ? { id: { gt: query.cursor } } : {}),
      AND: [authGeneration(user.authVersion)],
    },
    orderBy: { id: 'asc' },
    take: query.limit + 1,
    select: { id: true, createdAt: true, expiresAt: true, userAgent: true },
  })
  return {
    userId: user.id,
    version: user.platformVersion ?? 0,
    ...page(
      rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        deviceLabel: deviceLabel(row.userAgent),
      })),
      query.limit,
    ),
  }
}
// Never echo a hostile raw User-Agent, IP address or arbitrary session metadata.
const deviceLabel = (agent: string | null) => {
  if (!agent) return 'Unknown device'
  const browser = /Edg\//.test(agent)
    ? 'Edge'
    : /Firefox\//.test(agent)
      ? 'Firefox'
      : /Chrome\//.test(agent)
        ? 'Chrome'
        : /Safari\//.test(agent)
          ? 'Safari'
          : 'Browser'
  const device = /Android/.test(agent)
    ? 'Android'
    : /iPhone|iPad/.test(agent)
      ? 'iOS'
      : /Windows/.test(agent)
        ? 'Windows'
        : /Macintosh|Mac OS X/.test(agent)
          ? 'macOS'
          : /Linux/.test(agent)
            ? 'Linux'
            : null
  return device ? `${browser} on ${device}` : browser
}
export const readSecurityContext = async (
  db: Database,
  actor: AuthenticatedActor,
  now = new Date(),
) => {
  const active = await readActiveSession(db, actor, now)
  if (active.user.role !== 'ADMIN') throw new DomainError('FORBIDDEN')
  const recentSignIn = isRecentSignIn(active.session, now)
  return {
    actorUserId: active.user.id,
    reauthenticationRequired: !recentSignIn,
    freshLoginUntil:
      recentSignIn && active.session.loginAt
        ? new Date(active.session.loginAt.getTime() + 300_000).toISOString()
        : null,
  }
}
