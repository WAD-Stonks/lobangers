import {
  type ApiErrorCode,
  apiErrorSchema,
  currentUserUnauthorizedResponseSchema,
} from '@broke-oclock/contracts/api'
import axios, { type AxiosResponse } from 'axios'

export type ApiClientErrorCode = ApiErrorCode
export type RuntimeSchema<Input = unknown, Output = unknown> = {
  _input: Input
  _output: Output
  safeParse: (input: unknown) => { success: true; data: Output } | { success: false }
}
export type SchemaInput<Schema extends RuntimeSchema> = Schema['_input']
export type SchemaOutput<Schema extends RuntimeSchema> = Schema['_output']
export type QueryInput<Schema extends RuntimeSchema> = Partial<SchemaInput<Schema>>

export class ApiClientError extends Error {
  constructor(
    readonly code: ApiClientErrorCode,
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

export const toApiClientError = (error: unknown): ApiClientError => {
  if (axios.isAxiosError(error)) {
    if (
      error.config?.url === '/me' &&
      error.response?.status === 401 &&
      currentUserUnauthorizedResponseSchema.safeParse(error.response.data).success
    ) {
      return new ApiClientError('UNAUTHORIZED', 401, 'Unauthorized')
    }
    const parsed = apiErrorSchema.safeParse(error.response?.data)
    if (parsed.success) {
      return new ApiClientError(
        parsed.data.error.code,
        error.response?.status ?? 500,
        parsed.data.error.message,
      )
    }
    return new ApiClientError(
      'INTERNAL_SERVER_ERROR',
      error.response?.status ?? 500,
      'API request failed',
    )
  }
  return new ApiClientError('INTERNAL_SERVER_ERROR', 500, 'API request failed')
}

export const validateInput = <Schema extends RuntimeSchema>(
  schema: Schema,
  input: unknown,
): SchemaOutput<Schema> => {
  const result = schema.safeParse(input)
  if (!result.success) throw new ApiClientError('BAD_REQUEST', 400, 'Invalid request')
  return result.data
}

export const request = async <Schema extends RuntimeSchema>(
  httpCall: Promise<AxiosResponse<unknown>>,
  responseSchema: Schema,
): Promise<SchemaOutput<Schema>> => {
  try {
    const response = await httpCall
    const parsed = responseSchema.safeParse(response.data)
    if (!parsed.success)
      throw new ApiClientError('INTERNAL_SERVER_ERROR', 500, 'Unexpected API response')
    return parsed.data
  } catch (error) {
    if (error instanceof ApiClientError) throw error
    throw toApiClientError(error)
  }
}
