import {
  type PlatformAuditEntry,
  type PlatformAuditQuery,
  type PlatformAuditResponse,
  platformAuditQuerySchema,
} from '@broke-oclock/contracts/platform-admin'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { reactive, ref } from 'vue'

export type AuditList = (input?: PlatformAuditQuery) => Promise<PlatformAuditResponse>
export type AuditDenial = 'UNAUTHORIZED' | 'FORBIDDEN'
type AuditStatus = 'loading' | 'ready' | 'error' | 'closed' | AuditDenial
const emptyFilters = () => ({
  userId: '',
  actorId: '',
  action: '',
  subjectType: '',
  subjectId: '',
  from: '',
  until: '',
})

export const useAudit = (list: AuditList, denied: (code: AuditDenial) => void = () => {}) => {
  const filters = reactive(emptyFilters())
  const items = ref<PlatformAuditEntry[]>([])
  const nextCursor = ref<string | null>(null)
  const status = ref<AuditStatus>('closed')
  const loading = ref(false)
  const validation = ref('')
  let generation = 0
  let alive = true
  let active: PlatformAuditQuery = { limit: 25 }
  let retryMore = false
  const close = (state: AuditStatus = 'closed') => {
    generation++
    items.value = []
    nextCursor.value = null
    loading.value = false
    validation.value = ''
    status.value = state
    active = { limit: 25 }
    Object.assign(filters, emptyFilters())
  }
  const load = async (more = false) => {
    if (!alive || (more && (loading.value || !nextCursor.value))) return
    const previous = more ? items.value : []
    const query = { ...active, ...(more && nextCursor.value ? { cursor: nextCursor.value } : {}) }
    const ticket = ++generation
    retryMore = more
    loading.value = true
    status.value = 'loading'
    if (!more) {
      items.value = []
      nextCursor.value = null
    }
    try {
      const page = await list(query)
      if (!alive || ticket !== generation) return
      items.value = [...new Map([...previous, ...page.items].map((row) => [row.id, row])).values()]
      nextCursor.value = page.nextCursor
      status.value = 'ready'
    } catch (failure) {
      if (!alive || ticket !== generation) return
      const code = errorCode(failure)
      if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') {
        close(code)
        denied(code)
      } else status.value = 'error'
    } finally {
      if (alive && ticket === generation) loading.value = false
    }
  }
  const apply = async () => {
    const input = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''))
    const parsed = platformAuditQuerySchema.safeParse({ ...input, limit: 25 })
    if (!parsed.success) {
      validation.value =
        'Check IDs and supply both UTC dates, with a positive interval of at most 90 days. A subject ID also requires its type.'
      return
    }
    validation.value = ''
    active = parsed.data
    await load()
  }
  const reset = async () => {
    close()
    await load()
  }
  const retry = () => load(retryMore)
  const dispose = () => {
    close()
    alive = false
  }
  return {
    filters,
    items,
    nextCursor,
    status,
    loading,
    validation,
    load,
    apply,
    reset,
    retry,
    close,
    dispose,
  }
}
