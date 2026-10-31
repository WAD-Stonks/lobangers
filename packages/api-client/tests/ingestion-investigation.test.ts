import { createIngestionInvestigationClient } from '@api-client/ingestion-investigation'
import axios from 'axios'
import { expect, it, vi } from 'vitest'

it('validates requests before transport and defaults failed-post pagination while parsing safe responses', async () => {
  const adapter = vi.fn().mockResolvedValue({
    data: { items: [], nextCursor: null },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {},
  })
  const client = createIngestionInvestigationClient(axios.create({ adapter }))
  expect(await client.posts()).toEqual({ items: [], nextCursor: null })
  expect(adapter.mock.calls[0]?.[0]).toMatchObject({
    method: 'get',
    url: '/ingestion/posts',
    params: { status: 'FAILED', limit: 20 },
  })
  expect(() => client.posts({ limit: '999' })).toThrow()
  expect(() =>
    client.recover('bad-id', {
      mode: 'REPROCESS_STORED',
      note: 'Synthetic reason',
      confirmed: true,
      expectedUpdatedAt: '2026-10-28T00:00:00Z',
      expectedContentHash: 'a'.repeat(64),
    }),
  ).toThrow()
  expect(adapter).toHaveBeenCalledTimes(1)
  adapter.mockResolvedValueOnce({
    data: { rawContent: 'must not leak' },
    status: 200,
    headers: {},
    config: {},
  })
  await expect(client.posts()).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })
})
