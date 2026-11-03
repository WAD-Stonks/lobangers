import type { IngestionRunResponse, IngestionRunsResponse } from '@broke-oclock/contracts/ingestion'
import { flushPromises } from '@vue/test-utils'
import { ApiClientError } from '@web/lib/api-client'
import { createBackgroundImport } from '@web/modules/ingestion-admin/background-import'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const result: IngestionRunResponse = {
  runId: 'new-run',
  status: 'SUCCEEDED',
  fetchedCount: 20,
  createdCount: 2,
  updatedCount: 1,
  failedCount: 0,
}
const sourceRun = (status = 'RUNNING'): IngestionRunsResponse['items'][number] => ({
  id: 'new-run',
  sourceName: 'Synthetic source',
  status,
  startedAt: '2026-11-03T08:00:00.000Z',
  finishedAt: status === 'RUNNING' ? null : '2026-11-03T08:01:00.000Z',
  fetchedCount: 20,
  createdCount: 2,
  updatedCount: 1,
  failedCount: 0,
  errorCode: null,
})
const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-03T08:00:00.000Z'))
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

it('refreshes on pushes without polling, blocks duplicate submissions and stops after completion', async () => {
  const response = deferred<IngestionRunResponse>()
  const run = vi.fn(() => response.promise)
  const runs = vi
    .fn()
    .mockResolvedValueOnce({ items: [] })
    .mockResolvedValue({ items: [sourceRun()] })
  let changed = () => {}
  const detach = vi.fn()
  const job = createBackgroundImport({
    run,
    runs,
    subscribe: (listener) => {
      changed = listener
      return detach
    },
  })
  const request = job.start()
  await flushPromises()
  await job.start()
  expect(run).toHaveBeenCalledTimes(1)
  expect(job.active.value).toBe(true)
  await vi.advanceTimersByTimeAsync(60_000)
  expect(runs).toHaveBeenCalledTimes(1)
  changed()
  await flushPromises()
  expect(job.state.runs).toEqual([sourceRun()])
  expect(job.state.result).toBeNull()
  runs.mockResolvedValue({ items: [sourceRun('SUCCEEDED')] })
  response.resolve(result)
  await request
  expect(job.state.result).toEqual(result)
  expect(job.active.value).toBe(false)
  const reads = runs.mock.calls.length
  await vi.advanceTimersByTimeAsync(15_000)
  expect(runs).toHaveBeenCalledTimes(reads)
})

it('reconciles a lost response with read-only history without retrying or inventing success', async () => {
  const run = vi.fn().mockRejectedValue(new Error('private transport details'))
  const runs = vi
    .fn()
    .mockResolvedValueOnce({ items: [] })
    .mockResolvedValue({ items: [sourceRun()] })
  const job = createBackgroundImport({ run, runs })
  await job.start()
  expect(job.state.phase).toBe('uncertain')
  expect(job.state.message).not.toContain('private')
  await job.start()
  expect(run).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(120_000)
  expect(job.active.value).toBe(true)
  runs.mockResolvedValue({ items: [sourceRun('SUCCEEDED')] })
  await job.refresh()
  expect(job.active.value).toBe(false)
  expect(job.state.result).toBeNull()
  expect(job.state.message).toContain('original response was not available')
  expect(run).toHaveBeenCalledTimes(1)
})

it('fences late progress and completion when the identity ends', async () => {
  const response = deferred<IngestionRunResponse>()
  const read = deferred<IngestionRunsResponse>()
  const runs = vi.fn().mockResolvedValueOnce({ items: [] }).mockReturnValue(read.promise)
  const job = createBackgroundImport({ run: () => response.promise, runs })
  const request = job.start()
  await flushPromises()
  void job.refresh()
  job.reset()
  response.resolve(result)
  read.resolve({ items: [sourceRun()] })
  await request
  await flushPromises()
  expect(job.state.phase).toBe('idle')
  expect(job.state.runs).toEqual([])
  expect(job.state.result).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
})

it('does not submit a new import when the preflight read fails or another source run is active', async () => {
  const run = vi.fn()
  const runs = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ items: [sourceRun()] })
  const job = createBackgroundImport({ run, runs })
  await job.start()
  expect(job.state.message).toContain('No new import was submitted')
  expect(run).not.toHaveBeenCalled()
  await job.start()
  expect(job.state.runs).toEqual([sourceRun()])
  expect(job.active.value).toBe(true)
  expect(run).not.toHaveBeenCalled()
  job.reset()
})

it('resumes source progress after page reload using reads only', async () => {
  const run = vi.fn()
  const runs = vi.fn().mockResolvedValue({ items: [sourceRun()] })
  const job = createBackgroundImport({ run, runs })
  job.resume([sourceRun()])
  await vi.advanceTimersByTimeAsync(3_000)
  expect(job.active.value).toBe(true)
  expect(job.state.runs).toEqual([sourceRun()])
  expect(run).not.toHaveBeenCalled()
  job.reset()
})

it('clears protected progress and stops polling on authorization denial', async () => {
  const runs = vi.fn().mockRejectedValue(new ApiClientError('FORBIDDEN', 403, 'Denied'))
  const job = createBackgroundImport({ run: vi.fn(), runs })
  job.resume([sourceRun()])
  await job.refresh()
  expect(job.state.phase).toBe('idle')
  expect(job.state.runs).toEqual([])
  expect(job.state.denied).toBe('FORBIDDEN')
  expect(vi.getTimerCount()).toBe(0)
})

it('ignores expired historical rows at preflight and resume without inventing completion', async () => {
  const expired = { ...sourceRun(), startedAt: '2026-11-03T07:00:00.000Z' }
  const run = vi.fn().mockResolvedValue(result)
  const job = createBackgroundImport({ run, runs: vi.fn().mockResolvedValue({ items: [expired] }) })
  job.resume([expired])
  expect(job.active.value).toBe(false)
  await job.start()
  expect(run).toHaveBeenCalledTimes(1)
  expect(job.state.runs).toEqual([])
})

it('unblocks an orphaned run after its fixed lease expires without replaying the POST', async () => {
  const run = vi.fn().mockRejectedValue(new Error('lost response'))
  const runs = vi
    .fn()
    .mockResolvedValueOnce({ items: [] })
    .mockResolvedValue({ items: [sourceRun()] })
  const job = createBackgroundImport({ run, runs })
  await job.start()
  await vi.advanceTimersByTimeAsync(150_000)
  expect(job.active.value).toBe(false)
  expect(job.state.result).toBeNull()
  expect(job.state.message).toContain('outcome is unknown')
  expect(run).toHaveBeenCalledTimes(1)
  job.dismiss()
  expect(job.state.phase).toBe('idle')
})
