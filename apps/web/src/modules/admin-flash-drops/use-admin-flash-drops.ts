import type {
  AdminFlashDrop,
  AdminFlashDropDecision,
  AdminFlashDropsResponse,
  FlashDropView,
} from '@broke-oclock/contracts/flash-drops'
import { onAdminIdentityEnd } from '@web/lib/admin-recovery'
import { ApiClientError } from '@web/lib/api-client'
import { type DecisionKind, decisionsFor } from '@web/modules/admin-flash-drops/flash-drop-format'
import { computed, ref } from 'vue'

export type AdminFlashDropsClient = {
  list: (view: FlashDropView) => Promise<AdminFlashDropsResponse>
  decide: (dropId: string, input: AdminFlashDropDecision) => Promise<AdminFlashDrop>
}
export type DeniedCode = 'UNAUTHORIZED' | 'FORBIDDEN'
export type DecisionProblem = { kind: 'stale' | 'invalid' | 'error'; text: string }
type Counts = AdminFlashDropsResponse['counts']

export const NOTE_LIMIT = 500
const EMPTY_COUNTS: Counts = { review: 0, scheduled: 0, live: 0, ended: 0, claimedToday: 0 }
const STALE_CODES = new Set(['CONFLICT', 'PRECONDITION_FAILED', 'NOT_FOUND'])
const DONE_COPY: Record<DecisionKind, string> = {
  APPROVE: 'Approved. The drop is now scheduled and will go live at its start time.',
  SEND_BACK: 'Sent back. The merchant can see your note and edit the drop.',
  STOP: 'Stopped. The banner is off the map and no more codes can be claimed.',
}

const codeOf = (error: unknown) => (error instanceof ApiClientError ? error.code : undefined)

export const useAdminFlashDrops = (
  client: AdminFlashDropsClient,
  denied: (code: DeniedCode) => void,
) => {
  const view = ref<FlashDropView>('review')
  const items = ref<readonly AdminFlashDrop[]>([])
  const counts = ref<Counts>(EMPTY_COUNTS)
  const status = ref<'idle' | 'loading' | 'ready' | 'error' | 'closed'>('idle')
  const updatedAt = ref<Date | null>(null)
  const selectedId = ref<string | null>(null)
  const decision = ref<DecisionKind>('APPROVE')
  const note = ref('')
  const confirmed = ref(false)
  const pending = ref(false)
  const problem = ref<DecisionProblem | null>(null)
  const notice = ref('')
  let ticket = 0
  let alive = true

  const selected = computed(
    () => items.value.find((drop) => drop.id === selectedId.value) ?? items.value[0] ?? null,
  )
  const choices = computed(() => (selected.value ? decisionsFor(selected.value.status) : []))
  const activeDecision = computed<DecisionKind | null>(() =>
    choices.value.includes(decision.value) ? decision.value : (choices.value[0] ?? null),
  )
  const noteRequired = computed(
    () => activeDecision.value !== null && activeDecision.value !== 'APPROVE',
  )
  const canSubmit = computed(
    () =>
      !pending.value &&
      status.value === 'ready' &&
      activeDecision.value !== null &&
      confirmed.value &&
      note.value.trim().length <= NOTE_LIMIT &&
      (!noteRequired.value || note.value.trim().length > 0),
  )

  const resetForm = () => {
    note.value = ''
    confirmed.value = false
    problem.value = null
  }
  const close = () => {
    ticket++
    items.value = []
    counts.value = EMPTY_COUNTS
    selectedId.value = null
    pending.value = false
    notice.value = ''
    resetForm()
    status.value = 'closed'
  }
  const unsubscribe = onAdminIdentityEnd(close)
  const handleDenied = (error: unknown) => {
    const code = codeOf(error)
    if (code !== 'UNAUTHORIZED' && code !== 'FORBIDDEN') return false
    close()
    denied(code)
    return true
  }

  const load = async (next: FlashDropView = view.value) => {
    if (!alive) return
    const current = ++ticket
    if (next !== view.value) {
      view.value = next
      selectedId.value = null
      resetForm()
    }
    status.value = 'loading'
    try {
      const page = await client.list(next)
      if (!alive || current !== ticket) return
      items.value = page.items
      counts.value = page.counts
      updatedAt.value = new Date()
      status.value = 'ready'
    } catch (error) {
      if (!alive || current !== ticket || handleDenied(error)) return
      status.value = 'error'
    }
  }

  const select = (id: string) => {
    if (pending.value || id === selected.value?.id) return
    selectedId.value = id
    resetForm()
    notice.value = ''
  }
  const choose = (kind: DecisionKind) => {
    if (pending.value || kind === activeDecision.value) return
    decision.value = kind
    confirmed.value = false
    problem.value = null
  }

  const submit = async () => {
    const drop = selected.value
    const kind = activeDecision.value
    if (!alive || !drop || !kind || !canSubmit.value) return
    const epoch = ticket
    pending.value = true
    problem.value = null
    notice.value = ''
    try {
      await client.decide(drop.id, {
        decision: kind,
        note: note.value.trim(),
        version: drop.version,
      })
      if (!alive || epoch !== ticket) return
      resetForm()
      pending.value = false
      notice.value = DONE_COPY[kind]
      // The list read below advances the ticket; the decision itself is already settled.
      await load()
    } catch (error) {
      if (!alive || epoch !== ticket || handleDenied(error)) return
      const code = codeOf(error)
      const message = error instanceof ApiClientError ? error.message : ''
      problem.value = STALE_CODES.has(code ?? '')
        ? {
            kind: 'stale',
            text: `${code === 'CONFLICT' ? 'Someone else changed this drop since you opened it.' : message || 'This drop has changed.'} Refresh to see its current state before deciding.`,
          }
        : code === 'BAD_REQUEST'
          ? { kind: 'invalid', text: message || 'Check the note and try again.' }
          : {
              kind: 'error',
              text: 'The decision could not be saved. Nothing was changed; try again.',
            }
    } finally {
      if (epoch === ticket) pending.value = false
    }
  }

  const refresh = () => {
    notice.value = ''
    problem.value = null
    return load()
  }
  const dispose = () => {
    close()
    unsubscribe()
    alive = false
  }

  return {
    view,
    items,
    counts,
    status,
    updatedAt,
    selected,
    choices,
    activeDecision,
    noteRequired,
    note,
    confirmed,
    pending,
    problem,
    notice,
    canSubmit,
    load,
    refresh,
    select,
    choose,
    submit,
    dispose,
  }
}
