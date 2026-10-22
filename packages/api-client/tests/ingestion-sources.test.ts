import { ApiClientError, createApiClient } from '@broke-oclock/api-client'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { describe, expect, it, vi } from 'vitest'

const source = {
  id: '0123456789abcdef01234567',
  name: 'Fixture',
  provider: 'TELEGRAM',
  externalId: 'thiscounted',
  url: 'https://t.me/s/ThisCounted',
  enabled: false,
  updatedAt: '2026-10-20T00:00:00.000Z',
}
const method = (group: object, name: string) => {
  const fn = Reflect.get(group, name)
  expect(typeof fn, name).toBe('function')
  return fn as (...args: unknown[]) => Promise<unknown>
}
const fixture = (data: unknown = source) => {
  const client = createApiClient()
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  }))
  client.http.defaults.adapter = adapter
  return { client, adapter }
}
describe('source client: actual Axios with a synthetic adapter', () => {
  it('exposes list/add/toggle with explicit paths, default bounded query, and versioned body', async () => {
    const { client, adapter } = fixture({ items: [source], nextCursor: null })
    expect(await method(client.ingestion, 'sources')()).toEqual({
      items: [source],
      nextCursor: null,
    })
    expect(adapter.mock.calls[0]?.[0]).toMatchObject({
      method: 'get',
      url: '/ingestion/sources',
      params: { limit: 20 },
      withCredentials: true,
    })
    const add = fixture()
    expect(
      await method(
        add.client.ingestion,
        'addSource',
      )({ name: ' Fixture ', previewUrl: source.url }),
    ).toEqual(source)
    expect(JSON.parse(add.adapter.mock.calls[0]?.[0].data)).toEqual({
      name: 'Fixture',
      previewUrl: source.url,
    })
    const toggle = fixture({ ...source, enabled: true })
    await method(toggle.client.ingestion, 'setSourceEnabled')(source.id, {
      enabled: true,
      expectedUpdatedAt: source.updatedAt,
      reuseConfirmed: true,
    })
    expect(toggle.adapter.mock.calls[0]?.[0]).toMatchObject({
      method: 'patch',
      url: `/ingestion/sources/${source.id}`,
    })
    expect(JSON.parse(toggle.adapter.mock.calls[0]?.[0].data)).toEqual({
      enabled: true,
      expectedUpdatedAt: source.updatedAt,
      reuseConfirmed: true,
    })
  })
  it('rejects malformed URL/control injection and enable without confirmation before I/O', () => {
    const { client, adapter } = fixture()
    const add = method(client.ingestion, 'addSource')
    for (const previewUrl of [
      'https://t.me:443/s/ThisCounted',
      'https://t.me/s/ThisCounted?x=1',
      'https://t.me/s/ThisCounted\n',
    ])
      expect(() => add({ name: 'Fixture', previewUrl })).toThrow(ApiClientError)
    expect(() => add({ name: 'Fixture', previewUrl: source.url, enabled: true })).toThrow(
      ApiClientError,
    )
    expect(() =>
      method(client.ingestion, 'setSourceEnabled')(source.id, {
        enabled: true,
        expectedUpdatedAt: source.updatedAt,
      }),
    ).toThrow(ApiClientError)
    expect(adapter).not.toHaveBeenCalled()
  })
  it('maps conflict safely without automatic mutation retry and validates the returned DTO', async () => {
    const { client, adapter } = fixture()
    adapter.mockImplementation(async (config) => {
      throw new AxiosError('private', 'ERR_BAD_RESPONSE', config, undefined, {
        data: { error: { code: 'CONFLICT', message: 'Source changed' } },
        status: 409,
        statusText: 'Conflict',
        headers: {},
        config,
      })
    })
    await expect(
      method(client.ingestion, 'setSourceEnabled')(source.id, {
        enabled: false,
        expectedUpdatedAt: source.updatedAt,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409, message: 'Source changed' })
    expect(adapter).toHaveBeenCalledTimes(1)
    const invalid = fixture({ ...source, leaseToken: 'do-not-expose' })
    await expect(
      method(invalid.client.ingestion, 'addSource')({ name: source.name, previewUrl: source.url }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })
  })
})
