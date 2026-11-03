import type { IngestionRunResponse, IngestionRunsResponse } from '@broke-oclock/contracts/ingestion'
import { onAdminIdentityEnd } from '@web/lib/admin-recovery'
import { api } from '@web/lib/api-client'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { computed, shallowReactive } from 'vue'

type SourceRun = IngestionRunsResponse['items'][number]
type Phase = 'idle' | 'running' | 'uncertain' | 'finished' | 'failed'
type Transport = {
  run: () => Promise<IngestionRunResponse>
  runs: () => Promise<IngestionRunsResponse>
}
const POLL_MS = 3_000
// The server admits work for 90 seconds. A lost response must not immediately
// enable another submission, including between sequential source runs.
const RECONCILE_MS = 120_000
// Server leases never renew and fence writes after 120s. Allow 30s for clock
// skew before treating a historical RUNNING row as expired, not completed.
const LEASE_WINDOW_MS = 150_000
const hasLiveLease = (run: SourceRun) =>
  run.status === 'RUNNING' &&
  (!Number.isFinite(Date.parse(run.startedAt)) ||
    Date.now() - Date.parse(run.startedAt) < LEASE_WINDOW_MS)

export const createBackgroundImport = (transport: Transport) => {
  const state = shallowReactive({
    phase: 'idle' as Phase,
    runs: [] as SourceRun[],
    result: null as IngestionRunResponse | null,
    message: '',
    readError: '',
    refreshing: false,
    revision: 0,
    completed: 0,
    denied: '',
  })
  const active = computed(() => state.phase === 'running' || state.phase === 'uncertain')
  let generation = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let startedAt = 0
  let baseline = new Set<string>()
  let observing = false
  const stop = () => {
    clearTimeout(timer)
    timer = undefined
  }
  const reset = () => {
    generation++
    stop()
    baseline.clear()
    observing = false
    Object.assign(state, {
      phase: 'idle',
      runs: [],
      result: null,
      message: '',
      readError: '',
      refreshing: false,
      denied: '',
    })
  }
  const deny = (code: string) => {
    reset()
    state.denied = code
  }
  const schedule = () => {
    stop()
    if (active.value)
      timer = setTimeout(() => {
        void refresh()
      }, POLL_MS)
  }
  const refresh = async () => {
    if (state.refreshing || state.phase === 'idle') return
    const ticket = generation
    state.refreshing = true
    try {
      const response = await transport.runs()
      if (ticket !== generation) return
      state.runs = response.items.filter((run) => !baseline.has(run.id))
      state.readError = ''
      state.revision++
      if (
        (state.phase === 'uncertain' || observing) &&
        Date.now() - startedAt >= RECONCILE_MS &&
        !state.runs.some(hasLiveLease)
      ) {
        state.phase = 'failed'
        state.message =
          'No source activity remains within the lease window. Review history; the original response was not available and the outcome is unknown.'
        state.completed++
      }
    } catch (failure) {
      if (ticket !== generation) return
      const code = errorCode(failure)
      if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') {
        deny(code)
        return
      }
      state.readError = 'Progress could not be refreshed. The import may still be running.'
    } finally {
      if (ticket === generation) {
        state.refreshing = false
        schedule()
      }
    }
  }
  const start = async () => {
    if (active.value) return
    reset()
    const ticket = generation
    startedAt = Date.now()
    state.phase = 'running'
    state.message = 'Checking sources before starting…'
    // Snapshot before submission so old runs are never presented as new progress.
    try {
      const before = await transport.runs()
      if (ticket !== generation) return
      const running = before.items.filter(hasLiveLease)
      baseline = new Set(before.items.filter((run) => !hasLiveLease(run)).map((run) => run.id))
      if (running.length) {
        observing = true
        state.runs = running
        state.message = 'An import is already running. Following its source activity.'
        schedule()
        return
      }
    } catch (failure) {
      if (ticket !== generation) return
      const code = errorCode(failure)
      if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') {
        deny(code)
        return
      }
      state.phase = 'failed'
      state.message = 'Unable to check recent runs. No new import was submitted.'
      return
    }
    state.message = 'Import running in the background. You can continue using the admin pages.'
    schedule()
    try {
      const result = await transport.run()
      if (ticket !== generation) return
      state.result = result
      state.phase = result.status === 'FAILED' ? 'failed' : 'finished'
      state.message =
        result.status === 'FAILED'
          ? 'Import failed. Review the source results below.'
          : result.status === 'PARTIAL'
            ? 'Import finished with some source failures.'
            : 'Import finished.'
      state.completed++
    } catch (failure) {
      if (ticket !== generation) return
      const code = errorCode(failure)
      if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') {
        deny(code)
        return
      }
      const rejected = [
        'CONFLICT',
        'TOO_MANY_REQUESTS',
        'PRECONDITION_FAILED',
        'BAD_REQUEST',
      ].includes(code ?? '')
      state.phase = rejected ? 'failed' : 'uncertain'
      state.message =
        code === 'CONFLICT'
          ? 'Sources are busy or changed. Check the latest source activity before trying again.'
          : code === 'TOO_MANY_REQUESTS'
            ? 'Sources are cooling down. Wait before starting another import.'
            : code === 'PRECONDITION_FAILED'
              ? 'No enabled sources are ready. Review Sources & import.'
              : rejected
                ? 'The import request was rejected.'
                : 'The connection was interrupted. The import may still be running; checking source activity before another run.'
      if (rejected) state.completed++
    } finally {
      if (ticket === generation) {
        stop()
        await refresh()
      }
    }
  }
  const resume = (runs: SourceRun[]) => {
    if (state.phase !== 'idle' || !runs.some(hasLiveLease)) return
    startedAt = Date.now()
    observing = true
    baseline = new Set(runs.filter((run) => !hasLiveLease(run)).map((run) => run.id))
    state.runs = runs.filter(hasLiveLease)
    state.phase = 'running'
    state.message = 'An import is already running. Following its source activity.'
    schedule()
  }
  const dismiss = () => {
    if (!active.value) reset()
  }
  return { state, active, start, refresh, reset, resume, dismiss }
}

// SPA-owned rather than page-owned: changing admin routes never drops the
// request, progress polling or duplicate-submission guard. No credentials persist.
export const backgroundImport = createBackgroundImport({
  run: () => api.ingestion.run(),
  runs: () => api.ingestion.runs({ limit: 20 }),
})
onAdminIdentityEnd(backgroundImport.reset)
