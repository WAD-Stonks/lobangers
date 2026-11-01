import {
  isValidJsonModelRequest,
  type JsonModelClient,
  type JsonModelErrorCode,
  type JsonModelRequest,
  type JsonModelTurn,
} from '@integrations/json-model'

export type GeminiErrorCode = JsonModelErrorCode

export class GeminiClientError extends Error {
  readonly code: GeminiErrorCode
  constructor(code: GeminiErrorCode) {
    super(
      {
        INVALID_INPUT: 'Gemini request input is invalid',
        RATE_LIMITED: 'Gemini rate limit reached',
        HTTP_ERROR: 'Gemini request failed',
        BLOCKED: 'Gemini blocked the request',
        MALFORMED_RESPONSE: 'Gemini returned an invalid response',
        NETWORK_ERROR: 'Gemini request could not be completed',
        TIMEOUT: 'Gemini request timed out',
      }[code],
    )
    this.name = 'GeminiClientError'
    this.code = code
  }
}

export type GeminiTurn = JsonModelTurn
export type GeminiJsonRequest = JsonModelRequest
export type GeminiClient = JsonModelClient
export interface GeminiClientOptions {
  readonly apiKey: string
  readonly model: string
  readonly fetch?: typeof fetch
  readonly timeoutMs?: number
}

const API_ORIGIN = 'https://generativelanguage.googleapis.com'
const DEFAULT_TIMEOUT_MS = 15_000
const MAX_RESPONSE_BYTES = 256 * 1024
const MODEL_PATTERN = /^[a-z0-9][a-z0-9.-]{0,63}$/
// Block anything medium-risk or worse in either direction; deal chat never needs it.
const SAFETY_SETTINGS = [
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
].map((category) => ({ category, threshold: 'BLOCK_MEDIUM_AND_ABOVE' }))
const BLOCKED_FINISH_REASONS = new Set([
  'SAFETY',
  'RECITATION',
  'BLOCKLIST',
  'PROHIBITED_CONTENT',
  'SPII',
  'IMAGE_SAFETY',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// Text parts of the first candidate, skipping any thought summaries.
const readCandidateText = (payload: unknown): string => {
  if (!isRecord(payload)) throw new GeminiClientError('MALFORMED_RESPONSE')
  if (isRecord(payload.promptFeedback) && payload.promptFeedback.blockReason)
    throw new GeminiClientError('BLOCKED')
  const [candidate] = Array.isArray(payload.candidates) ? payload.candidates : []
  if (!isRecord(candidate)) throw new GeminiClientError('MALFORMED_RESPONSE')
  if (
    typeof candidate.finishReason === 'string' &&
    BLOCKED_FINISH_REASONS.has(candidate.finishReason)
  )
    throw new GeminiClientError('BLOCKED')
  const parts =
    isRecord(candidate.content) && Array.isArray(candidate.content.parts)
      ? candidate.content.parts
      : []
  const text = parts
    .flatMap((part) =>
      isRecord(part) && part.thought !== true && typeof part.text === 'string' ? [part.text] : [],
    )
    .join('')
  if (!text.trim()) throw new GeminiClientError('MALFORMED_RESPONSE')
  return text
}

export const createGeminiClient = (options: GeminiClientOptions): GeminiClient => {
  const fetcher = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  if (!options.apiKey.trim() || !MODEL_PATTERN.test(options.model))
    throw new GeminiClientError('INVALID_INPUT')
  const url = `${API_ORIGIN}/v1beta/models/${options.model}:generateContent`

  return {
    async generateJson(request) {
      if (!isValidJsonModelRequest(request)) throw new GeminiClientError('INVALID_INPUT')
      let response: Response
      try {
        response = await fetcher(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': options.apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: request.system }] },
            contents: request.turns.map((turn) => ({
              role: turn.role,
              parts: [{ text: turn.text }],
            })),
            safetySettings: SAFETY_SETTINGS,
            generationConfig: {
              responseMimeType: 'application/json',
              responseJsonSchema: request.schema,
              candidateCount: 1,
              ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
              ...(request.maxOutputTokens === undefined
                ? {}
                : { maxOutputTokens: request.maxOutputTokens }),
            },
          }),
          redirect: 'error',
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'TimeoutError')
          throw new GeminiClientError('TIMEOUT')
        throw new GeminiClientError('NETWORK_ERROR')
      }
      if (response.status === 429) throw new GeminiClientError('RATE_LIMITED')
      if (!response.ok) throw new GeminiClientError('HTTP_ERROR')

      let body: string
      try {
        body = await response.text()
      } catch (error) {
        if (error instanceof DOMException && error.name === 'TimeoutError')
          throw new GeminiClientError('TIMEOUT')
        throw new GeminiClientError('NETWORK_ERROR')
      }
      if (body.length > MAX_RESPONSE_BYTES) throw new GeminiClientError('MALFORMED_RESPONSE')
      try {
        return JSON.parse(readCandidateText(JSON.parse(body)))
      } catch (error) {
        if (error instanceof GeminiClientError) throw error
        throw new GeminiClientError('MALFORMED_RESPONSE')
      }
    },
  }
}
