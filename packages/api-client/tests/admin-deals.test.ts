import axios from 'axios'
import { expect, it, vi } from 'vitest'

const id = '0123456789abcdef01234567'
it('uses strict typed admin deal client paths and blocks invalid writes before transport', async () => {
  const module = await import('@api-client/admin-deals').catch(() => null)
  expect(module, 'Deals client factory is required').not.toBeNull()
  if (!module) return
  const adapter = vi.fn().mockResolvedValue({
    data: { items: [], nextCursor: null },
    status: 200,
    headers: {},
    config: {},
  })
  const client = module.createAdminDealsClient(axios.create({ adapter }))
  expect(await client.list()).toEqual({ items: [], nextCursor: null })
  expect(adapter.mock.calls[0]?.[0]).toMatchObject({
    method: 'get',
    url: '/admin/deals',
    params: { limit: 20, includeDeleted: 'false' },
  })
  expect(() =>
    client.content(id, {
      expectedContentVersion: 1,
      expectedOperationVersion: 0,
      note: '',
      changes: { title: 'No' },
    }),
  ).toThrow()
  expect(() =>
    client.scope(id, {
      expectedContentVersion: 1,
      expectedOperationVersion: 0,
      note: 'Reason',
      applicability: 'ONLINE',
      merchantId: null,
      venueIds: [id],
    }),
  ).toThrow()
  expect(() =>
    client.reopen('bad', {
      expectedContentVersion: 1,
      expectedOperationVersion: 0,
      note: 'Reason',
    }),
  ).toThrow()
  expect(adapter).toHaveBeenCalledTimes(1)
  adapter.mockResolvedValueOnce({
    data: { password: 'never expose' },
    status: 200,
    headers: {},
    config: {},
  })
  await expect(client.detail(id)).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })
  expect(adapter.mock.calls[1]?.[0]).toMatchObject({
    method: 'get',
    url: `/admin/deals/${id}`,
    params: { limit: 20 },
  })
})
