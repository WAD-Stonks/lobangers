import type { GenerateJson } from '@api/modules/assistant/chat'
import {
  GeminiClientError,
  GroqClientError,
  type JsonModelErrorCode,
  type JsonModelRequest,
} from '@broke-oclock/integrations/server'

export type AssistantProvider = 'gemini' | 'groq'
export type AssistantProviderChoice = 'auto' | AssistantProvider

// change to test both providers, currently using Gemini and Groq (backup)
export const LOBBIE_PROVIDER: AssistantProviderChoice = 'auto'

const AUTO_ORDER: readonly AssistantProvider[] = ['gemini', 'groq']

export class NoProviderError extends Error {
  constructor() {
    super('No AI provider is configured for this choice')
    this.name = 'NoProviderError'
  }
}

export const modelErrorCode = (error: unknown): JsonModelErrorCode | null =>
  error instanceof GeminiClientError || error instanceof GroqClientError ? error.code : null

const canFallBack = (error: unknown): boolean => {
  const code = modelErrorCode(error)
  return code !== null && code !== 'BLOCKED' && code !== 'INVALID_INPUT'
}

export const providerOrder = (
  providers: Partial<Record<AssistantProvider, GenerateJson>>,
  choice: AssistantProviderChoice,
): readonly AssistantProvider[] =>
  (choice === 'auto' ? AUTO_ORDER : [choice]).filter((name) => providers[name] !== undefined)

export const generateWithFallback = async (
  providers: Partial<Record<AssistantProvider, GenerateJson>>,
  choice: AssistantProviderChoice,
  request: JsonModelRequest,
): Promise<{ output: unknown; provider: AssistantProvider }> => {
  const order = providerOrder(providers, choice)
  if (order.length === 0) throw new NoProviderError()
  let lastError: unknown
  for (const [index, provider] of order.entries()) {
    const generate = providers[provider]
    if (!generate) continue
    try {
      return { output: await generate(request), provider }
    } catch (error) {
      lastError = error
      const next = order[index + 1]
      if (!next || !canFallBack(error)) throw error
      console.warn(`[api] Lobbie: ${provider} ${modelErrorCode(error)}, trying ${next}`)
    }
  }
  throw lastError
}
