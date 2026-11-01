import type {
  ModerationComment,
  ModerationReport,
  ModerationTargetType,
} from '@broke-oclock/contracts/admin-moderation'
import { type AdminAttempt, adminRecovery, onAdminIdentityEnd } from '@web/lib/admin-recovery'
import { api } from '@web/lib/api-client'
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
export const useModeration = (denied: (code: 'UNAUTHORIZED' | 'FORBIDDEN') => void) => {
  const mode = ref<'REPORTS' | 'COMMENTS'>('REPORTS'),
    targetType = ref<ModerationTargetType>('COMMENT'),
    status = ref<'OPEN' | 'RESOLVED' | 'DISMISSED'>('OPEN'),
    state = ref<'VISIBLE' | 'HIDDEN' | 'AUTHOR_DELETED'>('VISIBLE'),
    reason = ref(''),
    dealId = ref('')
  const reports = shallowRef<ModerationReport[]>([]),
    comments = shallowRef<ModerationComment[]>([]),
    report = shallowRef<ModerationReport | null>(null),
    comment = shallowRef<ModerationComment | null>(null)
  const nextCursor = ref<string | null>(null),
    loading = ref(false),
    detailLoading = ref(false),
    pending = ref(false),
    error = ref(''),
    notice = ref(''),
    note = ref(''),
    confirmed = ref(false),
    decision = ref<'RESOLVED' | 'DISMISSED'>('RESOLVED')
  let listGeneration = 0,
    detailGeneration = 0,
    alive = true
  const versions = new Map<string, number>()
  const recovery = adminRecovery('moderation')
  const locks = recovery.attempts
  const key = (r: ModerationReport | ModerationComment) =>
    'targetType' in r ? `REPORT:${r.targetType}:${r.id}` : `COMMENT:${r.id}`
  const selected = computed(() => report.value ?? comment.value)
  const resetConsent = () => {
    note.value = ''
    confirmed.value = false
  }
  const clear = () => {
    report.value = null
    comment.value = null
    detailGeneration++
    detailLoading.value = false
    resetConsent()
  }
  const close = () => {
    listGeneration++
    clear()
    reports.value = []
    comments.value = []
    nextCursor.value = null
    recovery.close()
    pending.value = false
    loading.value = false
    error.value = ''
    notice.value = ''
    versions.clear()
  }
  const unsubscribe = onAdminIdentityEnd(close)
  const code = (e: unknown) => (typeof e === 'object' && e && 'code' in e ? String(e.code) : '')
  const rejectAccess = (e: unknown) => {
    const c = code(e)
    if (c === 'UNAUTHORIZED' || c === 'FORBIDDEN') {
      close()
      denied(c)
      return true
    }
    return false
  }
  const accept = (r: ModerationReport | ModerationComment) => {
    const k = key(r),
      old = versions.get(k) ?? -1
    if (r.moderationVersion < old) return false
    versions.set(k, r.moderationVersion)
    return true
  }
  const query = () => ({
    limit: 25,
    ...(dealId.value.trim() ? { dealId: dealId.value.trim() } : {}),
  })
  const load = async (more = false) => {
    if (pending.value) return
    const ticket = ++listGeneration
    loading.value = true
    error.value = ''
    if (!more) {
      clear()
      reports.value = []
      comments.value = []
      nextCursor.value = null
    }
    try {
      if (mode.value === 'REPORTS') {
        const page = await api.adminModeration.reports({
          ...query(),
          targetType: targetType.value,
          status: status.value,
          ...(reason.value ? { reason: reason.value as ModerationReport['reason'] } : {}),
          ...(more && nextCursor.value ? { cursor: nextCursor.value } : {}),
        })
        if (!alive || !recovery.current() || ticket !== listGeneration) return
        reports.value = more ? [...reports.value, ...page.items] : page.items
        page.items.forEach(accept)
        nextCursor.value = page.nextCursor
      } else {
        const page = await api.adminModeration.comments({
          ...query(),
          state: state.value,
          ...(more && nextCursor.value ? { cursor: nextCursor.value } : {}),
        })
        if (!alive || !recovery.current() || ticket !== listGeneration) return
        comments.value = more ? [...comments.value, ...page.items] : page.items
        page.items.forEach(accept)
        nextCursor.value = page.nextCursor
      }
      const s = selected.value
      if (s && s.moderationVersion < (versions.get(key(s)) ?? 0)) {
        clear()
        error.value = 'Selected evidence changed. Inspect it again.'
      }
    } catch (e) {
      if (alive && recovery.current() && ticket === listGeneration && !rejectAccess(e))
        error.value = 'Unable to load queue. Check filters and retry.'
    } finally {
      if (alive && recovery.current() && ticket === listGeneration) loading.value = false
    }
  }
  const inspect = async (row: ModerationReport | ModerationComment) => {
    if (pending.value) return
    const ticket = ++detailGeneration
    report.value = null
    comment.value = null
    detailLoading.value = true
    error.value = ''
    resetConsent()
    try {
      const r =
        'targetType' in row
          ? await api.adminModeration.report(row.targetType, row.id)
          : await api.adminModeration.comment(row.id)
      if (!alive || !recovery.current() || ticket !== detailGeneration) return
      if (!accept(r)) {
        error.value = 'Older evidence ignored. Refresh the queue.'
        return
      }
      const lock = locks.get(key(r))
      if (key(r) !== key(row)) return
      if (lock && !lock.pending && r.moderationVersion > lock.version) locks.delete(key(r))
      if ('targetType' in r) report.value = r
      else comment.value = r
      resetConsent()
    } catch (e) {
      if (alive && recovery.current() && ticket === detailGeneration && !rejectAccess(e))
        error.value = 'Unable to read selected evidence. Retry from the queue.'
    } finally {
      if (alive && recovery.current() && ticket === detailGeneration) detailLoading.value = false
    }
  }
  const lockMessage = computed(() => {
    const s = selected.value
    if (!s) return ''
    const l = locks.get(key(s))
    return l
      ? l.unknown
        ? 'Outcome is unknown. This target is locked until a newer version confirms the result. Never replay the action.'
        : 'Evidence changed. This target stays locked until a newer moderation version is read. Refresh this detail and review again.'
      : ''
  })
  const blocked = computed(
    () =>
      pending.value ||
      detailLoading.value ||
      !selected.value ||
      !confirmed.value ||
      !note.value.trim() ||
      note.value.trim().length > 500 ||
      !!lockMessage.value ||
      !!(report.value && report.value.status !== 'OPEN') ||
      !!comment.value?.deletedAt,
  )
  const submit = async () => {
    if (!alive || !recovery.current() || blocked.value) return
    const r = report.value,
      c = comment.value,
      s = selected.value
    if (!s || (!r && !c)) return
    const k = key(s),
      version = s.moderationVersion,
      ticket = detailGeneration
    const attempt: AdminAttempt = { version, unknown: true, pending: true }
    locks.set(k, attempt)
    pending.value = true
    error.value = ''
    notice.value = ''
    try {
      const result = r
        ? await api.adminModeration.resolve(r.targetType, r.id, {
            expectedVersion: version,
            decision: decision.value,
            resolution: note.value.trim(),
            confirmed: true,
          })
        : await api.adminModeration.visibility(s.id, {
            expectedVersion: version,
            visibility: c?.hiddenAt ? 'VISIBLE' : 'HIDDEN',
            note: note.value.trim(),
            confirmed: true,
          })
      const completed = {
        ...attempt,
        pending: false,
        unknown: false,
        receipt: { observed: recovery.observe(), id: result.id, version: result.moderationVersion },
      }
      recovery.settle(k, attempt, completed)
      if (!alive || !recovery.current() || ticket !== detailGeneration) return
      if (key(result) !== k) return
      accept(result)
      recovery.settle(k, completed, null)
      if ('targetType' in result) report.value = result
      else comment.value = result
      resetConsent()
      notice.value = r
        ? `Report ${decision.value === 'RESOLVED' ? 'resolved' : 'dismissed'}. Content visibility and sibling reports were not changed.`
        : `Comment ${c?.hiddenAt ? 'restored' : 'hidden'}. Reports and votes were not changed.`
    } catch (e) {
      const outcome = code(e)
      recovery.settle(
        k,
        attempt,
        outcome === 'FORBIDDEN' || outcome === 'UNAUTHORIZED' || outcome === 'BAD_REQUEST'
          ? null
          : { ...attempt, pending: false, unknown: outcome !== 'CONFLICT' },
      )
      if (!alive || !recovery.current() || ticket !== detailGeneration) return
      if (outcome === 'FORBIDDEN') {
        close()
        try {
          await api.adminModeration.reports({ targetType: 'COMMENT', limit: 1 })
          if (alive)
            error.value =
              'This operation was refused. Access was rechecked; reload and inspect again.'
        } catch (check) {
          if (alive && !rejectAccess(check))
            error.value = 'Unable to recheck access. Protected evidence remains closed.'
        }
      } else if (outcome === 'UNAUTHORIZED') {
        rejectAccess(e)
      } else {
        resetConsent()
        error.value =
          outcome === 'CONFLICT'
            ? 'Evidence changed. This target stays locked until a newer moderation version is read. Refresh this detail and review again.'
            : 'Outcome is unknown. Do not repeat this action; refresh the detail to investigate.'
      }
    } finally {
      if (alive) pending.value = false
    }
  }
  onMounted(() => load())
  onUnmounted(() => {
    alive = false
    unsubscribe()
    close()
  })
  return {
    mode,
    targetType,
    status,
    state,
    reason,
    dealId,
    reports,
    comments,
    report,
    comment,
    nextCursor,
    loading,
    detailLoading,
    pending,
    error,
    notice,
    note,
    confirmed,
    decision,
    selected,
    blocked,
    lockMessage,
    load,
    inspect,
    submit,
    resetConsent,
  }
}
