<script setup lang="ts">
import { DEAL_CATEGORIES, type DealCategory, dealCategorySchema } from '@broke-oclock/contracts/deal-categories'
import type { IngestionDraft, IngestionDraftsQuery, IngestionReviewRequest } from '@broke-oclock/contracts/ingestion'
import type { PlatformVenue } from '@broke-oclock/contracts/platform-admin'
import { BButton } from '@broke-oclock/ui'
import AppSelect from '@web/components/AppSelect.vue'
import AdminStatusBadge from '@web/components/admin/AdminStatusBadge.vue'
import AdminWorkspace from '@web/components/admin/AdminWorkspace.vue'
import { optionsFromValues, type SelectOption } from '@web/components/select-options'
import TicketLoading from '@web/components/TicketLoading.vue'
import { api } from '@web/lib/api-client'
import { formatDate, formatMoneyMinor, formatOfferType } from '@web/lib/format'
import DraftEvidence from '@web/modules/ingestion-admin/DraftEvidence.vue'
import DraftImages from '@web/modules/ingestion-admin/DraftImages.vue'
import { approvalBlockReason } from '@web/modules/ingestion-admin/draft-validity'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import PostInvestigation from '@web/modules/ingestion-admin/PostInvestigation.vue'
import { clearRecoveryWorkspace, useRecoveryWorkspace } from '@web/modules/ingestion-admin/recovery-workspace'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

