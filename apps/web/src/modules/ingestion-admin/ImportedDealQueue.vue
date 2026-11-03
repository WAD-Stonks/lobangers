<script setup lang="ts">
import { type IngestionDraft, type IngestionDraftsQuery, ingestionDraftsQuerySchema } from '@broke-oclock/contracts/ingestion'
import AppSelect from '@web/components/AppSelect.vue'
import AdminStatusBadge from '@web/components/admin/AdminStatusBadge.vue'
import AdminTaskLink from '@web/components/admin/AdminTaskLink.vue'
import type { SelectOption } from '@web/components/select-options'
import TicketLoading from '@web/components/TicketLoading.vue'
import { onAdminIdentityEnd } from '@web/lib/admin-recovery'
import { createAdminReadFence } from '@web/lib/admin-session'
import { adminDealHref, adminRecordId } from '@web/lib/admin-workflow-links'
import { api } from '@web/lib/api-client'
import { formatDate, formatOfferType } from '@web/lib/format'
import DraftImages from '@web/modules/ingestion-admin/DraftImages.vue'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { type LocationQueryRaw, routeLocationKey, routerKey } from 'vue-router'

const STATUS_OPTIONS: readonly SelectOption[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
]

type DraftStatus = IngestionDraftsQuery['status']
type QueueRow = { draft: IngestionDraft; cursor?: string }
const props = defineProps<{ revision: number; initialStatus?: DraftStatus; initialCursor?: string; initialDraftId?: string }>()
const emit = defineEmits<{ denied: [code: string]; busy: [value: boolean] }>()
const route = inject(routeLocationKey, null)
const router = inject(routerKey, null)
const fence = createAdminReadFence()
const queueRoot = ref<HTMLElement | null>(null)
const rows = ref<QueueRow[]>([])
const nextCursor = ref<string | null>(null)
const status = ref<DraftStatus>('PENDING')
const pending = ref(false)
const loaded = ref(false)
const closed = ref(false)
const error = ref('')
const linkNotice = ref('')
const selectedId = ref<string | undefined>()
let appliedContext = ''
let focusedId = ''
let retryPage: { cursor?: string; more: boolean } = { more: false }
const visitedCursors = new Set<string>()
const readStatus = (value: unknown): DraftStatus => value === 'APPROVED' || value === 'REJECTED' ? value : 'PENDING'
const contextKey = (value: DraftStatus, cursor?: string, draftId?: string) => JSON.stringify([props.revision, value, cursor, draftId])
const missingSelection = computed(() => loaded.value && selectedId.value && !rows.value.some(row => row.draft.id === selectedId.value))
const close = () => {
  fence.invalidate()
  closed.value = true
  rows.value = []
  nextCursor.value = null
  pending.value = false
  loaded.value = false
  selectedId.value = undefined
  error.value = ''
  linkNotice.value = ''
  visitedCursors.clear()
}
const unsubscribe = onAdminIdentityEnd(close)
watch(pending, value => emit('busy', value), { immediate: true, flush: 'sync' })
const load = async (cursor?: string, more = false) => {
  if (closed.value || (more && pending.value)) return
  retryPage = { cursor, more }
  const parsed = ingestionDraftsQuerySchema.safeParse({ limit: 20, status: status.value, ...(cursor !== undefined ? { cursor } : {}) })
  if (!parsed.success) {
    error.value = 'This queue link is invalid. Choose a review status to start again.'
    return
  }
  const ticket = fence.begin()
  pending.value = true
  error.value = ''
  if (!more) {
    rows.value = []
    nextCursor.value = null
    loaded.value = false
  }
  try {
    const result = await api.ingestion.drafts(parsed.data)
    if (!fence.current(ticket)) return
    const merged = new Map((more ? rows.value : []).map(row => [row.draft.id, row]))
    for (const draft of result.items) {
      const previous = merged.get(draft.id)
      merged.set(draft.id, { draft, cursor: previous ? previous.cursor : cursor })
    }
    rows.value = [...merged.values()]
    if (cursor) visitedCursors.add(cursor)
    const candidate = adminRecordId(result.nextCursor)
    nextCursor.value = candidate && !visitedCursors.has(candidate) ? candidate : null
    loaded.value = true
    await nextTick()
    if (!fence.current(ticket) || !selectedId.value || focusedId === selectedId.value) return
    const link = queueRoot.value?.querySelector<HTMLAnchorElement>(`[data-testid="open-imported-${selectedId.value}"]`)
    if (link) {
      focusedId = selectedId.value
      link.focus({ preventScroll: true })
      link.scrollIntoView?.({ block: 'nearest' })
    }
  } catch (failure) {
    if (!fence.current(ticket)) return
    const code = errorCode(failure)
    if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') {
      close()
      emit('denied', code)
    } else error.value = 'Unable to load imported deals. Please retry.'
  } finally {
    if (fence.current(ticket)) pending.value = false
  }
}
const initialize = (value: DraftStatus, cursor?: string, draftId?: string) => {
  if (closed.value) return
  const key = contextKey(value, cursor, draftId)
  if (appliedContext === key) return
  appliedContext = key
  fence.invalidate()
  rows.value = []
  nextCursor.value = null
  pending.value = false
  loaded.value = false
  error.value = ''
  status.value = value
  selectedId.value = adminRecordId(draftId)
  focusedId = ''
  linkNotice.value = draftId !== undefined && !selectedId.value ? 'The linked imported deal ID is invalid.' : ''
  visitedCursors.clear()
  void load(cursor)
}
watch(() => [props.revision, props.initialStatus, props.initialCursor, props.initialDraftId], () => {
  initialize(readStatus(props.initialStatus), props.initialCursor, props.initialDraftId)
}, { immediate: true })
const filterStatus = (next: string) => {
  if (closed.value) return
  const value = readStatus(next)
  initialize(value)
  if (!router || !route) return
  const query: LocationQueryRaw = { ...route.query, status: value }
  delete query.draftCursor
  delete query.draftId
  delete query.postId
  void router.replace({ query, hash: '#queue-title' })
}
const dealHref = ({ draft, cursor }: QueueRow) => {
  const query = new URLSearchParams({ status: status.value, draftId: draft.id })
  if (cursor) query.set('draftCursor', cursor)
  return adminDealHref({ dealId: draft.id, tab: 'content', returnTo: `/admin/ingestion?${query}#queue-title` })
}
const validity = (draft: IngestionDraft) => {
  if (!draft.validFrom || !draft.validUntil) return 'Validity needs clarification'
  const from = Date.parse(draft.validFrom)
  const until = Date.parse(draft.validUntil)
  if (!Number.isFinite(from) || !Number.isFinite(until) || from >= until) return 'Invalid validity dates'
  return `${until <= Date.now() ? 'Expired · ' : ''}${formatDate(draft.validFrom)} – ${formatDate(draft.validUntil)}`
}
onBeforeUnmount(() => { close(); unsubscribe(); fence.dispose(); emit('busy', false) })
</script>

