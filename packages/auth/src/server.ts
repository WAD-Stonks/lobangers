import { createHash } from 'node:crypto'
import {
  generation,
  readActiveNativeSession,
  type SecurityUser,
  sessionAuthorizedNativePaths,
} from '@auth/account-security'
import { awaitAuthTasks } from '@auth/await-auth-tasks'
import { createGoogleAccountFence } from '@auth/google-account-fence'
import { mongodbVerification } from '@auth/mongodb-verification'
import { createNativeOperationFence } from '@auth/native-operation-fence'
import { createSessionAdmissionFence } from '@auth/session-admission-fence'
import { prismaAdapter } from '@better-auth/prisma-adapter'
import { db } from '@broke-oclock/db'
import {
  type BetterAuthOptions,
  betterAuth,
  getCurrentAdapter,
  type Verification,
} from 'better-auth'
import {
  APIError,
  createAuthMiddleware,
  getAuthoritativeSessionFromCtx,
  getOAuthState,
} from 'better-auth/api'
import { verifyProviderIdToken } from 'better-auth/oauth2'
import { type EmailOTPOptions, emailOTP } from 'better-auth/plugins/email-otp'

export type NativeDatabaseHooks = NonNullable<BetterAuthOptions['databaseHooks']>
export type AuthEmailMessage = { name: string; email: string; url: string }

// Supplied by the API (which owns the email provider). Implementations must never throw:
// a failed email must not break sign-up or the password-reset request.
export type AuthEmailSender = {
  sendVerification: (message: AuthEmailMessage) => Promise<void>
  sendPasswordReset: (message: AuthEmailMessage) => Promise<void>
}

export type EmailOTPData = Parameters<EmailOTPOptions['sendVerificationOTP']>[0]
export type AuthConfig = {
  baseURL: string
  secret: string
  trustedOrigin: string
  // Present only when the email provider is configured.
  email?: AuthEmailSender
  google?: { clientId: string; clientSecret: string }
  sendEmailOTP?: (data: EmailOTPData) => Promise<void>
}
const deliveryFailure = () =>
  APIError.fromStatus('INTERNAL_SERVER_ERROR', { message: 'Email authentication delivery failed' })
const linkFailure = () =>
  APIError.fromStatus('FORBIDDEN', {
    code: 'LOCAL_EMAIL_NOT_VERIFIED',
    message: 'Verify your local email before linking.',
  })

type EmailHookData = { user: { name: string; email: string }; url: string }

