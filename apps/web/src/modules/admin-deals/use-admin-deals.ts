import type { AdminDealsClient } from '@broke-oclock/api-client/admin-deals'
import type {
  AdminDealDetail,
  AdminDealSummary,
  AdminDealsQuery,
} from '@broke-oclock/contracts/admin-deals'
import { rememberAdminFilters } from '@web/lib/admin-filter-preferences'
import { type AdminAttempt, adminRecovery, onAdminIdentityEnd } from '@web/lib/admin-recovery'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { computed, reactive, ref } from 'vue'
export const useAdminDeals = (
  client: AdminDealsClient,
  denied: (code: 'UNAUTHORIZED' | 'FORBIDDEN') => void,
) => {
  const items = ref<AdminDealSummary[]>([]),
    selected = ref<AdminDealDetail | null>(null),
    cursor = ref<string | null>(null)
  const loading = ref(false),
    reading = ref(false),
    pending = ref(false),
    message = ref(''),
    status = ref('closed'),
    target = ref('')
  const filterDefaults = {
    search: '',
    origin: '',
    reviewStatus: '',
    publication: '',
    merchantId: '',
    includeDeleted: false,
  }
  const filterPreferences = rememberAdminFilters('deals', filterDefaults)
  const filters = reactive(filterPreferences.read())
  let appliedFilters = { ...filters }
  const consent = reactive({ note: '', confirmed: false })
  const recovery = adminRecovery('deals')
  const locks = recovery.attempts
  const high = reactive(new Map<string, { c: number; o: number }>())
  let generation = 0,
    listTicket = 0,
    detailTicket = 0,
    alive = true
  const resetConsent = () => {
    consent.note = ''
    consent.confirmed = false
  }
  const fresh = (row: AdminDealSummary) => {
    const previous = high.get(row.id)
    return !previous || (row.contentVersion >= previous.c && row.operationVersion >= previous.o)
  }
  const mark = (row: AdminDealSummary) => {
    if (!fresh(row)) return false
    high.set(row.id, { c: row.contentVersion, o: row.operationVersion })
    return true
  }
  const blocked = computed(
    () =>
      !selected.value ||
      pending.value ||
      reading.value ||
      !!selected.value.deletedAt ||
      !fresh(selected.value) ||
      locks.has(selected.value.id),
  )
  const close = () => {
    generation++
    listTicket++
    detailTicket++
    items.value = []
    selected.value = null
    cursor.value = null
    target.value = ''
    pending.value = false
    reading.value = false
    loading.value = false
    message.value = ''
    resetConsent()
    status.value = 'closed'
    recovery.close()
    high.clear()
  }
  const unsubscribe = onAdminIdentityEnd(close)
  const failure = (error: unknown) => {
    const code = errorCode(error)
    if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') {
      filterPreferences.clear()
      close()
      denied(code)
      return true
    }
    return false
  }
  const load = async (more = false) => {
    if (!alive || (more && (!cursor.value || loading.value))) return
    if (!more) {
      appliedFilters = {
        ...filters,
        search: filters.search.trim(),
        merchantId: filters.merchantId.trim(),
      }
      filterPreferences.save(appliedFilters)
    }
    const ticket = ++listTicket,
      epoch = generation
    loading.value = true
    status.value = 'loading'
    const query = {
      ...Object.fromEntries(
        Object.entries(appliedFilters).filter(
          ([key, value]) => key !== 'includeDeleted' && value !== '',
        ),
      ),
      includeDeleted: appliedFilters.includeDeleted ? 'true' : 'false',
      limit: 20,
      ...(more && cursor.value ? { cursor: cursor.value } : {}),
    } as AdminDealsQuery
    try {
      const page = await client.list(query)
      if (!alive || !recovery.current() || epoch !== generation || ticket !== listTicket) return
      const accepted = page.items.filter(mark)
      items.value = more
        ? [...new Map([...items.value, ...accepted].map((row) => [row.id, row])).values()]
        : accepted
      cursor.value = page.nextCursor
      status.value = 'ready'
      if (selected.value && !fresh(selected.value)) {
        message.value = 'Newer deal evidence exists. Refresh this exact deal before writing.'
        resetConsent()
      }
    } catch (error) {
      if (
        alive &&
        recovery.current() &&
        epoch === generation &&
        ticket === listTicket &&
        !failure(error)
      ) {
        status.value = 'error'
        message.value = 'Unable to load deals. Retry the directory.'
      }
    } finally {
      if (epoch === generation && ticket === listTicket) loading.value = false
    }
  }
  const select = async (id: string, outletCursor?: string) => {
    const ticket = ++detailTicket,
      epoch = generation
    target.value = id
    reading.value = true
    resetConsent()
    if (!outletCursor) selected.value = null
    try {
      const row = await client.detail(id, { limit: 20, ...(outletCursor ? { outletCursor } : {}) })
      if (
        !alive ||
        !recovery.current() ||
        epoch !== generation ||
        ticket !== detailTicket ||
        target.value !== id
      )
        return
      if (!mark(row)) {
        message.value = 'Older detail ignored. Refresh the selected deal.'
        return
      }
      const lock = locks.get(id)
      if (row.id !== id) return
      if (
        lock &&
        !lock.pending &&
        row.contentVersion >= lock.version &&
        row.operationVersion >= (lock.operationVersion ?? 0) &&
        (row.contentVersion > lock.version || row.operationVersion > (lock.operationVersion ?? 0))
      )
        locks.delete(id)
      selected.value = row
      resetConsent()
      message.value = locks.has(id)
        ? 'Deal changed or the outcome is unknown. Writes stay locked until changed authoritative evidence is loaded.'
        : ''
    } catch (error) {
      if (
        alive &&
        recovery.current() &&
        epoch === generation &&
        ticket === detailTicket &&
        !failure(error)
      )
        message.value = 'Unable to load this deal. No edits are available.'
    } finally {
      if (epoch === generation && ticket === detailTicket) reading.value = false
    }
  }
  const write = async (
    operation: (
      id: string,
      envelope: { expectedContentVersion: number; expectedOperationVersion: number; note: string },
    ) => Promise<AdminDealDetail>,
  ) => {
    const row = selected.value
    if (
      !alive ||
      !recovery.current() ||
      !row ||
      blocked.value ||
      !consent.note.trim() ||
      !consent.confirmed
    )
      return
    const id = row.id,
      epoch = generation,
      ticket = detailTicket
    const envelope = {
      expectedContentVersion: row.contentVersion,
      expectedOperationVersion: row.operationVersion,
      note: consent.note.trim(),
    }
    const attempt: AdminAttempt = {
      version: row.contentVersion,
      operationVersion: row.operationVersion,
      unknown: true,
      pending: true,
    }
    locks.set(id, attempt)
    pending.value = true
    resetConsent()
    try {
      const result = await operation(id, envelope)
      const completed = {
        ...attempt,
        pending: false,
        unknown: false,
        receipt: {
          observed: recovery.observe(),
          id: result.id,
          version: result.contentVersion,
          operationVersion: result.operationVersion,
        },
      }
      recovery.settle(id, attempt, completed)
      if (!alive || !recovery.current() || epoch !== generation) return
      if (target.value !== id || ticket !== detailTicket) return // A late success never unlocks a different selection.
      if (result.id === id && mark(result)) {
        recovery.settle(id, completed, null)
        selected.value = result
        items.value = items.value.map((item) => (item.id === id ? result : item))
        message.value = 'Saved. Review the actual state below; approval does not always publish.'
      }
    } catch (error) {
      const code = errorCode(error)
      const unresolved = code === 'CONFLICT' || code === 'INTERNAL_SERVER_ERROR' || !code
      recovery.settle(
        id,
        attempt,
        unresolved ? { ...attempt, pending: false, unknown: code !== 'CONFLICT' } : null,
      )
      if (!alive || !recovery.current() || epoch !== generation) return
      if (failure(error)) return
      if (target.value === id)
        message.value = locks.has(id)
          ? 'Deal changed or the outcome is unknown. Writes stay locked until changed authoritative evidence is loaded.'
          : 'Request rejected. Refresh the evidence and check the required fields; no automatic retry was made.'
    } finally {
      if (epoch === generation) pending.value = false
    }
  }
  const dispose = () => {
    close()
    unsubscribe()
    alive = false
  }
  const clearFilters = () => {
    if (loading.value || pending.value) return
    filterPreferences.clear()
    Object.assign(filters, filterDefaults)
    resetConsent()
    return load()
  }
  return {
    items,
    selected,
    cursor,
    filters,
    clearFilters,
    consent,
    loading,
    reading,
    pending,
    message,
    status,
    blocked,
    load,
    select,
    write,
    close,
    dispose,
    resetConsent,
  }
}