<template>
  <section ref="queueRoot" aria-labelledby="queue-title" class="card p-3 p-sm-4 mb-4 imported-queue" :aria-busy="pending">
    <header class="imported-queue-header">
      <div><h2 id="queue-title" tabindex="-1">Imported deals</h2><p>Choose an import to correct its content, confirm its scope and complete its review in Deals.</p></div>
      <div class="imported-status-filter"><label for="queue-status">Review status</label><AppSelect id="queue-status" class="form-select" :model-value="status" :options="STATUS_OPTIONS" :disabled="closed" @change="filterStatus" /></div>
    </header>
    <p v-if="closed" role="status">Imported deal access is closed. Recheck your session before reloading.</p>
    <template v-else>
      <p v-if="linkNotice" role="alert">{{ linkNotice }}</p>
      <p v-if="missingSelection" role="status">The linked imported deal is no longer on this page. It may have moved to another review status.</p>
      <TicketLoading v-if="pending" label="Loading imported deals…" />
      <div v-if="error" role="alert"><p>{{ error }}</p><button type="button" class="btn btn-outline-primary" data-testid="retry-imported-deals" :disabled="pending" @click="load(retryPage.cursor, retryPage.more)">Retry imported deals</button></div>
      <p v-if="loaded && !pending && !error" class="small text-secondary">{{ rows.length }} imported deals loaded</p>
      <p v-if="loaded && !rows.length && !pending && !error">No imported deals match this status.</p>
      <ul v-if="rows.length" class="imported-deal-list">
        <li v-for="row in rows" :key="row.draft.id" class="imported-deal-card" :class="{ 'is-current': selectedId === row.draft.id }">
          <header><p class="imported-deal-source">{{ row.draft.sourceName }}</p><AdminStatusBadge :status="row.draft.reviewStatus" /></header>
          <h3>{{ row.draft.title }}</h3>
          <dl><div><dt>Offer</dt><dd>{{ formatOfferType(row.draft.offerType) }}</dd></div><div><dt>Category</dt><dd>{{ row.draft.category }}</dd></div><div><dt>Validity</dt><dd>{{ validity(row.draft) }}</dd></div></dl>
          <details v-if="row.draft.images?.length" class="imported-deal-images"><summary>Source images</summary><DraftImages :images="row.draft.images" :title="row.draft.title" /></details>
          <AdminTaskLink :to="dealHref(row)" class="btn btn-outline-primary imported-deal-next" :data-testid="`open-imported-${row.draft.id}`" :aria-current="selectedId === row.draft.id ? 'true' : undefined">Open in Deals <span aria-hidden="true">→</span></AdminTaskLink>
        </li>
      </ul>
      <button v-if="nextCursor" type="button" class="btn btn-outline-primary mt-3" data-testid="more-imported-deals" :disabled="pending" @click="load(nextCursor ?? undefined, true)">Load more imported deals</button>
    </template>
  </section>