// The consuming API validates environment values before calling this factory.
export const createAuth = (config: AuthConfig) => {
  const sender = config.email
  const googleFence = createGoogleAccountFence()
  const sessionFence = createSessionAdmissionFence()
  const nativeOperations = createNativeOperationFence()
  // Public native Request identity survives endpoint/hook contexts; shared AuthContext does not own proof.
  const googleEmails = new WeakMap<
    Request,
    Readonly<{
      email: string
      userId: string | null
      authVersion: number
      platformVersion: number
      link: { userId: string; email: string } | null
    }>
  >()
  return betterAuth({
    baseURL: config.baseURL,
    basePath: '/api/auth',
    rateLimit: { enabled: true, window: 60, max: 100 },
    secret: config.secret,
    trustedOrigins: [config.trustedOrigin],
    // Native diagnostics can include OAuth state and provider errors. Keep level/event only.
    logger: {
      level: 'warn',
      log: (level) => {
        console.warn(JSON.stringify({ event: 'native-auth-diagnostic', level }))
      },
    },
    database: googleFence.adapter(
      nativeOperations.adapter(
        sessionFence.adapter(
          mongodbVerification(prismaAdapter(db, { provider: 'mongodb', transaction: true })),
        ),
      ),
    ),
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        storeOTP: 'hashed',
        resendStrategy: 'rotate',
        disableSignUp: false,
        sendVerificationOnSignUp: false,
        overrideDefaultEmailVerification: false,
        changeEmail: { enabled: false },
        rateLimit: { window: 60, max: 3 },
        sendVerificationOTP: async ({ email, otp, type }, ctx) => {
          if (!config.sendEmailOTP)
            throw APIError.fromStatus('SERVICE_UNAVAILABLE', {
              message: 'Email authentication is unavailable',
            })
          if (!ctx) throw deliveryFailure()
          const adapter = await getCurrentAdapter(ctx.context.adapter)
          const identifier = `${type}-otp-${email}`
          const value = `${createHash('sha256').update(otp).digest('base64url')}:0`
          const rows = await adapter.findMany<Verification>({
            model: 'verification',
            limit: 2,
            where: [
              { field: 'identifier', value: identifier },
              { field: 'value', value },
            ],
          })
          const row = rows[0]
          if (rows.length !== 1 || !row) throw deliveryFailure()
          try {
            await config.sendEmailOTP({ email, otp, type })
          } catch {
            try {
              await adapter.deleteMany({
                model: 'verification',
                where: [
                  { field: 'id', value: row.id },
                  { field: 'identifier', value: row.identifier },
                  { field: 'value', value: row.value },
                  { field: 'expiresAt', value: row.expiresAt },
                ],
              })
            } catch {
              /* Failure must still reach native dispatch even if cleanup fails. */
            }
            throw deliveryFailure()
          }
        },
      }),
      awaitAuthTasks(),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // The public dispatch context identifies pathless native server-only operations.
        // Challenge helpers are independent system APIs, not authenticated-session issuers.
        const operationId: unknown = Reflect.get(ctx, 'operationId')
        const independentChallenge =
          operationId === 'createEmailVerificationOTP' || operationId === 'getEmailVerificationOTP'
        if ((!ctx.path || ctx.path === '/') && !independentChallenge)
          throw APIError.fromStatus('UNAUTHORIZED', {
            code: 'UNAUTHORIZED',
            message: 'Unauthorized',
          })
        if (sessionAuthorizedNativePaths.has(ctx.path)) {
          const native = await getAuthoritativeSessionFromCtx(ctx)
          const adapter = await getCurrentAdapter(ctx.context.adapter)
          const active = native
            ? await readActiveNativeSession(adapter, native.session.id, native.user.id)
            : null
          if (!active)
            throw APIError.fromStatus('UNAUTHORIZED', {
              code: 'UNAUTHORIZED',
              message: 'Unauthorized',
            })
          // Admission reads do not mint a capability to acquire writing actor fences.
          if (!['GET', 'HEAD'].includes(ctx.request?.method ?? ctx.method))
            nativeOperations.authorize(ctx.request, active)
        }
        if (ctx.path === '/get-session') {
          const native = await getAuthoritativeSessionFromCtx(ctx)
          if (native) {
            const adapter = await getCurrentAdapter(ctx.context.adapter)
            if (!(await readActiveNativeSession(adapter, native.session.id, native.user.id)))
              return ctx.json(null)
          }
        }
        if (
          ctx.path === '/sign-in/email' ||
          ctx.path === '/sign-in/email-otp' ||
          ctx.path === '/sign-up/email'
        ) {
          const adapter = await getCurrentAdapter(ctx.context.adapter)
          const target =
            typeof ctx.body?.email === 'string'
              ? await adapter.findOne<SecurityUser>({
                  model: 'user',
                  where: [{ field: 'email', value: ctx.body.email.toLowerCase() }],
                })
              : null
          if (target?.suspendedAt != null)
            throw APIError.fromStatus('UNAUTHORIZED', {
              code: 'INVALID_EMAIL_OR_PASSWORD',
              message: 'Invalid email or password',
            })
          if (typeof ctx.body?.email === 'string')
            sessionFence.observe(ctx.request, target, ctx.body.email, ctx.path !== '/sign-up/email')
        }
        if (ctx.path === '/change-password' && ctx.body?.revokeOtherSessions === true) {
          const native = await getAuthoritativeSessionFromCtx(ctx)
          const adapter = await getCurrentAdapter(ctx.context.adapter)
          const active = native
            ? await readActiveNativeSession(adapter, native.session.id, native.user.id)
            : null
          if (!active) throw APIError.fromStatus('UNAUTHORIZED', { message: 'Unauthorized' })
          sessionFence.observeReplacement(ctx.request, active)
        }
        if (ctx.path === '/link-social' && ctx.body?.provider === 'google') {
          const session = await getAuthoritativeSessionFromCtx(ctx)
          if (!session?.user.emailVerified) throw linkFailure()
          // Pinned 1.7.5 direct ID-token linking skips validateUserInfo. Use its public native verifier.
          if (ctx.body.idToken) {
            const provider = ctx.context.socialProviders.find(
              (candidate) => candidate.id === 'google',
            )
            const { token, nonce, accessToken, refreshToken } = ctx.body.idToken
            if (
              !provider ||
              typeof token !== 'string' ||
              (nonce !== undefined && typeof nonce !== 'string') ||
              !(await verifyProviderIdToken(provider, token, nonce, ctx))
            )
              throw APIError.fromStatus('UNAUTHORIZED', {
                code: 'INVALID_TOKEN',
                message: 'Invalid token',
              })
            const info = await provider.getUserInfo({ idToken: token, accessToken, refreshToken })
            const validate = ctx.context.options.user?.validateUserInfo
            if (!info?.user || typeof info.user.email !== 'string' || !validate) throw linkFailure()
            const result = await validate(
              {
                user: { ...info.user, id: session.user.id, email: info.user.email },
                source: {
                  action: 'link-account',
                  method: 'oauth',
                  oauth: { providerId: 'google' },
                },
              },
              ctx,
            )
            if (result?.error)
              throw APIError.fromStatus('FORBIDDEN', {
                code: result.error,
                message: result.errorDescription ?? 'Google linking refused',
              })
          }
        }
        if (
          !config.sendEmailOTP &&
          (ctx.path === '/sign-in/email-otp' ||
            ctx.path.startsWith('/email-otp/') ||
            ctx.path === '/forget-password/email-otp')
        )
          throw APIError.fromStatus('SERVICE_UNAVAILABLE', {
            message: 'Email authentication is unavailable',
          })
        if (ctx.path === '/account-info')
          return {
            context: {
              context: {
                // Pinned 1.7.5 calls refreshAccessToken when expiry is <5s away.
                // Refuse at that exact native decision, not a racy preflight clock check.
                // Native refuses with FAILED_TO_GET_ACCESS_TOKEN; callers must POST
                // /refresh-token (or /get-access-token) before retrying this read.
                // Clone per-dispatch providers; never change the shared POST provider.
                socialProviders: ctx.context.socialProviders.map((provider) => ({
                  ...provider,
                  ...(provider.refreshAccessToken
                    ? {
                        refreshAccessToken: async () => {
                          throw APIError.fromStatus('BAD_REQUEST', {
                            code: 'FAILED_TO_GET_ACCESS_TOKEN',
                            message: 'Use POST /refresh-token before reading account info.',
                          })
                        },
                      }
                    : {}),
                })),
              },
            },
          }
      }),
      after: createAuthMiddleware(async (ctx) => {
        // Native server dispatch ignores a falsy before-hook result (including null).
        // HTTP is stopped above; server GETs need their native value filtered here too.
        if (ctx.path !== '/get-session') return
        const result = ctx.context.returned as {
          session?: { id?: string }
          user?: { id?: string }
        } | null
        if (!result?.session?.id || !result.user?.id) return
        const adapter = await getCurrentAdapter(ctx.context.adapter)
        if (!(await readActiveNativeSession(adapter, result.session.id, result.user.id)))
          return ctx.json(null)
      }),
    },
    socialProviders: config.google ? { google: config.google } : {},
    account: {
      accountLinking: {
        enabled: true,
        disableImplicitLinking: false,
        requireLocalEmailVerified: true,
        trustedProviders: [],
        allowDifferentEmails: false,
        allowUnlinkingAll: false,
        updateUserInfoOnLink: false,
      },
    },
    user: {
      validateUserInfo: async ({ user, source }, ctx?) => {
        if (source.method !== 'oauth' || source.oauth?.providerId !== 'google') return
        if (ctx?.request) googleEmails.delete(ctx.request)
        if (user.emailVerified !== true)
          return {
            error: 'EMAIL_NOT_VERIFIED',
            errorDescription: 'Verify your email before signing in.',
          }
        let googleIdentity: SecurityUser | null = null
        if (ctx && typeof user.email === 'string') {
          const adapter = await getCurrentAdapter(ctx.context.adapter)
          const target = await adapter.findOne<SecurityUser>({
            model: 'user',
            where: [{ field: 'email', value: user.email.toLowerCase() }],
          })
          googleIdentity = target
          if (target?.suspendedAt != null)
            return {
              error: 'INVALID_EMAIL_OR_PASSWORD',
              errorDescription: 'Invalid email or password',
            }
          const state = await getOAuthState()
          const primary =
            !state?.link &&
            ((ctx.path === '/callback/:id' && ctx.params?.id === 'google') ||
              (ctx.path === '/sign-in/social' &&
                ctx.body?.provider === 'google' &&
                Boolean(ctx.body.idToken)))
          if (primary) sessionFence.observe(ctx.request, target, user.email, true)
        }
        // Returning sign-in creates no account. A standalone provisioning policy probe mints no proof.
        if (source.action === 'sign-in' || (source.action === 'create-user' && !ctx)) return
        if (!ctx?.request || typeof user.email !== 'string' || !user.email)
          return {
            error: 'LOCAL_EMAIL_NOT_VERIFIED',
            errorDescription: 'Verify your local email before linking.',
          }
        const state = await getOAuthState()
        if (source.action === 'link-account') {
          const adapter = await getCurrentAdapter(ctx.context.adapter)
          const local =
            typeof user.id === 'string'
              ? await adapter.findOne<SecurityUser>({
                  model: 'user',
                  where: [{ field: 'id', value: user.id }],
                })
              : null
          const explicit = Boolean(state?.link) || ctx.path === '/link-social'
          const session = explicit ? await getAuthoritativeSessionFromCtx(ctx) : null
          const active = session
            ? await readActiveNativeSession(adapter, session.session.id, session.user.id)
            : null
          if (
            !local?.emailVerified ||
            local.suspendedAt != null ||
            typeof user.email !== 'string' ||
            local.email.toLowerCase() !== user.email.toLowerCase() ||
            (state?.link && state.link.email.toLowerCase() !== user.email.toLowerCase()) ||
            (explicit &&
              (!session ||
                !active ||
                session.user.id !== local.id ||
                (state?.link && state.link.userId !== session.user.id)))
          )
            return {
              error: 'LOCAL_EMAIL_NOT_VERIFIED',
              errorDescription: 'Verify your local email before linking.',
            }
          if (active && explicit) nativeOperations.authorize(ctx.request, active)
        }
        if (source.action !== 'link-account' && source.action !== 'create-user') return
        googleEmails.set(
          ctx.request,
          Object.freeze({
            email: user.email.toLowerCase(),
            authVersion: generation(googleIdentity?.authVersion),
            platformVersion: generation(googleIdentity?.platformVersion),
            userId:
              source.action === 'link-account' && typeof user.id === 'string' ? user.id : null,
            link: state?.link
              ? { userId: state.link.userId, email: state.link.email.toLowerCase() }
              : null,
          }),
        )
      },
      additionalFields: {
        suspendedAt: { type: 'date', required: false, input: false, returned: false },
        authVersion: { type: 'number', required: false, input: false, returned: false },
        platformVersion: { type: 'number', required: false, input: false, returned: false },
        role: {
          type: ['USER', 'MERCHANT', 'MODERATOR', 'ADMIN'],
          required: false,
          defaultValue: 'USER',
          input: false,
          returned: true,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      revokeSessionsOnPasswordReset: true,
      requireEmailVerification: Boolean(sender),
      ...(sender
        ? {
            // Awaited: on Vercel, work still running after the response can be stopped, so the
            // email must be finished (the sender never throws) before this hook returns.
            sendResetPassword: async ({ user, url }: EmailHookData) => {
              await sender.sendPasswordReset({ name: user.name, email: user.email, url })
            },
          }
        : {}),
    },
    ...(sender
      ? {
          emailVerification: {
            sendOnSignUp: true,
            sendOnSignIn: true,
            sendVerificationEmail: async ({ user, url }: EmailHookData) => {
              await sender.sendVerification({ name: user.name, email: user.email, url })
            },
          },
        }
      : {}),
    // Staff authorization must use fresh DB sessions. GET preserves DB; native POST renews.
    session: {
      cookieCache: { enabled: false },
      deferSessionRefresh: true,
      additionalFields: {
        authVersion: { type: 'number', required: false, input: false, returned: false },
        loginAt: { type: 'date', required: false, input: false, returned: false },
      },
    },
    databaseHooks: {
      user: {
        update: {
          before: async (data, ctx) => {
            if (
              ctx &&
              (sessionAuthorizedNativePaths.has(ctx.path) ||
                nativeOperations.hasAuthorization(ctx.request))
            )
              return { data: nativeOperations.stamp(data, ctx.request) }
          },
        },
      },
      session: {
        delete: {
          before: async (session, ctx) => {
            sessionFence.stampDeletion(session, ctx?.request)
            if (ctx && sessionAuthorizedNativePaths.has(ctx.path))
              nativeOperations.stampDeletion(session, ctx.request)
          },
        },
        create: {
          before: async (session, ctx) => {
            if (!ctx) return false
            const adapter = await getCurrentAdapter(ctx.context.adapter)
            const user = await adapter.findOne<SecurityUser>({
              model: 'user',
              where: [{ field: 'id', value: session.userId }],
            })
            return { data: sessionFence.stamp(session, ctx.request, user) }
          },
        },
      },
      account: {
        delete: {
          before: async (account, ctx) => {
            if (ctx && sessionAuthorizedNativePaths.has(ctx.path))
              nativeOperations.stampDeletion(account, ctx.request)
          },
        },
        update: {
          before: async (data, ctx) => {
            if (
              ctx &&
              (sessionAuthorizedNativePaths.has(ctx.path) ||
                nativeOperations.hasAuthorization(ctx.request))
            )
              return { data: nativeOperations.stamp(data, ctx.request) }
          },
        },
        create: {
          before: async (account, ctx) => {
            if (account.providerId !== 'google') return
            if (!ctx) return false
            if (!ctx.request) throw linkFailure()
            const proof = googleEmails.get(ctx.request)
            googleEmails.delete(ctx.request)
            if (!proof || (proof.userId !== null && proof.userId !== account.userId))
              throw linkFailure()
            // Includes native transaction-local newly created OAuth users, never global/cached identity.
            const adapter = await getCurrentAdapter(ctx.context.adapter)
            const local = await adapter.findOne<SecurityUser>({
              model: 'user',
              where: [{ field: 'id', value: account.userId }],
            })
            const state = await getOAuthState()
            const explicit = Boolean(state?.link) || ctx.path === '/link-social'
            const session = explicit ? await getAuthoritativeSessionFromCtx(ctx) : null
            if (
              !local?.emailVerified ||
              local.suspendedAt != null ||
              generation(local.authVersion) !== proof.authVersion ||
              generation(local.platformVersion) !== proof.platformVersion ||
              local.email.toLowerCase() !== proof.email ||
              (proof.link &&
                (proof.link.userId !== account.userId || proof.link.email !== proof.email)) ||
              (explicit &&
                (!session ||
                  session.user.id !== account.userId ||
                  (state?.link && state.link.userId !== session.user.id)))
            )
              throw linkFailure()
            return {
              data: googleFence.stamp(account, {
                userId: local.id,
                email: local.email,
                provenEmail: proof.email,
                accountId: account.accountId,
                sessionId: explicit && session ? session.session.id : null,
                authVersion: generation(local.authVersion),
                platformVersion: generation(local.platformVersion),
              }),
            }
          },
        },
      },
    },
    advanced: {
      // Keep security checks identical under NODE_ENV=test and production.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      database: { generateId: false },
    },
  })
}
