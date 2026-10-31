import { createGeminiClient, GeminiClientError } from '@integrations/server'
import { describe, expect, it } from 'vitest'

const options = { apiKey: 'synthetic-key-for-tests-only', model: 'gemini-test-lite' }
const request = {
  system: 'Synthetic rules',
  turns: [{ role: 'user' as const, text: 'Cheap eats near me' }],
  schema: { type: 'object' },
  temperature: 0.4,
  maxOutputTokens: 100,
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const answer = (text: string, extra: Record<string, unknown> = {}) => ({
  candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', ...extra }],
})

const errorCode = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error) {
    return error instanceof GeminiClientError ? error.code : 'OTHER'
  }
  return 'NONE'
}

describe('createGeminiClient', () => {
  it('posts one JSON-mode generateContent call with the key in a header', async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = []
    const client = createGeminiClient({
      ...options,
      fetch: async (input, init) => {
        calls.push({ url: String(input), init })
        return json(answer('{"reply":"Shiok","dealIds":[]}'))
      },
    })
    await expect(client.generateJson(request)).resolves.toEqual({ reply: 'Shiok', dealIds: [] })
    expect(calls).toHaveLength(1)
    const [call] = calls
    expect(call?.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-test-lite:generateContent',
    )
    expect(call?.url).not.toContain(options.apiKey)
    expect(new Headers(call?.init?.headers).get('x-goog-api-key')).toBe(options.apiKey)
    const body = JSON.parse(String(call?.init?.body))
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'Synthetic rules' }] })
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'Cheap eats near me' }] }])
    expect(body.generationConfig).toMatchObject({
      responseMimeType: 'application/json',
      responseJsonSchema: { type: 'object' },
      temperature: 0.4,
      maxOutputTokens: 100,
    })
    expect(body.safetySettings).toHaveLength(4)
  })

  it('skips thought parts and joins the answer text', async () => {
    const client = createGeminiClient({
      ...options,
      fetch: async () =>
        json({
          candidates: [
            {
              content: {
                parts: [{ text: 'thinking…', thought: true }, { text: '{"a":' }, { text: '1}' }],
              },
            },
          ],
        }),
    })
    await expect(client.generateJson(request)).resolves.toEqual({ a: 1 })
  })

  it('maps provider failures to safe codes', async () => {
    const respond = (response: Response | Error) =>
      createGeminiClient({
        ...options,
        fetch: async () => {
          if (response instanceof Error) throw response
          return response
        },
      }).generateJson(request)

    expect(await errorCode(respond(json({}, 429)))).toBe('RATE_LIMITED')
    expect(await errorCode(respond(json({ error: { message: 'secret detail' } }, 500)))).toBe(
      'HTTP_ERROR',
    )
    expect(await errorCode(respond(json({ promptFeedback: { blockReason: 'SAFETY' } })))).toBe(
      'BLOCKED',
    )
    expect(await errorCode(respond(json(answer('{}', { finishReason: 'SAFETY' }))))).toBe('BLOCKED')
    expect(await errorCode(respond(json(answer('not json'))))).toBe('MALFORMED_RESPONSE')
    expect(await errorCode(respond(json({ candidates: [] })))).toBe('MALFORMED_RESPONSE')
    expect(await errorCode(respond(new TypeError('fetch failed')))).toBe('NETWORK_ERROR')
    expect(await errorCode(respond(new DOMException('slow', 'TimeoutError')))).toBe('TIMEOUT')
  })

  it('rejects bad configuration and empty turns before any request', async () => {
    expect(() => createGeminiClient({ ...options, model: '../models/other' })).toThrow(
      GeminiClientError,
    )
    expect(() => createGeminiClient({ ...options, apiKey: ' ' })).toThrow(GeminiClientError)
    let called = false
    const client = createGeminiClient({
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
