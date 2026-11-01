import { ApiClientError } from '@api-client/transport'
import axios from 'axios'
import { expect, it, vi } from 'vitest'

it('exports explicit audit client with validated default pagination and safe response parsing', async () => {
  const module = await import('@api-client/admin-audit').catch(() => null)
  expect(module, 'Explicit audit client factory must be exported').not.toBeNull()
  if (!module) return
  const adapter = vi.fn().mockResolvedValue({
    data: { items: [], nextCursor: null },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {},
  })
  const http = axios.create({ adapter })
  const client = module.createAdminAuditClient(http)
  expect(await client.list({ limit: '2', action: 'DEAL_UPDATED' })).toEqual({
    items: [],
    nextCursor: null,
  })
  expect(adapter.mock.calls[0]?.[0]).toMatchObject({
    method: 'get',
    url: '/admin/audit',
    params: { limit: 2, action: 'DEAL_UPDATED' },
  })
  expect(() => client.list({ from: '2026-01-01T00:00:00Z' })).toThrow(ApiClientError)
  expect(adapter).toHaveBeenCalledTimes(1)
  adapter.mockResolvedValueOnce({
    data: { items: [{ password: 'synthetic secret' }], nextCursor: null },
    status: 200,
    headers: {},
    config: {},
  })
  await expect(client.list()).rejects.toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Unexpected API response',
  })
})
