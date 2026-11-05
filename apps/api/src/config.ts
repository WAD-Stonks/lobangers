import {
  type CommunityPolicy,
  DEFAULT_COMMUNITY_POLICY,
} from '@broke-oclock/contracts/community-policy'
export type AppConfig = {
  community?: CommunityPolicy
  port: number
  webOrigin: string
  betterAuthUrl: string
  betterAuthSecret: string
  databaseUrl: string
  ingestion?: {
    enabled: boolean
    reuseApproved: boolean
    cronSecret?: string
    scoobifyReuseApproved?: boolean
    oneMap?: { email: string; password: string }
  }
  photoStorage?: { token: string; isDev: boolean }
  assistant?: {
    gemini?: { apiKey: string; model: string }
    groq?: { apiKey: string; model: string }
    clientIpHeader: string | null
  }
  email?: { apiKey: string; from: string }
  authProviders?: {
    google?: { clientId: string; clientSecret: string }
    email?: { apiKey: string; from: string }
  }
  pusher?: { appId: string; key: string; secret: string; cluster: string }
  places?: { apiKey: string }
}

type Environment = Record<string, string | undefined>
const requiredString = (env: Environment, name: string): string => {
  const value = env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}
const parseOrigin = (value: string, name: string): string => {
  try {
    const url = new URL(value)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      throw new Error('not an origin')
    return url.origin
  } catch {
    throw new Error(`${name} must be an HTTP(S) origin without credentials, path, query or hash`)
  }
}
const parsePort = (value: string | undefined): number => {
  const port = Number(value ?? '3000')
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be an integer between 1 and 65535')
  return port
}
const validateDatabaseUrl = (value: string): string => {
  if (!/^mongodb(?:\+srv)?:\/\/[^/\s]+\/[^?/#\s]+(?:\?[^#\s]*)?$/.test(value))
    throw new Error(
      'DATABASE_URL must be a MongoDB connection string with an explicit database name',
    )
  return value
}
const parsePhotoStorage = (env: Environment): AppConfig['photoStorage'] => {
  const provider = env.PHOTO_STORAGE_PROVIDER?.trim()
  if (!provider || provider === 'UNCONFIGURED') return undefined
  if (provider !== 'uploadthing') throw new Error('PHOTO_STORAGE_PROVIDER must be uploadthing')
  const token = env.UPLOADTHING_TOKEN?.trim()
  if (!token || ['UNSET', 'UNCONFIGURED'].includes(token)) return undefined
  return { token, isDev: env.NODE_ENV === 'development' }
}

const parseFlag = (env: Environment, name: string): boolean => {
  const value = env[name]?.trim()
  if (!value || value === 'false') return false
  if (value === 'true') return true
  throw new Error(`${name} must be true or false`)
}
const parseIngestion = (env: Environment): AppConfig['ingestion'] => {
  const email = env.ONEMAP_EMAIL?.trim()
  const password = env.ONEMAP_EMAIL_PASSWORD?.trim()
  const configured =
    email &&
    password &&
    ![email, password].some((value) => ['UNSET', 'UNCONFIGURED'].includes(value))
  return {
    enabled: parseFlag(env, 'INGESTION_ENABLED'),
    reuseApproved: parseFlag(env, 'MONEYDIGEST_REUSE_APPROVED'),
    scoobifyReuseApproved: parseFlag(env, 'SCOOBIFY_REUSE_APPROVED'),
    ...(/^[A-Za-z0-9_-]{32,256}$/u.test(env.CRON_SECRET ?? '')
      ? { cronSecret: env.CRON_SECRET }
      : {}),
    ...(configured ? { oneMap: { email, password } } : {}),
  }
}

const parseAuthProviders = (env: Environment): AppConfig['authProviders'] => {
  const value = (name: string, valid: RegExp) => {
    const raw = env[name]
    if (raw === undefined) return undefined
    if (/[\r\n]/u.test(raw)) throw new Error('Invalid authentication provider configuration')
    const trimmed = raw.trim()
    if (!trimmed || /^(?:unset|unconfigured)$/iu.test(trimmed)) return undefined
    if (!valid.test(trimmed)) throw new Error('Invalid authentication provider configuration')
    return trimmed
  }
  const clientId = value('GOOGLE_CLIENT_ID', /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/u)
  const clientSecret = value('GOOGLE_CLIENT_SECRET', /^[A-Za-z0-9._-]+$/u)
  const apiKey = value('RESEND_API_KEY', /^re_[A-Za-z0-9_-]+$/u)
  const from = value('EMAIL_FROM', /^(?:[^<>\r\n]+ <)?[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>?$/u)
  return {
    ...(clientId && clientSecret ? { google: { clientId, clientSecret } } : {}),
    ...(apiKey && from ? { email: { apiKey, from } } : {}),
  }
}

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite'
export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b'

const optionalKey = (env: Environment, name: string): string | undefined => {
  const value = env[name]?.trim()
  if (!value || /^(?:unset|unconfigured)$/iu.test(value)) return undefined
  if (!/^[A-Za-z0-9._-]{20,256}$/u.test(value)) throw new Error(`${name} is malformed`)
  return value
}

const parseAssistant = (env: Environment): AppConfig['assistant'] => {
  const geminiKey = optionalKey(env, 'GEMINI_API_KEY')
  const groqKey = optionalKey(env, 'GROQ_API_KEY')
  if (!geminiKey && !groqKey) return undefined
  const geminiModel = env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL
  if (!/^[a-z0-9][a-z0-9.-]{0,63}$/u.test(geminiModel))
    throw new Error('GEMINI_MODEL must be a Gemini model id such as gemini-3.5-flash-lite')
  const groqModel = env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL
  if (!/^[a-z0-9][a-z0-9./_-]{0,99}$/u.test(groqModel))
    throw new Error('GROQ_MODEL must be a Groq model id such as openai/gpt-oss-20b')
  return {
    ...(geminiKey ? { gemini: { apiKey: geminiKey, model: geminiModel } } : {}),
    ...(groqKey ? { groq: { apiKey: groqKey, model: groqModel } } : {}),
    clientIpHeader: env.VERCEL === '1' ? 'x-real-ip' : null,
  }
}

const parsePusher = (env: Environment): AppConfig['pusher'] => {
  const names = ['PUSHER_APP_ID', 'PUSHER_KEY', 'PUSHER_SECRET', 'PUSHER_CLUSTER'] as const
  const values = names.map((name) => {
    const value = env[name]?.trim()
    return !value || /^(?:unset|unconfigured)$/iu.test(value) ? undefined : value
  })
  if (values.every((value) => value === undefined)) return undefined
  const [appId, key, secret, cluster] = values
  if (!appId || !key || !secret || !cluster)
    throw new Error(`Set all of ${names.join(', ')} or none of them`)
  if (!/^\d{1,20}$/u.test(appId)) throw new Error('PUSHER_APP_ID must be numeric')
  if (!/^[A-Za-z0-9]{8,64}$/u.test(key)) throw new Error('PUSHER_KEY is malformed')
  if (!/^[A-Za-z0-9]{8,64}$/u.test(secret)) throw new Error('PUSHER_SECRET is malformed')
  if (!/^[a-z0-9-]{2,20}$/u.test(cluster)) throw new Error('PUSHER_CLUSTER is malformed')
  return { appId, key, secret, cluster }
}

const parseCommunityPolicy = (env: Environment): CommunityPolicy => {
  const integer = (name: string, fallback: number, max: number) => {
    const raw = env[name]?.trim()
    if (!raw || raw === 'UNCONFIGURED') return fallback
    if (!/^[1-9][0-9]*$/.test(raw) || Number(raw) > max)
      throw new Error(`${name} must be an integer between 1 and ${max}`)
    return Number(raw)
  }
  return {
    minAlive: integer('DEAL_CONFIRM_THRESHOLD', DEFAULT_COMMUNITY_POLICY.minAlive, 100),
    positivePercent: integer(
      'DEAL_POSITIVE_PERCENT',
      DEFAULT_COMMUNITY_POLICY.positivePercent,
      100,
    ),
    windowHours: integer('DEAL_VOTE_WINDOW_HOURS', DEFAULT_COMMUNITY_POLICY.windowHours, 168),
  }
}

export const parseConfig = (env: Environment): AppConfig => {
  const betterAuthSecret = requiredString(env, 'BETTER_AUTH_SECRET')
  if (betterAuthSecret.length < 32)
    throw new Error('BETTER_AUTH_SECRET must be at least 32 characters')
  const authProviders = parseAuthProviders(env)
  const email = authProviders?.email
  const pusher = parsePusher(env)
  const placesKey = optionalKey(env, 'GOOGLE_MAPS_API_KEY')
  return {
    port: parsePort(env.PORT),
    community: parseCommunityPolicy(env),
    ingestion: parseIngestion(env),
    authProviders,
    photoStorage: parsePhotoStorage(env),
    assistant: parseAssistant(env),
    webOrigin: parseOrigin(env.WEB_ORIGIN?.trim() || 'http://localhost:5173', 'WEB_ORIGIN'),
    betterAuthUrl: parseOrigin(
      env.BETTER_AUTH_URL?.trim() || 'http://localhost:3000',
      'BETTER_AUTH_URL',
    ),
    betterAuthSecret,
    databaseUrl: validateDatabaseUrl(requiredString(env, 'DATABASE_URL')),
    ...(email ? { email } : {}),
    ...(pusher ? { pusher } : {}),
    ...(placesKey ? { places: { apiKey: placesKey } } : {}),
  }
}
export const loadConfig = (): AppConfig => parseConfig(process.env)
