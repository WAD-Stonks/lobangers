import { createGroqClient, GroqClientError, toStrictSchema } from '@integrations/server'
import { describe, expect, it } from 'vitest'

const options = { apiKey: 'gsk_synthetic_key_for_tests', model: 'openai/gpt-oss-20b' }
const request = {
  system: 'Synthetic rules',
  turns: [
    { role: 'user' as const, text: 'Cheap eats' },
    { role: 'model' as const, text: 'Here you go' },
    { role: 'user' as const, text: 'Cheaper?' },
  ],
  schema: {
    type: 'object',
    properties: {
      reply: { type: 'string' },
      ids: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    },
    required: ['reply'],
  },
  temperature: 0.4,
  maxOutputTokens: 700,
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const answer = (content: unknown, finishReason = 'stop') => ({
  choices: [{ message: { role: 'assistant', content }, finish_reason: finishReason }],
})

const errorCode = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error) {
    return error instanceof GroqClientError ? error.code : 'OTHER'
  }
  return 'NONE'
}

describe('createGroqClient', () => {
  it('posts one strict JSON-schema chat completion with low, hidden reasoning', async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = []
    const client = createGroqClient({
      ...options,
      fetch: async (input, init) => {
        calls.push({ url: String(input), init })
        return json(answer('{"reply":"Shiok"}'))
      },
    })
    await expect(client.generateJson(request)).resolves.toEqual({ reply: 'Shiok' })
    const [call] = calls
    expect(call?.url).toBe('https://api.groq.com/openai/v1/chat/completions')
    expect(new Headers(call?.init?.headers).get('authorization')).toBe(`Bearer ${options.apiKey}`)
    const body = JSON.parse(String(call?.init?.body))
    expect(body).toMatchObject({
      model: 'openai/gpt-oss-20b',
      reasoning_effort: 'low',
      include_reasoning: false,
      temperature: 0.4,
      max_completion_tokens: 2_200,
    })
    expect(body.messages).toEqual([
      { role: 'system', content: 'Synthetic rules' },
      { role: 'user', content: 'Cheap eats' },
      { role: 'assistant', content: 'Here you go' },
      { role: 'user', content: 'Cheaper?' },
    ])
    expect(body.response_format.type).toBe('json_schema')
    expect(body.response_format.json_schema.strict).toBe(true)
    expect(body.response_format.json_schema.schema).toEqual(toStrictSchema(request.schema))
  })

  it('closes every object and requires every property for strict mode', () => {
    expect(toStrictSchema(request.schema)).toEqual({
      type: 'object',
      properties: { reply: { type: 'string' }, ids: { type: 'array', items: { type: 'string' } } },
      required: ['reply', 'ids'],
      additionalProperties: false,
    })
  })

  it('maps provider failures to safe codes', async () => {
    const respond = (response: Response | Error) =>
      createGroqClient({
        ...options,
        fetch: async () => {
          if (response instanceof Error) throw response
          return response
        },
      }).generateJson(request)

    expect(await errorCode(respond(json({}, 429)))).toBe('RATE_LIMITED')
    expect(await errorCode(respond(json({ error: { code: 'json_validate_failed' } }, 400)))).toBe(
      'MALFORMED_RESPONSE',
    )
    expect(await errorCode(respond(json({ error: { message: 'secret detail' } }, 401)))).toBe(
      'HTTP_ERROR',
    )
    expect(await errorCode(respond(json(answer('{}', 'content_filter'))))).toBe('BLOCKED')
    expect(await errorCode(respond(json(answer('{"reply":', 'length'))))).toBe('MALFORMED_RESPONSE')
    expect(await errorCode(respond(json(answer('not json'))))).toBe('MALFORMED_RESPONSE')
    expect(await errorCode(respond(json(answer(null))))).toBe('MALFORMED_RESPONSE')
    expect(await errorCode(respond(new TypeError('fetch failed')))).toBe('NETWORK_ERROR')
    expect(await errorCode(respond(new DOMException('slow', 'TimeoutError')))).toBe('TIMEOUT')
  })

  it('rejects bad configuration and empty turns before any request', async () => {
    expect(() => createGroqClient({ ...options, model: 'Has Spaces' })).toThrow(GroqClientError)
    expect(() => createGroqClient({ ...options, apiKey: ' ' })).toThrow(GroqClientError)
    let called = false
    const client = createGroqClient({
      ...options,
      fetch: async () => {
        called = true
        return json(answer('{}'))
      },
    })
    expect(await errorCode(client.generateJson({ ...request, turns: [] }))).toBe('INVALID_INPUT')
    expect(called).toBe(false)
  })
})