</template>

<style scoped>
.imported-queue { min-width: 0; }
.imported-queue-header { display: flex; align-items: start; justify-content: space-between; gap: 24px; margin-bottom: 20px; }
.imported-queue-header h2 { font-size: 1.5rem; }
.imported-queue-header p { max-width: 64ch; margin: 8px 0 0; color: var(--admin-muted); }
.imported-status-filter { display: grid; gap: 6px; min-width: 180px; font-size: .875rem; font-weight: 600; }
.imported-deal-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 16px; padding: 0; list-style: none; }
.imported-deal-card { min-width: 0; padding: 20px; border: 1px solid var(--admin-border); border-radius: 18px; background: var(--admin-surface); overflow-wrap: anywhere; }
.imported-deal-card.is-current { border-color: var(--admin-accent); box-shadow: 0 0 0 2px var(--admin-accent-soft); }
.imported-deal-card header { display: flex; align-items: start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.imported-deal-source { margin: 0; color: var(--admin-muted); font-size: .8125rem; }
.imported-deal-card h3 { margin: 0 0 16px; font-size: 1.125rem; line-height: 1.45; }
.imported-deal-card dl { display: grid; gap: 10px; margin: 0; font-size: .875rem; }
.imported-deal-card dl div { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 12px; }
.imported-deal-card dt { color: var(--admin-muted); font-weight: 500; }
.imported-deal-card dd { margin: 0; }
.imported-deal-next { margin: 16px 0 0; font-size: .875rem; }
.imported-deal-images { margin-top: 16px; }
.imported-deal-images > summary { cursor: pointer; font-size: .875rem; font-weight: 600; }
@media (max-width: 575.98px) { .imported-queue-header { flex-direction: column; gap: 16px; } .imported-status-filter { width: 100%; min-width: 0; } .imported-deal-card { padding: 16px; } }
</style>
