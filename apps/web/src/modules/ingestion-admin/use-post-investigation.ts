import type {
  PostDetail,
  RecoveryRequest,
  RecoveryResult,
} from '@broke-oclock/contracts/ingestion-recovery'
import { api } from '@web/lib/api-client'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import {
  clearRecoveryWorkspace,
  type RecoveryAttempt,
  useRecoveryWorkspace,
} from '@web/modules/ingestion-admin/recovery-workspace'
import { computed, onBeforeUnmount, type Ref, ref, watch } from 'vue'
export const usePostInvestigation = (postId: Ref<string>, denied: (code: string) => void) => {
  const detail = ref<PostDetail | null>(null),
    pending = ref(false),
    busy = ref(false),
    error = ref(''),
    note = ref(''),
    confirmed = ref(false),
    mode = ref<RecoveryRequest['mode']>('REPROCESS_STORED'),
    result = ref<RecoveryResult | null>(null)
  const workspace = useRecoveryWorkspace()
  const locks = workspace.attempts
  const highest = workspace.highest
  const workspaceEpoch = workspace.epoch
  const observeTerminal = (lock: RecoveryAttempt, value: RecoveryResult) => {
    if (
      !lock.terminalKnown &&
      !['REQUESTED', 'RUNNING'].includes(value.status) &&
      value.targetOutcome !== 'UNKNOWN'
    ) {
      lock.terminalKnown = true
      lock.terminalAfter = ++workspace.clock
    }
  }
  let generation = 0,
    request = 0,
    closed = false
  const unknown = computed(() => locks.has(postId.value))
  const clearConsent = () => {
    note.value = ''
    confirmed.value = false
  }
  const current = (epoch: number, ticket: number, id: string) =>
    !closed &&
    workspaceEpoch === workspace.epoch &&
    epoch === generation &&
    ticket === request &&
    id === postId.value
  const deny = (failure: unknown) => {
    const code = errorCode(failure)
    if (code !== 'UNAUTHORIZED' && code !== 'FORBIDDEN') return false
    clearRecoveryWorkspace(workspace)
    generation++
    detail.value = null
    result.value = null
    clearConsent()
    error.value = 'Access denied. Protected evidence has been cleared.'
    closed = true
    denied(code)
    return true
  }
  const load = async (cursor?: string) => {
    if (closed || pending.value || busy.value) return
    const id = postId.value,
      epoch = generation,
      ticket = ++request
    const started = ++workspace.clock
    pending.value = true
    error.value = ''
    clearConsent()
    try {
      const value = await api.ingestionInvestigation.post(id, {
        limit: 20,
        ...(cursor ? { cursor } : {}),
      })
      if (!current(epoch, ticket, id)) return
      const known = highest.get(id)
      if (known && value.post.updatedAt < known) {
        error.value = 'Stale post evidence ignored. Reload this read.'
        return
      }
      highest.set(id, value.post.updatedAt)
      detail.value = value
      clearConsent()
      let lock = locks.get(id)
      const recovery = value.latestRecovery
      if (
        lock?.stale &&
        (value.post.updatedAt > lock.expectedUpdatedAt ||
          value.post.contentHash !== lock.expectedContentHash)
      ) {
        locks.delete(id)
        lock = undefined
      }
      if (
        !lock &&
        recovery &&
        recovery.postId === id &&
        (['REQUESTED', 'RUNNING'].includes(recovery.status) || recovery.targetOutcome === 'UNKNOWN')
      ) {
        locks.set(id, {
          expectedUpdatedAt: recovery.expectedUpdatedAt,
          expectedContentHash: recovery.expectedContentHash,
          mode: recovery.mode,
          recoveryId: recovery.id,
        })
        lock = locks.get(id)
      }
      if (recovery?.postId === id) result.value = recovery
      if (
        lock &&
        recovery &&
        recovery.postId === id &&
        recovery.expectedUpdatedAt === lock.expectedUpdatedAt &&
        recovery.expectedContentHash === lock.expectedContentHash &&
        recovery.mode === lock.mode &&
        (lock.recoveryId
          ? recovery.id === lock.recoveryId
          : recovery.id !== lock.previousRecoveryId)
      ) {
        result.value = recovery
        lock.recoveryId = recovery.id
        lock.stale = false
        // This response's target query may precede its terminal recovery query.
        // Latch the first observation; only a later-started read can reconcile.
        observeTerminal(lock, recovery)
      }
      const unrelatedUnresolved =
        recovery &&
        recovery.id !== lock?.recoveryId &&
        (['REQUESTED', 'RUNNING'].includes(recovery.status) || recovery.targetOutcome === 'UNKNOWN')
      if (
        lock?.terminalKnown &&
        !unrelatedUnresolved &&
        started > (lock.terminalAfter ?? Number.POSITIVE_INFINITY) &&
        value.post.updatedAt >= lock.expectedUpdatedAt
      )
        locks.delete(id)
    } catch (failure) {
      if (current(epoch, ticket, id) && !deny(failure))
        error.value = 'Unable to load post investigation. Retry this read; no recovery was resent.'
    } finally {
      if (current(epoch, ticket, id)) pending.value = false
    }
  }
  const capability = computed(() => detail.value?.capabilities.find((c) => c.mode === mode.value))
  const canRecover = computed(
    () =>
      !closed &&
      detail.value?.post.id === postId.value &&
      detail.value.post.updatedAt === highest.get(postId.value) &&
      !pending.value &&
      !busy.value &&
      !unknown.value &&
      !error.value &&
      capability.value?.allowed &&
      confirmed.value &&
      note.value.trim().length > 0 &&
      note.value.trim().length <= 500,
  )
  const recover = async () => {
    if (!canRecover.value || !detail.value) return
    const id = postId.value,
      epoch = generation,
      post = detail.value.post
    const body: RecoveryRequest = {
      expectedUpdatedAt: post.updatedAt,
      expectedContentHash: post.contentHash,
      mode: mode.value,
      note: note.value.trim(),
      confirmed: true,
    }
    locks.set(id, {
      expectedUpdatedAt: post.updatedAt,
      expectedContentHash: post.contentHash,
      mode: mode.value,
      previousRecoveryId: detail.value.latestRecovery?.id,
    })
    const attempt = locks.get(id)
    busy.value = true
    error.value = ''
    result.value = null
    clearConsent()
    try {
      const recovery = await api.ingestionInvestigation.recover(id, body)
      const lock = locks.get(id)
      if (
        lock &&
        lock === attempt &&
        workspaceEpoch === workspace.epoch &&
        recovery.postId === id &&
        recovery.expectedUpdatedAt === lock.expectedUpdatedAt &&
        recovery.expectedContentHash === lock.expectedContentHash &&
        recovery.mode === lock.mode &&
        (lock.recoveryId
          ? recovery.id === lock.recoveryId
          : recovery.id !== lock.previousRecoveryId)
      ) {
        lock.recoveryId = recovery.id
        // A matching receipt can survive child unmount, not attempt replacement
        // or workspace denial. It never restores protected component state.
        observeTerminal(lock, recovery)
      }
      if (closed || epoch !== generation || id !== postId.value) return
      result.value = recovery
      // Always require an explicit fresh read after a mutation, even a known outcome.
    } catch (failure) {
      if (closed || epoch !== generation || id !== postId.value) return
      if (deny(failure)) return
      const code = errorCode(failure)
      if (code === 'CONFLICT' || code === 'PRECONDITION_FAILED' || code === 'TOO_MANY_REQUESTS') {
        const lock = locks.get(id)
        if (lock) lock.stale = true
      }
      error.value =
        code === 'CONFLICT'
          ? 'Post changed. Reload captured evidence; this recovery was not retried.'
          : 'Recovery outcome is unknown. Reconcile by recovery ID or reload this post. Do not resend.'
    } finally {
      if (
        !closed &&
        workspaceEpoch === workspace.epoch &&
        epoch === generation &&
        id === postId.value
      )
        busy.value = false
    }
  }
  const recoveryId = ref('')
  const reconcile = async () => {
    if (closed || busy.value || pending.value || !/^[a-f0-9]{24}$/.test(recoveryId.value)) return
    const id = postId.value,
      epoch = generation,
      ticket = ++request
    pending.value = true
    clearConsent()
    try {
      const value = await api.ingestionInvestigation.recovery(recoveryId.value)
      if (!current(epoch, ticket, id)) return
      if (value.postId !== id) {
        error.value = 'Recovery ID belongs to another post.'
        return
      }
      const lock = locks.get(id)
      if (
        (lock &&
          (lock.recoveryId
            ? lock.recoveryId !== value.id
            : value.id === lock.previousRecoveryId)) ||
        (lock &&
          (value.expectedUpdatedAt !== lock.expectedUpdatedAt ||
            value.expectedContentHash !== lock.expectedContentHash ||
            value.mode !== lock.mode))
      ) {
        error.value = 'Recovery ID does not match the captured attempt. No lock was cleared.'
        return
      }
      result.value = value
      if (lock) {
        lock.recoveryId = value.id
        observeTerminal(lock, value)
      }
      error.value = ''
    } catch (failure) {
      if (current(epoch, ticket, id) && !deny(failure))
        error.value = 'Unable to read recovery. No mutation was sent.'
    } finally {
      if (current(epoch, ticket, id)) pending.value = false
    }
  }
  watch(
    () => workspace.epoch,
    () => {
      closed = true
      generation++
      detail.value = null
      result.value = null
      clearConsent()
    },
    { flush: 'sync' },
  )
  watch(unknown, clearConsent, { flush: 'sync' })
  watch(mode, clearConsent)
  watch(
    postId,
    () => {
      generation++
      request++
      detail.value = null
      result.value = null
      pending.value = false
      busy.value = false
      error.value = ''
      recoveryId.value = ''
      clearConsent()
      void load()
    },
    { immediate: true },
  )
  onBeforeUnmount(() => {
    closed = true
    generation++
  })
  return {
    detail,
    pending,
    busy,
    error,
    note,
    confirmed,
    mode,
    result,
    unknown,
    capability,
    canRecover,
    load,
    recover,
    recoveryId,
    reconcile,
  }
}
