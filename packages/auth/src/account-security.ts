import type { DBTransactionAdapter, Session, User } from 'better-auth'
import { APIError } from 'better-auth/api'

// Pinned 1.7.5 core registry; public sign-in/recovery/callbacks are deliberately not cookie-gated.
export const sessionAuthorizedNativePaths = new Set([
  '/update-user',
  '/change-password',
  '/set-password',
  '/change-email',
  '/verify-password',
  '/link-social',
  '/unlink-account',
  '/list-accounts',
  '/list-sessions',
  '/revoke-session',
  '/revoke-sessions',
  '/revoke-other-sessions',
  '/update-session',
  '/get-access-token',
  '/refresh-token',
  '/account-info',
  '/delete-user',
  '/delete-user/callback',
])

export type SecurityUser = User & {
  suspendedAt?: Date | null
  authVersion?: number | null
  platformVersion?: number | null
}
export type SecuritySession = Session & { authVersion?: number | null; loginAt?: Date | null }
export const securityFailure = () =>
  APIError.fromStatus('UNAUTHORIZED', {
    code: 'INVALID_EMAIL_OR_PASSWORD',
    message: 'Invalid email or password',
  })
export const generation = (value: unknown): number => {
  if (value == null) return 0
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 2_147_483_647
  )
    throw securityFailure()
  return value
}
export const isActive = (user: SecurityUser | null): user is SecurityUser =>
  user !== null && user.suspendedAt == null
/** Read-only, exact persisted identity; additional fields are deliberately absent from native output. */
export const readActiveNativeSession = async (
  adapter: DBTransactionAdapter,
  id: string,
  userId: string,
) => {
  const session = await adapter.findOne<SecuritySession>({
    model: 'session',
    where: [
      { field: 'id', value: id },
      { field: 'userId', value: userId },
    ],
  })
  const user = await adapter.findOne<SecurityUser>({
    model: 'user',
    where: [{ field: 'id', value: userId }],
  })
  if (!session || !isActive(user) || session.expiresAt.getTime() <= Date.now()) return null
  // Only normalization is caught. Store/adapter errors above must never become anonymous success.
  try {
    if (generation(session.authVersion) !== generation(user.authVersion)) return null
  } catch {
    return null
  }
  return { session, user }
}
