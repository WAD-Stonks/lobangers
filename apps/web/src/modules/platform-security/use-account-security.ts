import { api } from '@web/lib/api-client'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'

export type SecurityProps = {
  userId: string
  accountVersion: number
  disabled?: boolean
  revision?: number
}
export type SecurityEvents = {
  (event: 'busy', value: boolean): void
  (event: 'changed', value: { id: string; version: number }): void
  (event: 'denied', code: string): void
  (event: 'freshnessRequired'): void
}
export type SecurityAccount = Awaited<ReturnType<typeof api.platformSecurity.account>>
export type SecuritySessions = Awaited<ReturnType<typeof api.platformSecurity.sessions>>
export type SecurityContext = Awaited<ReturnType<typeof api.platformSecurity.context>>

export function useAccountSecurity(props: SecurityProps, emit: SecurityEvents) {
  const account = ref<SecurityAccount | null>(null)
  const sessions = ref<SecuritySessions | null>(null)
  const context = ref<SecurityContext | null>(null)
  const note = ref('')
  const confirmed = ref(false)
  const action = ref<'account' | 'session' | 'sessions'>('account')
  const selectedSession = ref('')
  const loadingMore = ref(false)
  const pending = ref(false)
  const loading = ref(false)
  const success = ref('')
  const error = ref('')
  const freshness = ref(false)
  const denied = ref(false)
  const locks = ref(new Map<string, { floor: number; unknown: boolean }>())
  const highest = reactive(new Map<string, number>())
  let generation = 0
  let alive = true
  const safeVersion = computed(() =>
    Math.max(
      props.accountVersion,
      highest.get(props.userId) ?? 0,
      account.value?.version ?? 0,
      sessions.value?.version ?? 0,
    ),
  )
  const currentEvidence = computed(
    () =>
      !!account.value &&
      !!sessions.value &&
      !!context.value &&
      account.value.version === safeVersion.value &&
      sessions.value.version === safeVersion.value,
  )
  const self = computed(() => context.value?.actorUserId === props.userId)
  const uncertain = computed(() => !!locks.value.get(props.userId)?.unknown)
  const blocked = computed(
    () =>
      props.disabled ||
      denied.value ||
      pending.value ||
      loading.value ||
      loadingMore.value ||
      !currentEvidence.value ||
      self.value ||
      freshness.value ||
      context.value?.reauthenticationRequired ||
      locks.value.has(props.userId) ||
      (action.value === 'session' &&
        !sessions.value?.items.some((item) => item.id === selectedSession.value)),
  )
  const accountActionLabel = computed(() =>
    account.value?.state === 'SUSPENDED' ? 'Reinstate' : 'Suspend',
  )
  const actionLabel = computed(() =>
    action.value === 'account'
      ? accountActionLabel.value
      : action.value === 'session'
        ? 'Revoke selected session'
        : 'Revoke all sessions',
  )
  function resetForm() {
    note.value = ''
    confirmed.value = false
  }
  function clearData() {
    account.value = null
    sessions.value = null
    context.value = null
    selectedSession.value = ''
    loadingMore.value = false
    resetForm()
  }
  function current(run: number, id: string) {
    return alive && run === generation && id === props.userId
  }
  function codeOf(cause: unknown) {
    return typeof cause === 'object' &&
      cause !== null &&
      'code' in cause &&
      typeof cause.code === 'string'
      ? cause.code
      : ''
  }
  function accessDenied(cause: unknown) {
    const code = codeOf(cause)
    if (code !== 'UNAUTHORIZED' && code !== 'FORBIDDEN') return false
    ++generation
    denied.value = true
    loading.value = false
    clearData()
    success.value = ''
    error.value = 'Security access was denied.'
    emit('denied', code)
    return true
  }
  async function reload() {
    if (props.disabled || denied.value || pending.value || !alive) return
    const id = props.userId
    const run = ++generation
    const retainedNote = locks.value.get(id)?.unknown ? note.value : ''
    clearData()
    loading.value = true
    error.value = ''
    try {
      const [detail, page, actor] = await Promise.all([
        api.platformSecurity.account(id),
        api.platformSecurity.sessions(id, { limit: 20 }),
        api.platformSecurity.context(),
      ])
      if (!current(run, id)) return
      if (detail.userId !== id || page.userId !== id)
        throw new Error('Unexpected security identity')
      highest.set(
        id,
        Math.max(highest.get(id) ?? 0, props.accountVersion, detail.version, page.version),
      )
      account.value = detail
      sessions.value = page
      context.value = actor
      resetForm()
      const lock = locks.value.get(id)
      if (currentEvidence.value && lock && (!lock.unknown || safeVersion.value > lock.floor))
        locks.value.delete(id)
      else if (lock?.unknown && safeVersion.value <= lock.floor) note.value = retainedNote
    } catch (cause) {
      if (!current(run, id)) return
      if (accessDenied(cause)) return
      clearData()
      note.value = retainedNote
      error.value = 'Unable to load security data. Reload security to try again.'
    } finally {
      if (current(run, id)) loading.value = false
    }
  }
  async function moreSessions() {
    if (
      props.disabled ||
      pending.value ||
      loading.value ||
      loadingMore.value ||
      denied.value ||
      !sessions.value?.nextCursor ||
      !alive
    )
      return
    const id = props.userId
    const run = generation
    const cursor = sessions.value.nextCursor
    loadingMore.value = true
    confirmed.value = false
    try {
      const page = await api.platformSecurity.sessions(id, { limit: 20, cursor })
      if (!current(run, id)) return
      if (page.userId !== id) throw new Error('Unexpected security identity')
      if (page.version < safeVersion.value) {
        error.value = 'Older session evidence was ignored. Reload security.'
        return
      }
      highest.set(id, Math.max(highest.get(id) ?? 0, page.version))
      const rows =
        page.version === sessions.value?.version
          ? [...sessions.value.items, ...page.items]
          : page.items
      sessions.value = {
        ...page,
        items: [...new Map(rows.map((item) => [item.id, item])).values()],
      }
      selectedSession.value = ''
      resetForm()
    } catch (cause) {
      if (!current(run, id) || accessDenied(cause)) return
      error.value = 'Unable to load more sessions. Try again or reload security.'
    } finally {
      if (current(run, id)) loadingMore.value = false
    }
  }
  async function submit() {
    if (
      blocked.value ||
      !confirmed.value ||
      !note.value.trim() ||
      note.value.trim().length > 500 ||
      !account.value
    )
      return
    const id = props.userId
    const run = generation
    const input = {
      expectedVersion: safeVersion.value,
      note: note.value.trim(),
      confirmed: true as const,
    }
    const reinstate = account.value.state === 'SUSPENDED'
    const selectedAction = action.value
    const sessionId = selectedSession.value
    pending.value = true
    emit('busy', true)
    let refresh = false
    try {
      const result = await (selectedAction === 'session'
        ? api.platformSecurity.revokeSession(id, sessionId, input)
        : selectedAction === 'sessions'
          ? api.platformSecurity.revokeSessions(id, input)
          : reinstate
            ? api.platformSecurity.reinstate(id, input)
            : api.platformSecurity.suspend(id, input))
      highest.set(id, Math.max(highest.get(id) ?? 0, result.version))
      if (!current(run, id)) return
      success.value = `Security action completed. Sessions affected: ${result.affectedSessionCount}.`
      resetForm()
      emit('changed', { id: result.id, version: result.version })
      refresh = true
    } catch (cause) {
      const code = codeOf(cause)
      // A superseded write may still have reached the server: retain its identity lock.
      if (code === 'CONFLICT') locks.value.set(id, { floor: input.expectedVersion, unknown: false })
      else if (!['UNAUTHORIZED', 'FORBIDDEN', 'BAD_REQUEST', 'PRECONDITION_FAILED'].includes(code))
        locks.value.set(id, { floor: input.expectedVersion, unknown: true })
      if (!current(run, id)) return
      success.value = ''
      confirmed.value = false
      if (accessDenied(cause)) return
      if (
        code === 'PRECONDITION_FAILED' &&
        typeof cause === 'object' &&
        cause !== null &&
        'message' in cause &&
        cause.message === 'Fresh sign-in required'
      ) {
        freshness.value = true
        emit('freshnessRequired')
      } else if (code === 'CONFLICT') {
        resetForm()
        error.value =
          'Account changed. Reload security and review current evidence before retrying.'
      } else if (code === 'BAD_REQUEST' || code === 'PRECONDITION_FAILED') {
        error.value = 'Security action was refused. Review the reason and current evidence.'
      } else {
        error.value =
          'Result unknown. Do not repeat this action; reload security and wait for a newer account version.'
      }
    } finally {
      pending.value = false
      emit('busy', false)
    }
    if (refresh && alive && props.userId === id) await reload()
  }
  watch(
    () => [props.userId, props.revision] as const,
    (_value, old) => {
      ++generation
      loading.value = false
      clearData()
      if (old?.[0] !== props.userId) success.value = ''
      error.value = ''
      if (!pending.value) void reload()
    },
    { immediate: true, flush: 'sync' },
  )
  watch(
    () => [props.userId, props.accountVersion] as const,
    ([, version]) => {
      if (version > (highest.get(props.userId) ?? 0)) {
        highest.set(props.userId, version)
        resetForm()
      }
    },
    { immediate: true, flush: 'pre' },
  )
  watch(
    () => props.disabled,
    (disabled) => {
      if (pending.value) return
      ++generation
      loading.value = false
      clearData()
      if (!disabled) void reload()
    },
    { flush: 'sync' },
  )
  onBeforeUnmount(() => {
    alive = false
    ++generation
    clearData()
  })
  watch([action, selectedSession], resetForm, { flush: 'sync' })
  return {
    account,
    sessions,
    context,
    action,
    selectedSession,
    loadingMore,
    note,
    confirmed,
    pending,
    loading,
    success,
    error,
    blocked,
    currentEvidence,
    safeVersion,
    self,
    uncertain,
    freshness,
    accountActionLabel,
    actionLabel,
    reload,
    moreSessions,
    submit,
  }
}
