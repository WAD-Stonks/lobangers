import { createGooglePlacesClient, type GooglePlacesClientError } from '@integrations/server'
import { describe, expect, it, vi } from 'vitest'

const apiKey = 'synthetic-places-key-0000000000'
const place = {
  id: 'SyntheticPlace_0001',
  displayName: { text: 'Synthetic Kopi Stall', languageCode: 'en' },
  formattedAddress: '1 Synthetic Rd, #01-01, Singapore 000001',
  location: { latitude: 1.3, longitude: 103.85 },
  addressComponents: [
    { longText: 'Synthetic Rd', types: ['route'] },
    { longText: '000001', types: ['postal_code'] },
  ],
}
const expected = {
  placeId: 'SyntheticPlace_0001',
  name: 'Synthetic Kopi Stall',
  address: '1 Synthetic Rd, #01-01, Singapore 000001',
  postalCode: '000001',
  latitude: 1.3,
  longitude: 103.85,
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('createGooglePlacesClient', () => {
  it('searches Singapore only, with the key in a header and a field mask', async () => {
    const fetch = vi.fn(async () => json({ places: [place] }))
    const client = createGooglePlacesClient({ apiKey, fetch })

    expect(await client.search('  kopi ')).toEqual([expected])
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://places.googleapis.com/v1/places:searchText')
    expect(url).not.toContain(apiKey)
    const headers = init.headers as Record<string, string>
    expect(headers['X-Goog-Api-Key']).toBe(apiKey)
    expect(headers['X-Goog-FieldMask']).toContain('places.formattedAddress')
    expect(JSON.parse(String(init.body))).toMatchObject({
      textQuery: 'kopi',
      regionCode: 'SG',
      locationRestriction: { rectangle: { low: { latitude: 1.15 }, high: { latitude: 1.48 } } },
    })
  })

  it('reads one place by ID, and answers an empty search with no places', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.endsWith('searchText') ? json({}) : json(place),
    ) as unknown as typeof globalThis.fetch
    const client = createGooglePlacesClient({ apiKey, fetch })
    expect(await client.search('nothing here')).toEqual([])
    expect(await client.get('SyntheticPlace_0001')).toEqual(expected)
  })

  it('names each failure, and never sends a malformed ID or empty search', async () => {
    const failing = (response: Response | Error) =>
      createGooglePlacesClient({
        apiKey,
        fetch: async () => {
          if (response instanceof Error) throw response
          return response
        },
      })
    const code = (promise: Promise<unknown>) =>
      promise.catch((error: unknown) => (error as GooglePlacesClientError).code)

    expect(await code(failing(json({}, 403)).search('kopi'))).toBe('AUTH_ERROR')
    expect(await code(failing(json({}, 404)).get('SyntheticPlace_0001'))).toBe('NOT_FOUND')
    expect(await code(failing(json({}, 500)).search('kopi'))).toBe('HTTP_ERROR')
    expect(await code(failing(new TypeError('offline')).search('kopi'))).toBe('NETWORK_ERROR')
    expect(await code(failing(json({ places: [{ id: 'x' }] })).search('kopi'))).toBe(
      'MALFORMED_RESPONSE',
    )
    const unused = vi.fn()
    const client = createGooglePlacesClient({ apiKey, fetch: unused })
    expect(await code(client.get('../../secrets'))).toBe('INVALID_INPUT')
    expect(await code(client.search('   '))).toBe('INVALID_INPUT')
    expect(unused).not.toHaveBeenCalled()
  })
})
