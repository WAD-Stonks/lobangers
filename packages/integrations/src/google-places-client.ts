export type GooglePlacesErrorCode =
  | 'INVALID_INPUT'
  | 'AUTH_ERROR'
  | 'NOT_FOUND'
  | 'HTTP_ERROR'
  | 'MALFORMED_RESPONSE'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'

export class GooglePlacesClientError extends Error {
  readonly code: GooglePlacesErrorCode
  constructor(code: GooglePlacesErrorCode) {
    super(
      {
        INVALID_INPUT: 'Google Places input is invalid',
        AUTH_ERROR: 'Google Places rejected the API key',
        NOT_FOUND: 'Google Places has no such place',
        HTTP_ERROR: 'Google Places request failed',
        MALFORMED_RESPONSE: 'Google Places returned an invalid response',
        NETWORK_ERROR: 'Google Places request could not be completed',
        TIMEOUT: 'Google Places request timed out',
      }[code],
    )
    this.name = 'GooglePlacesClientError'
    this.code = code
  }
}

export interface PlaceMatch {
  placeId: string
  name: string
  address: string
  postalCode: string | null
  latitude: number
  longitude: number
}
export interface GooglePlacesClient {
  search(query: string): Promise<PlaceMatch[]>
  get(placeId: string): Promise<PlaceMatch>
}
export interface GooglePlacesClientOptions {
  readonly apiKey: string
  readonly fetch?: typeof fetch
}

const BASE_URL = 'https://places.googleapis.com/v1'
const FIELDS = ['id', 'displayName', 'formattedAddress', 'location', 'addressComponents']
const REQUEST_TIMEOUT_MS = 8_000
const MAX_RESULTS = 10
const SINGAPORE_BOX = {
  low: { latitude: 1.15, longitude: 103.58 },
  high: { latitude: 1.48, longitude: 104.1 },
}
export const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{10,300}$/u

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() && value.length <= 500 ? value.trim() : null
const coordinate = (value: unknown, maximum: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > maximum)
    throw new GooglePlacesClientError('MALFORMED_RESPONSE')
  return value
}
const postalCodeOf = (components: unknown): string | null => {
  if (!Array.isArray(components)) return null
  const postal = components.find(
    (part) => isRecord(part) && Array.isArray(part.types) && part.types.includes('postal_code'),
  )
  const code = isRecord(postal) ? postal.longText : null
  return typeof code === 'string' && /^\d{6}$/u.test(code) ? code : null
}
const parsePlace = (value: unknown): PlaceMatch => {
  const id = isRecord(value) ? value.id : null
  const name = isRecord(value) && isRecord(value.displayName) ? text(value.displayName.text) : null
  const address = isRecord(value) ? text(value.formattedAddress) : null
  const location = isRecord(value) ? value.location : null
  if (
    typeof id !== 'string' ||
    !PLACE_ID_PATTERN.test(id) ||
    !name ||
    !address ||
    !isRecord(location)
  )
    throw new GooglePlacesClientError('MALFORMED_RESPONSE')
  return {
    placeId: id,
    name,
    address,
    postalCode: postalCodeOf(isRecord(value) ? value.addressComponents : null),
    latitude: coordinate(location.latitude, 90),
    longitude: coordinate(location.longitude, 180),
  }
}

export const createGooglePlacesClient = (
  options: GooglePlacesClientOptions,
): GooglePlacesClient => {
  const request = options.fetch ?? globalThis.fetch
  const call = async (url: string, fields: string, init: RequestInit = {}): Promise<unknown> => {
    let response: Response
    try {
      response = await request(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': options.apiKey,
          'X-Goog-FieldMask': fields,
        },
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError')
        throw new GooglePlacesClientError('TIMEOUT')
      throw new GooglePlacesClientError('NETWORK_ERROR')
    }
    if (response.status === 401 || response.status === 403)
      throw new GooglePlacesClientError('AUTH_ERROR')
    if (response.status === 404) throw new GooglePlacesClientError('NOT_FOUND')
    if (!response.ok) throw new GooglePlacesClientError('HTTP_ERROR')
    try {
      return (await response.json()) as unknown
    } catch {
      throw new GooglePlacesClientError('MALFORMED_RESPONSE')
    }
  }
  return {
    search: async (query) => {
      const textQuery = query.trim()
      if (!textQuery || textQuery.length > 100) throw new GooglePlacesClientError('INVALID_INPUT')
      const payload = await call(
        `${BASE_URL}/places:searchText`,
        FIELDS.map((field) => `places.${field}`).join(','),
        {
          method: 'POST',
          body: JSON.stringify({
            textQuery,
            regionCode: 'SG',
            pageSize: MAX_RESULTS,
            locationRestriction: { rectangle: SINGAPORE_BOX },
          }),
        },
      )
      if (!isRecord(payload)) throw new GooglePlacesClientError('MALFORMED_RESPONSE')
      if (payload.places === undefined) return []
      if (!Array.isArray(payload.places)) throw new GooglePlacesClientError('MALFORMED_RESPONSE')
      return payload.places.slice(0, MAX_RESULTS).map(parsePlace)
    },
    get: async (placeId) => {
      if (!PLACE_ID_PATTERN.test(placeId)) throw new GooglePlacesClientError('INVALID_INPUT')
      return parsePlace(await call(`${BASE_URL}/places/${placeId}`, FIELDS.join(',')))
    },
  }
}
