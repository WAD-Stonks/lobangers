import { flushPromises } from '@vue/test-utils'
import { openImportProgressChannel } from '@web/modules/ingestion-admin/progress-channel'
import { afterEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  events: new Map<string, () => void>(),
  config: vi.fn().mockResolvedValue({ pusher: { key: 'synthetic', cluster: 'ap1' } }),
  auth: vi.fn().mockResolvedValue({ auth: 'synthetic' }),
  disconnect: vi.fn(),
  subscribe: vi.fn(),
}))
vi.mock('@web/lib/api-client', () => ({
  api: { ingestion: { realtimeConfig: fixture.config, realtimeAuth: fixture.auth } },
}))
vi.mock('pusher-js', () => ({
  default: class {
    connection = { state: 'connected', bind: vi.fn(), unbind: vi.fn() }
    subscribe(name: string) {
      fixture.subscribe(name)
      return {
        bind: (event: string, callback: () => void) => fixture.events.set(event, callback),
        unbind_all: () => fixture.events.clear(),
      }
    }
    unsubscribe = vi.fn()
    disconnect = fixture.disconnect
  },
}))
afterEach(() => {
  vi.clearAllMocks()
  fixture.events.clear()
})
it('refreshes on private pushes and resubscription, then disconnects on identity cleanup', async () => {
  const changed = vi.fn()
  const close = openImportProgressChannel(changed, vi.fn())
  await flushPromises()
  expect(fixture.subscribe).toHaveBeenCalledWith('private-admin-ingestion')
  fixture.events.get('pusher:subscription_succeeded')?.()
  fixture.events.get('progress-changed')?.()
  expect(changed).toHaveBeenCalledTimes(2)
  close()
  expect(fixture.disconnect).toHaveBeenCalledTimes(1)
  expect(fixture.events.size).toBe(0)
})
it('does not connect after identity ends while configuration is loading', async () => {
  const close = openImportProgressChannel(vi.fn(), vi.fn())
  close()
  await flushPromises()
  expect(fixture.subscribe).not.toHaveBeenCalled()
})
