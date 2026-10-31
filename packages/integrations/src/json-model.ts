// What every JSON chat model transport takes and how it fails, so the API can swap or fall back
// between providers without knowing which one answered.
export type JsonModelErrorCode =
  | 'INVALID_INPUT'
  | 'RATE_LIMITED'
  | 'HTTP_ERROR'
  | 'BLOCKED'
  | 'MALFORMED_RESPONSE'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'

export interface JsonModelTurn {
  readonly role: 'user' | 'model'
  readonly text: string
}
export interface JsonModelRequest {
  readonly system: string
  readonly turns: readonly JsonModelTurn[]
  readonly schema: Record<string, unknown>
  readonly temperature?: number
  readonly maxOutputTokens?: number
}
export interface JsonModelClient {
  generateJson(request: JsonModelRequest): Promise<unknown>
}

export const MAX_PROMPT_CHARS = 200_000

export const isValidJsonModelRequest = (request: JsonModelRequest): boolean => {
  const size =
    request.system.length + request.turns.reduce((total, turn) => total + turn.text.length, 0)
  return (
    request.turns.length > 0 &&
    request.turns.every((turn) => turn.text.trim().length > 0) &&
    size <= MAX_PROMPT_CHARS
  )
}
