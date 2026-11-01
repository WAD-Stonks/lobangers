import axios from 'axios'
import { expect, it, vi } from 'vitest'

it('requires explicit collection and validates confirmed versioned decisions before transport', async () => {
  const module = await import('@api-client/admin-moderation').catch(() => null)
  expect(module, 'moderation factory exists').not.toBeNull()
  if (!module) return
  const adapter = vi.fn().mockResolvedValue({
    data: { items: [], nextCursor: null },
    status: 200,
    headers: {},
    config: {},
  })
  const client = module.createAdminModerationClient(axios.create({ adapter }))
  expect(await client.reports({ targetType: 'COMMENT' })).toEqual({ items: [], nextCursor: null })
  expect(adapter.mock.calls[0]?.[0]).toMatchObject({
    url: '/admin/moderation/reports',
    params: { targetType: 'COMMENT', status: 'OPEN', limit: 25 },
  })
  expect(() => client.reports({ targetType: 'COMMENT', limit: '1e2' })).toThrow()
  expect(() =>
    client.resolve('DEAL', '0123456789abcdef01234567', {
      expectedVersion: 0,
      decision: 'RESOLVED',
      resolution: ' ',
      confirmed: true,
    }),
  ).toThrow()
  expect(adapter).toHaveBeenCalledTimes(1)
})
