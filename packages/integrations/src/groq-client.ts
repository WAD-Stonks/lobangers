import {
  isValidJsonModelRequest,
  type JsonModelClient,
  type JsonModelErrorCode,
} from '@integrations/json-model'

export type GroqErrorCode = JsonModelErrorCode

export class GroqClientError extends Error {
  readonly code: GroqErrorCode
  constructor(code: GroqErrorCode) {
    super(
      {
        INVALID_INPUT: 'Groq request input is invalid',
        RATE_LIMITED: 'Groq rate limit reached',
        HTTP_ERROR: 'Groq request failed',
        BLOCKED: 'Groq blocked the request',
        MALFORMED_RESPONSE: 'Groq returned an invalid response',
        NETWORK_ERROR: 'Groq request could not be completed',
        TIMEOUT: 'Groq request timed out',
      }[code],
    )
    this.name = 'GroqClientError'
    this.code = code
  }
}

export type GroqClient = JsonModelClient
export interface GroqClientOptions {
  readonly apiKey: string
  readonly model: string
  readonly fetch?: typeof fetch
  readonly timeoutMs?: number
}

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_TIMEOUT_MS = 15_000
const MAX_RESPONSE_BYTES = 256 * 1024
const DEFAULT_OUTPUT_TOKENS = 700
const REASONING_HEADROOM_TOKENS = 1_500
const MODEL_PATTERN = /^[a-z0-9][a-z0-9./_-]{0,99}$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const toStrictSchema = (schema: unknown): unknown => {
  if (Array.isArray(schema)) return schema.map(toStrictSchema)
  if (!isRecord(schema)) return schema
  const { maxItems: _maxItems, minItems: _minItems, ...rest } = schema
  const adapted = Object.fromEntries(
    Object.entries(rest).map(([key, value]) => [key, toStrictSchema(value)]),
  )
  if (schema.type !== 'object' || !isRecord(schema.properties)) return adapted
  return { ...adapted, required: Object.keys(schema.properties), additionalProperties: false }
}

const readContent = (payload: unknown): string => {
  if (!isRecord(payload)) throw new GroqClientError('MALFORMED_RESPONSE')
  const [choice] = Array.isArray(payload.choices) ? payload.choices : []
  if (!isRecord(choice)) throw new GroqClientError('MALFORMED_RESPONSE')
  if (choice.finish_reason === 'content_filter') throw new GroqClientError('BLOCKED')
  if (choice.finish_reason === 'length') throw new GroqClientError('MALFORMED_RESPONSE')
  const content = isRecord(choice.message) ? choice.message.content : null
  if (typeof content !== 'string' || !content.trim())
    throw new GroqClientError('MALFORMED_RESPONSE')
  return content
}

export const createGroqClient = (options: GroqClientOptions): GroqClient => {
  const fetcher = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  if (!options.apiKey.trim() || !MODEL_PATTERN.test(options.model))
    throw new GroqClientError('INVALID_INPUT')

  return {
    async generateJson(request) {
      if (!isValidJsonModelRequest(request)) throw new GroqClientError('INVALID_INPUT')
      let response: Response
      try {
        response = await fetcher(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify({
            model: options.model,
            messages: [
              { role: 'system', content: request.system },
              ...request.turns.map((turn) => ({
                role: turn.role === 'model' ? 'assistant' : 'user',
                content: turn.text,
              })),
            ],
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'reply', strict: true, schema: toStrictSchema(request.schema) },
            },
            reasoning_effort: 'low',
            include_reasoning: false,
            max_completion_tokens:
              (request.maxOutputTokens ?? DEFAULT_OUTPUT_TOKENS) + REASONING_HEADROOM_TOKENS,
            ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
          }),
          redirect: 'error',
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'TimeoutError')
          throw new GroqClientError('TIMEOUT')
        throw new GroqClientError('NETWORK_ERROR')
      }
      if (response.status === 429) throw new GroqClientError('RATE_LIMITED')
      if (response.status === 400) throw new GroqClientError('MALFORMED_RESPONSE')
      if (!response.ok) throw new GroqClientError('HTTP_ERROR')

      let body: string
      try {
        body = await response.text()
      } catch (error) {
        if (error instanceof DOMException && error.name === 'TimeoutError')
          throw new GroqClientError('TIMEOUT')
        throw new GroqClientError('NETWORK_ERROR')
      }
      if (body.length > MAX_RESPONSE_BYTES) throw new GroqClientError('MALFORMED_RESPONSE')
      try {
        return JSON.parse(readContent(JSON.parse(body)))
      } catch (error) {
        if (error instanceof GroqClientError) throw error
        throw new GroqClientError('MALFORMED_RESPONSE')
      }
    },
  }
}