const workspace = useRecoveryWorkspace()
type Draft = IngestionDraft
const props = defineProps<{ revision: number; initialStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' }>()
const emit = defineEmits<{ changed: []; denied: [code: string]; busy: [value: boolean] }>()
const status = ref<IngestionDraftsQuery['status']>(['PENDING', 'APPROVED', 'REJECTED'].includes(props.initialStatus ?? '') ? props.initialStatus ?? 'PENDING' : 'PENDING')
const items = ref<Draft[] | null>(null)
const selectedId = ref<string | null>(null)
const selected = computed(() => items.value?.find(item => item.id === selectedId.value))
const investigationId = ref<string | null>(null)
const investigationBusy = ref(false)
const detailHeading = ref<HTMLElement | null>(null)
const queueHeading = ref<HTMLElement | null>(null)
const pending = ref(false)
const nextCursor = ref<string | null>(null)
const error = ref('')
const note = ref('')
const reviewPending = ref(false)
const reviewError = ref('')
const success = ref('')
const outletQuery = ref('')
const venues = ref<PlatformVenue[] | null>(null)
const venueId = ref('')
const confirmed = ref(false)
const rejectConfirmed = ref(false)
const venueCursor = ref<string | null>(null)
const venuePending = ref(false)
const associationPending = ref(false)
const outletError = ref('')
const category = ref('')
const STATUS_OPTIONS: readonly SelectOption[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
]
const CATEGORY_OPTIONS = optionsFromValues(DEAL_CATEGORIES)
const outletOptions = computed<readonly SelectOption[]>(() => [
  { value: '', label: 'Choose an outlet explicitly' },
  ...(venues.value ?? []).map((venue) => ({
    value: venue.id,
    label: `${venue.name} · ${venue.address} · ${venue.merchantName}`,
    disabled: venue.id === selected.value?.outlet?.id,
  })),
])
const categoryPending = ref(false)
const categoryError = ref('')
const busy = computed(() => reviewPending.value || associationPending.value || categoryPending.value || investigationBusy.value)
watch(busy, value => emit('busy', value), { immediate: true, flush: 'sync' })
const locks = ref(new Map<string, { version: number; operationVersion: number; after: number }>())
const highest = new Map<string, Draft>()
const activeWrites = new Set<string>()
const conflict = computed(() => selectedId.value !== null && locks.value.has(selectedId.value))
const conflictMessage = 'Content changed. Reload the draft before reviewing again.'
let generation = 0
let request = 0
let venueRequest = 0
let evidenceClock = 0
let closed = false
const live = (epoch: number) => !closed && epoch === generation
const lock = (id: string, version: number, operationVersion = highest.get(id)?.operationVersion ?? 0) => {
  locks.value.set(id, { version: Math.max(version, locks.value.get(id)?.version ?? 0, highest.get(id)?.contentVersion ?? 0), operationVersion: Math.max(operationVersion, locks.value.get(id)?.operationVersion ?? 0, highest.get(id)?.operationVersion ?? 0), after: ++evidenceClock })
}
const clearOutlets = () => {
  ++venueRequest; venuePending.value = false
  outletQuery.value = ''; venues.value = null; venueId.value = ''; confirmed.value = false
  venueCursor.value = null; outletError.value = ''
}
const close = () => {
  closed = true; ++generation; ++request; clearOutlets()
  items.value = null; selectedId.value = null; investigationId.value = null; note.value = ''; nextCursor.value = null
  pending.value = false; reviewPending.value = false; associationPending.value = false; categoryPending.value = false
  error.value = ''; reviewError.value = ''; success.value = ''; categoryError.value = ''; category.value = ''
  locks.value.clear(); highest.clear(); activeWrites.clear()
}
const denied = (failure: unknown) => {
  const code = errorCode(failure)
  if (code !== 'UNAUTHORIZED' && code !== 'FORBIDDEN') return false
  clearRecoveryWorkspace(workspace); close(); emit('denied', code); return true
}
onBeforeUnmount(() => { close(); emit('busy', false) })
const sourceLink = computed(() => {
  if (!selected.value) return null
  try {
    const url = new URL(selected.value.sourceUrl)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch { return null }
})
const approvalReason = computed(() => approvalBlockReason(selected.value))
const canReview = computed(() => !closed && selected.value?.reviewStatus === 'PENDING' && note.value.trim().length > 0 && note.value.trim().length <= 1000 && !busy.value && !venuePending.value && !pending.value && !error.value && !conflict.value)
const categoryAllowed = computed(() => selected.value?.reviewStatus === 'PENDING')
const canSetCategory = computed(() => !closed && categoryAllowed.value && dealCategorySchema.safeParse(category.value).success && category.value !== selected.value?.category && !busy.value && !pending.value && !venuePending.value && !error.value && !conflict.value)
const associationAllowed = computed(() => selected.value?.reviewStatus === 'PENDING' && (selected.value.outletCount ?? selected.value.outlets?.length ?? 0) <= 1 && ['NO_FIXED_LOCATION', 'SELECTED_OUTLETS'].includes(selected.value.applicability))
const chosenVenue = computed(() => venues.value?.find(item => item.id === venueId.value))
const canAssociate = computed(() => !closed && associationAllowed.value && chosenVenue.value && chosenVenue.value.id !== selected.value?.outlet?.id && confirmed.value && !busy.value && !pending.value && !venuePending.value && !error.value && !conflict.value)
const load = async (cursor?: string) => {
  if (closed || busy.value || (cursor && (pending.value || venuePending.value))) return
  if (!cursor) nextCursor.value = null
  const current = ++request
  const epoch = generation
  const started = ++evidenceClock
  pending.value = true; error.value = ''
  try {
    const result = await api.ingestion.drafts({ limit: 20, status: status.value, ...(cursor ? { cursor } : {}) })
    if (!live(epoch) || current !== request) return
    const previous = selected.value
    const wasConflicted = conflict.value
    const accepted = result.items.map(draft => {
      const known = highest.get(draft.id)
      if (known && (draft.contentVersion < known.contentVersion || (draft.operationVersion ?? 0) < (known.operationVersion ?? 0))) return known
      highest.set(draft.id, draft)
      const guard = locks.value.get(draft.id)
      if (guard && draft.contentVersion >= guard.version && (draft.operationVersion ?? 0) >= guard.operationVersion && started > guard.after && !activeWrites.has(draft.id)) locks.value.delete(draft.id)
      return draft
    })
    items.value = [...new Map([...(cursor ? items.value ?? [] : []), ...accepted].map(item => [item.id, item])).values()]
    nextCursor.value = result.nextCursor === cursor ? null : result.nextCursor
    if (!cursor && selectedId.value && !selected.value) { selectedId.value = null; note.value = ''; clearOutlets() }
    if (previous && selected.value && (previous.contentVersion !== selected.value.contentVersion || previous.operationVersion !== selected.value.operationVersion || (wasConflicted && !conflict.value))) {
      note.value = ''; clearOutlets()
      reviewError.value = 'Draft content changed. Read it again and enter a new review note.'
    } else if (conflict.value) reviewError.value = conflictMessage
    else if (!cursor || result.items.some(item => item.id === selectedId.value)) reviewError.value = ''
  } catch (failure) {
    if (!live(epoch) || current !== request) return
    if (denied(failure)) return
    error.value = 'Unable to load drafts. Please retry.'
  } finally { if (live(epoch) && current === request) pending.value = false }
}
const select = (draft: Draft) => {
  if (closed || busy.value || pending.value || error.value || (conflict.value && selectedId.value === draft.id)) return
  clearOutlets(); investigationId.value = null; selectedId.value = draft.id; note.value = ''
  category.value = draft.category; categoryError.value = ''
  reviewError.value = conflict.value ? conflictMessage : ''; success.value = ''
  void nextTick(() => {
    detailHeading.value?.focus({ preventScroll: true })
    detailHeading.value?.scrollIntoView?.({ block: 'nearest' })
  })
}
const closeSelection = () => {
  if (busy.value || venuePending.value) return
  selectedId.value = null; investigationId.value = null; note.value = ''; reviewError.value = ''
  clearOutlets()
  void nextTick(() => queueHeading.value?.focus({ preventScroll: true }))
}
const searchOutlets = async (cursor?: string) => {
  if (closed || !selected.value || !associationAllowed.value || busy.value || pending.value || venuePending.value || conflict.value || error.value || outletQuery.value.trim().length > 100) return
  const current = ++venueRequest
  const epoch = generation
  const id = selected.value.id
  const version = selected.value.contentVersion
  const operationVersion = selected.value.operationVersion ?? 0
  venuePending.value = true; outletError.value = ''; venueId.value = ''; confirmed.value = false
  if (!cursor) { venues.value = null; venueCursor.value = null }
  const valid = () => live(epoch) && current === venueRequest && selected.value?.id === id && selected.value.contentVersion === version && (selected.value.operationVersion ?? 0) === operationVersion
  try {
    const result = await api.platformAdmin.venues({ search: outletQuery.value.trim(), limit: 20, ...(cursor ? { cursor } : {}) })
    if (!valid()) return
    venues.value = [...new Map([...(cursor ? venues.value ?? [] : []), ...result.items].map(item => [item.id, item])).values()]
    venueCursor.value = result.nextCursor === cursor ? null : result.nextCursor
    venueId.value = ''; confirmed.value = false
  } catch (failure) {
    if (!valid()) return
    if (denied(failure)) return
    outletError.value = 'Unable to search existing outlets. Please retry.'
  } finally { if (valid()) venuePending.value = false }
}
const associate = async () => {
  if (!canAssociate.value || !selected.value || !chosenVenue.value) return
  const id = selected.value.id
  const expectedContentVersion = selected.value.contentVersion
  const expectedOperationVersion = selected.value.operationVersion ?? 0
  const targetVenueId = chosenVenue.value.id
  const epoch = generation
  activeWrites.add(id); lock(id, expectedContentVersion)
  associationPending.value = true; outletError.value = ''; success.value = ''
  try {
    const result = await api.ingestion.associateDraftOutlet(id, { expectedContentVersion, expectedOperationVersion, venueId: targetVenueId })
    if (closed) return
    lock(id, Math.max(expectedContentVersion + 1, result.contentVersion), Math.max(expectedOperationVersion + 1, result.operationVersion ?? 0))
    if (!live(epoch) || selectedId.value !== id) return
    note.value = ''; clearOutlets(); reviewError.value = conflictMessage
    success.value = 'Outlet associated. The draft remains pending. Reload and review the new version.'
    emit('changed')
  } catch (failure) {
    if (closed) return
    lock(id, expectedContentVersion)
    if (!live(epoch)) return
    if (denied(failure)) return
    if (selectedId.value === id) {
      note.value = ''; clearOutlets(); reviewError.value = conflictMessage
      outletError.value = 'Unable to confirm the association. Reload fresh draft evidence before retrying.'
    }
  } finally {
    activeWrites.delete(id)
    if (live(epoch)) associationPending.value = false
  }
}
const setCategory = async () => {
  if (!canSetCategory.value || !selected.value) return
  const id = selected.value.id
  const expectedContentVersion = selected.value.contentVersion
  const expectedOperationVersion = selected.value.operationVersion ?? 0
  const chosen = category.value as DealCategory
  const epoch = generation
  activeWrites.add(id); lock(id, expectedContentVersion)
  categoryPending.value = true; categoryError.value = ''; success.value = ''
  try {
    const result = await api.ingestion.setDraftCategory(id, { expectedContentVersion, expectedOperationVersion, category: chosen })
    if (closed) return
    lock(id, Math.max(expectedContentVersion + 1, result.contentVersion), Math.max(expectedOperationVersion + 1, result.operationVersion ?? 0))
    if (!live(epoch) || selectedId.value !== id) return
    note.value = ''; clearOutlets(); reviewError.value = conflictMessage
    success.value = 'Category updated. The draft remains pending. Reload and review the new version.'
    emit('changed')
  } catch (failure) {
    if (closed) return
    lock(id, expectedContentVersion)
    if (!live(epoch)) return
    if (denied(failure)) return
    if (selectedId.value === id) {
      note.value = ''; clearOutlets(); reviewError.value = conflictMessage
      categoryError.value = 'Unable to update the category. Reload fresh draft evidence before retrying.'
    }
  } finally {
    activeWrites.delete(id)
    if (live(epoch)) categoryPending.value = false
  }
}
const priceText = (draft: Pick<Draft, 'priceMinor' | 'currency'>) => {
  if (draft.priceMinor === null || draft.priceMinor === undefined) return 'Price not supplied'
  const raw = `${draft.priceMinor} minor units · ${draft.currency ?? 'Unknown currency'}`
  if (!draft.currency) return raw
  try {
    return `${formatMoneyMinor(draft.priceMinor, draft.currency)} (${raw})`
  } catch {
    return raw
  }
}
const review = async (decision: IngestionReviewRequest['decision']) => {
  if (!canReview.value || !selected.value) return
  if (decision === 'REJECT' && !rejectConfirmed.value) return
  if (decision === 'APPROVE') {
    const reason = approvalBlockReason(selected.value)
    if (reason) { reviewError.value = reason; return }
  }
  const id = selected.value.id
  const expectedContentVersion = selected.value.contentVersion
  const expectedOperationVersion = selected.value.operationVersion ?? 0
  const reviewNote = note.value.trim()
  const epoch = generation
  activeWrites.add(id)
  reviewPending.value = true; reviewError.value = ''; success.value = ''
  try {
    await api.ingestion.reviewDraft(id, { expectedContentVersion, expectedOperationVersion, decision, note: reviewNote })
    if (closed) return
    if (!live(epoch)) { lock(id, expectedContentVersion); return }
    if (selectedId.value !== id) return
    success.value = decision === 'APPROVE' ? 'Draft approved.' : 'Draft rejected.'
    selectedId.value = null; note.value = ''; clearOutlets(); emit('changed')
  } catch (failure) {
    if (closed) return
    if (!live(epoch)) { lock(id, expectedContentVersion); return }
    if (denied(failure)) return
    if (errorCode(failure) === 'CONFLICT') lock(id, expectedContentVersion)
    if (selectedId.value === id) reviewError.value = conflict.value ? conflictMessage : 'Unable to review draft. Please try again.'
  } finally {
    activeWrites.delete(id)
    if (live(epoch)) reviewPending.value = false
  }
}
watch(() => props.initialStatus, value => {
  status.value = value === 'APPROVED' || value === 'REJECTED' ? value : 'PENDING'
}, { flush: 'sync' })
watch(venueId, () => { confirmed.value = false }, { flush: 'sync' })
watch([selectedId, () => selected.value?.contentVersion, () => selected.value?.operationVersion, conflict, () => note.value.trim() === ''], () => { rejectConfirmed.value = false }, { flush: 'sync' })
watch(outletQuery, () => { venues.value = null; venueId.value = ''; confirmed.value = false; venueCursor.value = null }, { flush: 'sync' })
watch([() => props.revision, status], (_value, previous) => {
  if (closed) return
  ++generation; ++request; clearOutlets(); note.value = ''
  for (const id of activeWrites) lock(id, highest.get(id)?.contentVersion ?? 1)
  reviewPending.value = false; associationPending.value = false; categoryPending.value = false
  if (previous && previous[1] !== status.value) { selectedId.value = null; note.value = ''; items.value = null; reviewError.value = ''; success.value = '' }
  void load()
}, { immediate: true, flush: 'sync' })
</script>

<template>
  <section aria-labelledby="queue-title" class="draft-workspace" :aria-busy="pending">
    <header class="draft-toolbar">
      <div><h2 id="queue-title" ref="queueHeading" tabindex="-1">Draft review queue</h2><p>Choose a draft to inspect its source, offer and review requirements.</p></div>
      <div class="draft-status-filter"><label for="queue-status">Review status</label>
        <AppSelect id="queue-status" v-model="status" :options="STATUS_OPTIONS" class="form-select" :disabled="busy || venuePending" />
      </div>
    </header>
    <TicketLoading v-if="pending" label="Loading drafts…" />
    <div v-if="error" role="alert"><p>{{ error }}</p><BButton :disabled="pending || busy" @click="load()">Retry drafts</BButton></div>
    <p v-if="success" role="status">{{ success }}</p>
    <p v-if="!pending && !error && items?.length === 0">No drafts match this status.</p>
    <AdminWorkspace :selected="Boolean(selected)" label="Imported draft records" detail-label="Draft review details" :disabled="busy || venuePending" @close="closeSelection">
      <template #list>
        <p v-if="!pending && !error" class="draft-list-heading">{{ items?.length ?? 0 }} drafts loaded</p>
        <ul v-if="items?.length" class="draft-records">
          <li v-for="draft in items" :key="draft.id">
            <button type="button" class="draft-record" :class="{ 'is-selected': selectedId === draft.id }" :data-testid="`view-${draft.id}`" :disabled="busy || pending || Boolean(error) || (conflict && selectedId === draft.id)" :aria-current="selectedId === draft.id ? 'true' : undefined" :aria-label="`View details: ${draft.title}`" @click="select(draft)">
              <span class="draft-record-heading"><strong>{{ draft.title }}</strong><AdminStatusBadge :status="draft.reviewStatus" /></span>
              <span class="draft-record-meta">{{ draft.sourceName }}</span>
              <span class="admin-figures">{{ priceText(draft) }}<template v-if="draft.discountPercent != null"> · {{ draft.discountPercent }}% off</template></span>
              <small>Version {{ draft.contentVersion }}</small>
            </button>
          </li>
        </ul>
        <BButton v-if="nextCursor" data-testid="more-drafts" class="draft-pagination" :disabled="pending || busy || venuePending" @click="load(nextCursor)">Load more drafts</BButton>
      </template>
      <template #detail>
    <article v-if="selected" aria-labelledby="draft-title" class="draft-detail text-break">
      <header class="draft-detail-heading"><div><p class="draft-source-label">{{ selected.sourceName }}</p><h3 id="draft-title" ref="detailHeading" tabindex="-1">{{ selected.title }}</h3></div><AdminStatusBadge :status="selected.reviewStatus" /></header>
      <p class="draft-text">{{ selected.description }}</p>
      <DraftImages :key="`${selected.id}:${selected.contentVersion}`" :images="selected.images" :title="selected.title" />
      <dl class="draft-facts">
        <dt>Offer</dt><dd class="admin-figures">{{ priceText(selected) }}<template v-if="selected.discountPercent != null"> · {{ selected.discountPercent }}% off</template></dd>
        <dt>Terms</dt><dd class="draft-text">{{ selected.terms ?? 'Not supplied' }}</dd>
        <dt>Category / offer type</dt><dd>{{ selected.category }} / {{ formatOfferType(selected.offerType) }}</dd>
        <dt>Validity</dt><dd><time v-if="selected.validFrom" :datetime="selected.validFrom">{{ formatDate(selected.validFrom) }}</time><template v-else>Unknown start</template> to <time v-if="selected.validUntil" :datetime="selected.validUntil">{{ formatDate(selected.validUntil) }}</time><template v-else>Unknown end</template></dd>
        <dt>Original validity text</dt><dd>{{ selected.rawValidityText ?? 'Not supplied' }}</dd>
        <dt>Content version</dt><dd>Version {{ selected.contentVersion }}</dd>
        <dt>Current outlet</dt>
        <dd v-if="selected.outlets?.length">
          <ul><li v-for="outlet in selected.outlets" :key="outlet.id">{{ outlet.name }} · {{ outlet.address }} · {{ outlet.merchantName }}</li></ul>
          <p v-if="selected.outletsTruncated">Showing {{ selected.outlets.length }} of {{ selected.outletCount }} associated outlets. Display is truncated; approval checks the complete set.</p>
          <p v-else>{{ selected.outletCount ?? selected.outlets.length }} associated outlet(s). Association alone does not confirm campaign participation.</p>
        </dd>
        <dd v-else-if="selected.outlet">{{ selected.outlet.name }} · {{ selected.outlet.address }} · {{ selected.outlet.merchantName }}</dd>
        <dd v-else-if="(selected.outletCount ?? 0) > 0">{{ selected.outletCount }} associated outlets; details unavailable.</dd>
        <dd v-else>No existing outlet associated</dd>
        <dt>Applicability</dt><dd>{{ selected.applicability }}</dd>
        <dt>Content review</dt><dd>{{ selected.reviewReady ? 'Content reviewable; scope and publication are separate checks.' : 'Source, offer or validity clarification required.' }}</dd>
        <dt>Scope / physical eligibility</dt>
        <dd v-if="selected.scopeStatus === 'SOURCE_CONFIRMED' && selected.physicalEligibilityReady">Source-confirmed physical scope. Public visibility still requires current approval and publication.</dd>
        <dd v-else-if="selected.scopeStatus === 'SOURCE_CONFIRMED' && ['ONLINE', 'NO_FIXED_LOCATION'].includes(selected.applicability)">Source-confirmed nonspatial scope. No map points.</dd>
        <dd v-else-if="selected.scopeStatus === 'SOURCE_CONFIRMED'">Scope confirmed, but current physical outlet proof is incomplete. Not ready for physical approval.</dd>
        <dd v-else-if="selected.scopeStatus === 'LEGACY_RETAINED'">Exact historical scope retained; not fresh verification or authority for new outlet associations.</dd>
        <dd v-else>Scope unconfirmed. Content approval does not establish public or map eligibility.</dd>
        <dt>Source</dt><dd>{{ selected.sourceName }} · <a v-if="sourceLink" data-testid="draft-source" :href="sourceLink" target="_blank" rel="noopener noreferrer">Open original source</a><span v-else>Source link unavailable (unsafe or invalid URL).</span></dd>
        <dt>Previous review note</dt><dd>{{ selected.reviewNote ?? 'No previous note' }}</dd>
      </dl>
      <DraftEvidence :key="`${selected.id}:${selected.contentVersion}`" :deal-id="selected.id" :content-version="selected.contentVersion" @denied="code => { clearRecoveryWorkspace(workspace); close(); emit('denied', code) }" @investigate="investigationId = $event" />
      <PostInvestigation v-if="investigationId" :post-id="investigationId" @busy="investigationBusy = $event" @denied="code => { clearRecoveryWorkspace(workspace); close(); emit('denied', code) }" />
      <form class="draft-decision" @submit.prevent="review('APPROVE')" :aria-busy="reviewPending">
        <h4>Review decision</h4>
        <label for="review-note" class="form-label">Review note (required)</label>
        <textarea id="review-note" v-model="note" name="review-note" class="form-control mb-3" rows="3" maxlength="1000" required :disabled="busy || pending || selected.reviewStatus !== 'PENDING'" />
        <p v-if="approvalReason" id="approval-reason" class="text-secondary">{{ approvalReason }}</p>
        <p v-if="selected.reviewStatus !== 'PENDING'">This draft has already been reviewed. Review actions are read-only.</p>
        <p v-if="reviewError || conflict" role="alert" class="text-danger">{{ reviewError || conflictMessage }}</p>
        <BButton v-if="conflict" data-testid="reload-draft" class="mb-3" :disabled="pending || busy" @click="load()">Reload draft</BButton>
        <div class="form-check mb-3">
          <input id="reject-confirmation" v-model="rejectConfirmed" name="reject-confirmation" type="checkbox" class="form-check-input" :disabled="!canReview" />
          <label for="reject-confirmation" class="form-check-label">To reject, I confirm rejecting {{ selected.title }} (version {{ selected.contentVersion }}).</label>
        </div>
        <div class="d-flex flex-wrap gap-2">
          <BButton data-testid="approve-draft" type="submit" variant="success" :disabled="!canReview || Boolean(approvalReason)" :aria-describedby="approvalReason ? 'approval-reason' : undefined">Approve draft</BButton>
          <BButton data-testid="reject-draft" type="button" variant="outline-danger" :disabled="!canReview || !rejectConfirmed" @click="review('REJECT')">{{ reviewPending ? 'Submitting…' : 'Reject draft' }}</BButton>
        </div>
      </form>
      <section v-if="categoryAllowed" aria-labelledby="category-title" class="mb-4">
        <h4 id="category-title" class="h6">Correct the category</h4>
        <p id="category-help">The importer guesses the category from the post text. Fix it here when the guess is wrong. This does not approve or publish the draft.</p>
        <form data-testid="category-form" @submit.prevent="setCategory" :aria-busy="categoryPending">
          <label for="draft-category" class="form-label">Category</label>
          <AppSelect id="draft-category" v-model="category" :options="CATEGORY_OPTIONS" class="form-select mb-2" :disabled="busy || pending || venuePending || conflict" aria-describedby="category-help" />
          <p v-if="categoryError" role="alert">{{ categoryError }}</p>
          <BButton data-testid="save-category" type="submit" :disabled="!canSetCategory">{{ categoryPending ? 'Saving…' : 'Save category' }}</BButton>
        </form>
      </section>
      <section v-if="associationAllowed" aria-labelledby="outlet-title" class="admin-outlet-association mb-4">
        <h4 id="outlet-title" class="h6">Associate an existing outlet</h4>
        <p id="outlet-help">Choose only an existing active outlet supported by the named source evidence. This does not approve or publish the draft. OneMap candidates are not outlet records.</p>
        <form data-testid="outlet-search" @submit.prevent="searchOutlets()" :aria-busy="venuePending">
          <label for="outlet-query" class="form-label">Search existing outlets</label>
          <input id="outlet-query" v-model="outletQuery" name="outlet-query" autocomplete="off" type="search" maxlength="100" class="form-control mb-2" :disabled="busy || pending || venuePending || conflict" aria-describedby="outlet-help" />
          <BButton type="submit" :disabled="busy || pending || venuePending || conflict || outletQuery.trim().length > 100">Search outlets</BButton>
        </form>
        <TicketLoading v-if="venuePending" label="Loading existing outlets…" />
        <p v-if="venues?.length === 0 && venueCursor">No selectable verified outlets on this page. More catalogue rows remain; load more.</p>
        <p v-else-if="venues?.length === 0">No matching verified outlet records. Association requires an existing merchant and outlet. This screen cannot create or verify them; ask the responsible administrator to maintain canonical records.</p>
        <BButton v-if="venueCursor" data-testid="more-outlets" :disabled="busy || venuePending || pending || conflict" @click="searchOutlets(venueCursor)">Load more outlets</BButton>
        <form data-testid="outlet-association" @submit.prevent="associate" :aria-busy="associationPending">
          <label for="outlet-choice" class="form-label">Existing outlet</label>
          <AppSelect id="outlet-choice" v-model="venueId" :options="outletOptions" class="form-select mb-2" :disabled="busy || pending || venuePending || conflict" />
          <div class="form-check mb-2">
            <input id="outlet-confirmation" v-model="confirmed" type="checkbox" class="form-check-input" :disabled="!chosenVenue || busy || pending || venuePending || conflict" />
            <label for="outlet-confirmation" class="form-check-label">I checked the original source and it supports this exact outlet for this draft version.</label>
          </div>
          <p v-if="outletError" role="alert">{{ outletError }}</p>
          <BButton data-testid="associate-outlet" type="submit" :disabled="!canAssociate">{{ associationPending ? 'Associating…' : 'Associate outlet' }}</BButton>
        </form>
      </section>
      <p v-else>This applicability or review status cannot be changed through single-outlet association.</p>
    </article>
    <div v-else class="draft-empty-detail"><h3>Select a draft to review</h3><p>The offer, source evidence and available actions will appear here.</p></div>
      </template>
    </AdminWorkspace>
  </section>
</template>

<style scoped>
dd, li, label { min-width: 0; overflow-wrap: anywhere; }
.admin-figures { font-variant-numeric: tabular-nums; }
.draft-workspace { min-width: 0; margin-bottom: 24px; }
.draft-toolbar { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin-bottom: 20px; }
.draft-toolbar h2 { margin-bottom: 8px; }
.draft-toolbar p { color: var(--admin-muted); margin: 0; }
.draft-status-filter { display: grid; gap: 6px; min-width: 180px; font-size: .8125rem; font-weight: 600; }
.draft-list-heading { padding: 16px 18px; margin: 0; color: var(--admin-muted); font-size: .8125rem; border-bottom: 1px solid var(--admin-border); }
.draft-records { list-style: none; padding: 0; margin: 0; }
.draft-record { display: grid; gap: 8px; width: 100%; padding: 18px; border: 0; border-bottom: 1px solid var(--admin-border); background: transparent; color: var(--admin-text); text-align: left; font: inherit; cursor: pointer; }
.draft-record:hover { background: var(--admin-hover); }
.draft-record.is-selected { background: var(--admin-selected-bg); box-shadow: inset 3px 0 var(--admin-accent); }
.draft-record:disabled { opacity: .6; cursor: not-allowed; }
.draft-record-heading { display: flex; flex-wrap: wrap; align-items: start; justify-content: space-between; gap: 10px; }
.draft-record-heading strong { flex: 1 1 180px; font-size: .9375rem; line-height: 1.5; }
.draft-record-meta, .draft-record small { color: var(--admin-muted); font-size: .8125rem; }
.draft-record .admin-figures { font-size: .8125rem; }
.draft-pagination { margin: 16px; }
.draft-detail-heading { display: flex; align-items: start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
.draft-detail-heading h3 { margin-bottom: 0; font-size: 1.25rem; }
.draft-source-label { margin: 0 0 8px; color: var(--admin-muted); font-size: .8125rem; }
.draft-text { white-space: pre-wrap; }
.draft-facts { display: grid; grid-template-columns: minmax(110px, .6fr) minmax(0, 1.4fr); gap: 12px 20px; padding-block: 20px; margin-block: 20px; border-block: 1px solid var(--admin-border); }
.draft-facts dt { color: var(--admin-muted); font-weight: 500; }
.draft-facts dd { margin: 0; }
.draft-decision { border: 1px solid var(--admin-accent-border); border-radius: 16px; background: var(--admin-accent-wash); padding: 20px; margin-block: 24px; }
.draft-decision h4 { margin-bottom: 16px; }
.draft-empty-detail { padding: 40px 12px; text-align: center; color: var(--admin-muted); }
.draft-empty-detail h3 { font-size: 1rem; }
@media (max-width: 767px) {
 .draft-toolbar { flex-direction: column; align-items: stretch; }
 .draft-status-filter { min-width: 0; }
 .draft-facts { grid-template-columns: 1fr; gap: 4px; }
 .draft-facts dd { margin-bottom: 14px; }
 .draft-detail-heading { flex-direction: column; }
 .draft-decision { padding: 16px; }
}
</style>
