import {
  authorizeIngestionChannel,
  publishIngestionProgress,
  setIngestionPublisher,
} from '@api/modules/ingestion/realtime'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  setIngestionPublisher(null)
  vi.useRealTimers()
})
it('publishes bounded data-free invalidations and forces the final update', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(10000)
  const trigger = vi.fn().mockResolvedValue(undefined)
  setIngestionPublisher({ trigger, authorizeChannel: () => ({ auth: 'synthetic' }) })
  await publishIngestionProgress()
  await publishIngestionProgress()
  expect(trigger).toHaveBeenCalledTimes(1)
  expect(trigger).toHaveBeenCalledWith('private-admin-ingestion', 'progress-changed', {})
  await publishIngestionProgress(true)
  expect(trigger).toHaveBeenCalledTimes(2)
  expect(authorizeIngestionChannel('1.2')).toEqual({ auth: 'synthetic' })
})
it('does not fail committed work when publishing is unavailable or hangs', async () => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  setIngestionPublisher({
    trigger: () => new Promise(() => {}),
    authorizeChannel: () => ({ auth: 'synthetic' }),
  })
  const work = publishIngestionProgress(true)
  await vi.advanceTimersByTimeAsync(2000)
  await expect(work).resolves.toBeUndefined()
  setIngestionPublisher(null)
  await expect(publishIngestionProgress(true)).resolves.toBeUndefined()
  vi.restoreAllMocks()
})
