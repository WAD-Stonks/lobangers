import type { AppConfig } from '@api/config'
import type { GenerateJson } from '@api/modules/assistant/chat'
import {
  type AssistantProvider,
  type AssistantProviderChoice,
  LOBBIE_PROVIDER,
} from '@api/modules/assistant/providers'

export type RateLimiter = { take: (key: string) => boolean }
export type AssistantRuntime = {
  providers: Partial<Record<AssistantProvider, GenerateJson>>
  provider: AssistantProviderChoice
  limiter: RateLimiter
  clientIpHeader: string | null
  now: () => Date
}

const VISITOR_LIMIT = 8
const GLOBAL_LIMIT = 120
const WINDOW_MS = 60_000
const MAX_TRACKED_KEYS = 5_000
const PRIMARY_TIMEOUT_MS = 8_000

// Fixed one-minute windows in memory
export const createRateLimiter = (
  options: { visitorLimit?: number; globalLimit?: number; now?: () => number } = {},
): RateLimiter => {
  const visitorLimit = options.visitorLimit ?? VISITOR_LIMIT
  const globalLimit = options.globalLimit ?? GLOBAL_LIMIT
  const now = options.now ?? Date.now
  let windowStart = now()
  let total = 0
  let counts = new Map<string, number>()
  return {
    take: (key) => {
      const time = now()
      if (time - windowStart >= WINDOW_MS || counts.size > MAX_TRACKED_KEYS) {
        windowStart = time
        total = 0
        counts = new Map()
      }
      const used = counts.get(key) ?? 0
      if (used >= visitorLimit || total >= globalLimit) return false
      counts.set(key, used + 1)
      total += 1
      return true
    },
  }
}

export const createAssistantRuntime = (
  config: AppConfig,
  external: { fetch?: typeof fetch } = {},
): AssistantRuntime => {
  const options = config.assistant
  const gemini = options?.gemini
  const groq = options?.groq
  const geminiTimeoutMs = groq && LOBBIE_PROVIDER === 'auto' ? PRIMARY_TIMEOUT_MS : undefined
  return {
    providers: {
      ...(gemini
        ? {
            gemini: async (request) => {
              const { createGeminiClient } = await import('@broke-oclock/integrations/server')
              return createGeminiClient({
                ...gemini,
                fetch: external.fetch,
                timeoutMs: geminiTimeoutMs,
              }).generateJson(request)
            },
          }
        : {}),
      ...(groq
        ? {
            groq: async (request) => {
              const { createGroqClient } = await import('@broke-oclock/integrations/server')
              return createGroqClient({ ...groq, fetch: external.fetch }).generateJson(request)
            },
          }
        : {}),
    },
    provider: LOBBIE_PROVIDER,
    limiter: createRateLimiter(),
    clientIpHeader: options?.clientIpHeader ?? null,
    now: () => new Date(),
  }
}
