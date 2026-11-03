import { createApiClient } from '@broke-oclock/api-client'
import type { InternalAxiosRequestConfig } from 'axios'
import { expect, it, vi } from 'vitest'

it('allows the ingestion execution budget without extending ordinary read timeouts or replaying writes', async () => {
  const client = createApiClient('/api')
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => ({
    data:
      config.method === 'post'
        ? {
            runId: 'fixture-run',
            status: 'SUCCEEDED',
            fetchedCount: 0,
            createdCount: 0,
            updatedCount: 0,
            failedCount: 0,
          }
        : { items: [] },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  }))
  client.http.defaults.adapter = adapter
  await client.ingestion.run()
  await client.ingestion.runs({ limit: 20 })
  expect(
    adapter.mock.calls.map(([config]) => ({ method: config.method, timeout: config.timeout })),
  ).toEqual([
    { method: 'post', timeout: 120_000 },
    { method: 'get', timeout: 30_000 },
  ])
})
