<script setup lang="ts">
import type { AdminDealsClient } from '@broke-oclock/api-client/admin-deals'
import {
  type AdminDealContentRequest,
  adminDealContentChangesSchema,
} from '@broke-oclock/contracts/admin-deals'
import { DEAL_CATEGORIES } from '@broke-oclock/contracts/deal-categories'
import { DEAL_CUISINES } from '@broke-oclock/contracts/deal-cuisines'
import AdminStatusBadge from '@web/components/admin/AdminStatusBadge.vue'
import AdminTaskLink from '@web/components/admin/AdminTaskLink.vue'
import AdminWorkspace from '@web/components/admin/AdminWorkspace.vue'
import AdminWorkspaceTabs from '@web/components/admin/AdminWorkspaceTabs.vue'
import TicketLoading from '@web/components/TicketLoading.vue'
import { adminCatalogueHref, adminDealHref, adminRecordId, adminReturnTo, type DealWorkflowTab } from '@web/lib/admin-workflow-links'
import { api } from '@web/lib/api-client'
import { formatDateTime, formatMoneyMinor, formatOfferType } from '@web/lib/format'
import DealScopePicker from '@web/modules/admin-deals/DealScopePicker.vue'
import {
  isoToSingaporeInput,
  minorToPriceInput,
  priceInputToMinor,
  singaporeInputToIso,
} from '@web/modules/admin-deals/deal-editor-values'
import { useAdminDeals } from '@web/modules/admin-deals/use-admin-deals'
import DraftEvidence from '@web/modules/ingestion-admin/DraftEvidence.vue'
import { computed, inject, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { type LocationQueryRaw, routeLocationKey, routerKey } from 'vue-router'

const props = defineProps<{ client?: AdminDealsClient }>()
const emit = defineEmits<{ denied: [code: 'UNAUTHORIZED' | 'FORBIDDEN'] }>()
const client = props.client ?? api.adminDeals
const state = useAdminDeals(client, (code) => emit('denied', code))
const {
  items,
  selected,
  filters,
  cursor,
  consent,
  loading,
  reading,
  pending,
  message,
  status,
  blocked,
} = state
const action = ref('content'),
  validation = ref('')
const detailOpen = ref(false)
const detailHeading = ref<HTMLElement | null>(null)
const recordsRoot = ref<HTMLElement | null>(null)
const imageFailed = ref(false)
const editor = reactive<Record<string, string>>({})
const initialEditor = reactive<Record<string, string>>({})
const scope = reactive({ applicability: 'ONLINE', merchantId: '', venueIds: '' })
const evidence = reactive({ reference: '', statement: '', citationId: '', staffConfirmed: false })
const editorTabs = [
  { id: 'content', label: 'Content' },
  { id: 'scope', label: 'Outlets & scope' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'review', label: 'Review' },
]
const section = computed(() => ['content', 'scope', 'evidence'].includes(action.value) ? action.value : 'review')
const completeVenueIds = computed(() => scope.venueIds.split(/[\s,]+/u).filter(Boolean))
const actionLabels: Record<string, string> = {
  content: 'Save content correction', scope: 'Save scope', evidence: 'Record scope evidence',
  APPROVE: 'Approve review', REJECT: 'Reject review', unpublish: 'Unpublish deal', reopen: 'Reopen review',
}
const route = inject(routeLocationKey, null)
const router = inject(routerKey, null)
const returnTo = computed(() => adminReturnTo(route?.query.returnTo))
const routeNotice = computed(() => route?.query.dealId && !adminRecordId(route.query.dealId) ? 'The linked deal ID is invalid. Select a deal from the directory.' : '')
const evidenceVisited = ref(false)
const reviewAction = () => selected.value?.reviewStatus === 'PENDING' ? 'APPROVE'
  : selected.value?.reviewStatus === 'APPROVED' && selected.value.publishedAt ? 'unpublish' : 'reopen'
const setSection = (value: string) => {
  action.value = value === 'review' ? reviewAction() : value
  if (value === 'evidence') evidenceVisited.value = true
  state.resetConsent()
}
const currentHref = (tab = section.value) => {
  if (!selected.value) return '/admin/deals'
  const url = new URL(adminDealHref({ dealId: selected.value.id, tab: tab as DealWorkflowTab, returnTo: returnTo.value }), 'http://admin.local')
  for (const [key, value] of Object.entries(filters)) if (value) url.searchParams.set(key, String(value))
  return `${url.pathname}${url.search}`
}
let internalPath: string | null = null
let queuedRoute = false
let appliedRecord: string | undefined
const routeFilterKeys = new Set<string>()
let routeGeneration = 0
const syncUrl = async (dealId?: string, tab = section.value) => {
  if (!router || !route) return
  const query = { ...route.query, dealId, tab: dealId ? tab : undefined }
  const target = router.resolve({ path: '/admin/deals', query }).fullPath
  if (target === route.fullPath) return
  internalPath = target
  try { await router.replace(target) } finally { internalPath = null }
}
const reloadList = async (clear = false) => {
  if (pending.value) return
  state.resetConsent()
  if (clear) await state.clearFilters()
  else await state.load()
  if (!router || !route || status.value === 'closed') return
  const query: LocationQueryRaw = { ...route.query }
  for (const [key, value] of Object.entries(filters)) query[key] = value ? String(value) : undefined
  const destination = router.resolve({ path: '/admin/deals', query }).fullPath
  if (destination === route.fullPath) return
  internalPath = destination
  try { await router.replace(destination) } finally { internalPath = null }
}
const focusDetail = async () => {
  await nextTick()
  detailHeading.value?.focus({ preventScroll: true })
  if (window.innerWidth < 992) detailHeading.value?.closest('.admin-record-workspace-detail')?.scrollIntoView?.({ block: 'start' })
}
const pick = async (id: string) => {
  if (pending.value) return
  appliedRecord = id
  detailOpen.value = true
  evidenceVisited.value = false
  await syncUrl(id, 'content')
  setSection('content')
  await state.select(id)
  if (selected.value?.id === id) await focusDetail()
}
const chooseSection = (value: string) => {
  if (pending.value || !editorTabs.some(tab => tab.id === value)) return
  setSection(value)
  void syncUrl(selected.value?.id, value)
}
const closeDetails = async () => {
  if (pending.value) return
  const id = selected.value?.id
  appliedRecord = undefined
  detailOpen.value = false
  state.clearSelection()
  await syncUrl()
  await nextTick()
  if (id) recordsRoot.value?.querySelector<HTMLButtonElement>(`button[data-deal-id="${id}"]`)?.focus()
}
const applyRoute = async (initial = false) => {
  if (pending.value) { queuedRoute = true; return }
  queuedRoute = false
  const ticket = ++routeGeneration
  const id = adminRecordId(route?.query.dealId)
  const tab = typeof route?.query.tab === 'string' && editorTabs.some(tab => tab.id === route.query.tab) ? route.query.tab : 'content'
  let filtersChanged = false
  for (const key of ['search', 'origin', 'reviewStatus', 'publication', 'merchantId'] as const) {
    const value = route?.query[key]
    if (typeof value !== 'string') {
      if (routeFilterKeys.delete(key) && filters[key] !== '') { filters[key] = ''; filtersChanged = true }
      continue
    }
    routeFilterKeys.add(key)
    const allowed = key === 'origin' ? ['', 'IMPORTED', 'USER_SUBMITTED'].includes(value)
      : key === 'reviewStatus' ? ['', 'PENDING', 'APPROVED', 'REJECTED', 'HIDDEN'].includes(value)
      : key === 'publication' ? ['', 'PUBLISHED', 'UNPUBLISHED', 'EXPIRED'].includes(value)
      : key === 'merchantId' ? !value || !!adminRecordId(value) : value.length <= 100
    if (allowed && filters[key] !== value) { filters[key] = value; filtersChanged = true }
  }
  const deleted = route?.query.includeDeleted
  if (deleted === 'true' || deleted === 'false') {
    routeFilterKeys.add('includeDeleted')
    if (filters.includeDeleted !== (deleted === 'true')) { filters.includeDeleted = deleted === 'true'; filtersChanged = true }
  } else if (routeFilterKeys.delete('includeDeleted') && filters.includeDeleted) { filters.includeDeleted = false; filtersChanged = true }
  if (initial || filtersChanged) void state.load()
  if (id !== appliedRecord || (id && !selected.value && !reading.value)) {
    appliedRecord = id
    evidenceVisited.value = false
    detailOpen.value = !!id
    if (id) await state.select(id)
    else state.clearSelection()
  }
  if (ticket !== routeGeneration) return
  setSection(tab)
  if (id && selected.value?.id === id) await focusDetail()
}
watch(() => route?.fullPath, () => {
  if (route?.path !== '/admin/deals' || route.fullPath === internalPath) return
  void applyRoute()
}, { flush: 'sync' })
watch(pending, async value => {
  if (value || !queuedRoute) return
  await nextTick()
  if (queuedRoute && !pending.value) void applyRoute()
})
const investigate = (postId: string) => {
  if (pending.value || !adminRecordId(postId) || !router) return
  void router.push({ path: '/admin/ingestion', query: { postId, returnTo: currentHref('evidence') }, hash: '#failed-posts' })
}
const decisionUnavailable = computed(() => {
  const row = selected.value
  if (!row) return true
  if (action.value === 'APPROVE') return row.reviewStatus !== 'PENDING' || !row.approvalReady
  if (action.value === 'REJECT') return row.reviewStatus !== 'PENDING'
  if (action.value === 'unpublish') return row.reviewStatus !== 'APPROVED'
  if (action.value === 'reopen') return !['HIDDEN', 'REJECTED'].includes(row.reviewStatus) && !(row.reviewStatus === 'APPROVED' && !row.publishedAt)
  return false
})
const lookupDenied = (code: string) => { if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') { state.close(); emit('denied', code) } }
const readable = (value: string) => value.replaceAll('_', ' ').toLowerCase()
const safeUrl = (value: string | null) => {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined
  } catch { return undefined }
}
const previewImage = computed(() => imageFailed.value ? undefined : selected.value?.images.map(image => safeUrl(image.url)).find(Boolean))
const fields = [
  'title',
  'description',
  'terms',
  'category',
  'cuisine',
  'offerType',
  'priceMinor',
  'currency',
  'discountPercent',
  'validFrom',
  'validUntil',
  'rawValidityText',
] as const
watch(selected, (row) => {
  validation.value = ''
  imageFailed.value = false
  for (const key of fields) {
    const value = !row ? '' : key === 'priceMinor' ? minorToPriceInput(row.priceMinor)
      : key === 'validFrom' || key === 'validUntil' ? isoToSingaporeInput(row[key])
      : row[key] == null ? '' : String(row[key])
    editor[key] = value
    initialEditor[key] = value
  }
  if (!row) return
  if (section.value === 'review' && decisionUnavailable.value) action.value = reviewAction()
  scope.applicability = row.applicability
  scope.merchantId = row.merchantId ?? ''
  scope.venueIds = row.selectedVenueIds?.join('\n') ?? ''
  Object.assign(evidence, { reference: '', statement: '', citationId: '', staffConfirmed: false })
})
watch(action, () => {
  state.resetConsent()
  validation.value = ''
  evidence.staffConfirmed = false
})
const saveContent = () => {
  const row = selected.value
  if (!row) return
  const changes: Record<string, unknown> = {}
  try {
    for (const key of fields) {
      const raw = editor[key] ?? ''
      // Preserve untouched legacy values and timestamp precision, even when their display differs.
      if (raw === initialEditor[key]) continue
      const value = key === 'priceMinor' ? priceInputToMinor(raw)
        : key === 'validFrom' || key === 'validUntil' ? singaporeInputToIso(raw)
        : key === 'discountPercent' ? raw === '' ? null : Number(raw)
        : ['terms', 'cuisine', 'rawValidityText'].includes(key) && raw === '' ? null : raw
      if ((key === 'validFrom' || key === 'validUntil') && value && row[key] && new Date(String(value)).getTime() === new Date(row[key]).getTime()) continue
      if (value !== row[key]) changes[key] = value
    }
  } catch (failure) {
    validation.value = failure instanceof Error ? failure.message : 'Check the price and dates before saving.'
    return
  }
  const parsed = adminDealContentChangesSchema.safeParse(changes)
  if (!parsed.success) {
    validation.value =
      'Enter a valid correction. Use a title up to 40 characters, description up to 120, price up to $10,000.00 and dates in Singapore time.'
    return
  }
  const captured = parsed.data
  void state.write((id, envelope) =>
    client.content(id, { ...envelope, changes: captured } as AdminDealContentRequest),
  )
}
const submitAction = () => {
  validation.value = ''
  const chosen = action.value,
    row = selected.value
  if (!row || decisionUnavailable.value) return
  if (chosen === 'scope') {
    const captured = {
      applicability: scope.applicability as typeof row.applicability,
      merchantId: scope.merchantId || null,
      venueIds: scope.venueIds.split(/[\s,]+/).filter(Boolean),
    }
    void state.write((id, envelope) => client.scope(id, { ...envelope, ...captured }))
  } else if (chosen === 'evidence') {
    if (
      !evidence.staffConfirmed ||
      !evidence.reference.trim() ||
      evidence.statement.trim().length < 10
    ) {
      validation.value =
        'Review an actual supporting source reference and enter a statement, then confirm the staff review.'
      return
    }
    const citation = row.sources.find((source) => source.citationId === evidence.citationId)
    if (row.origin === 'IMPORTED' && !citation) {
      validation.value = 'Choose the exact pinned citation reviewed.'
      return
    }
    const captured = {
      reference: evidence.reference,
      statement: evidence.statement,
      staffConfirmed: true as const,
      ...(citation
        ? { citationId: citation.citationId, sourceContentHash: citation.sourceContentHash }
        : {}),
    }
    void state.write((id, envelope) => client.scopeEvidence(id, { ...envelope, ...captured }))
  } else if (chosen === 'APPROVE' || chosen === 'REJECT')
    void state.write((id, envelope) => client.review(id, { ...envelope, decision: chosen }))
  else if (chosen === 'unpublish')
    void state.write((id, envelope) => client.unpublish(id, envelope))
  else if (chosen === 'reopen') void state.write((id, envelope) => client.reopen(id, envelope))
}
// "$12.90"; an unrecognised currency code keeps the stored code and the raw minor units.
const amount = (minor: number | null, currency: string) => {
  if (minor == null) return 'Not recorded'
  try {
    return formatMoneyMinor(minor, currency)
  } catch {
    return `${currency} ${minor} minor units`
  }
}
onMounted(() => applyRoute(true))
onUnmounted(state.dispose)
</script>
<template>
  <section class="deals-directory" :class="{ 'deal-detail-open': detailOpen && (Boolean(selected) || reading) }" aria-label="Deals operations">
    <AdminTaskLink v-if="returnTo" :to="returnTo" :disabled="pending" class="task-return">← Back to previous task</AdminTaskLink>
    <p class="directory-intro">Check the content, confirm the outlets and evidence, then review the complete deal.</p>
    <p v-if="routeNotice" role="alert">{{ routeNotice }}</p>
    <form class="deal-filters" @submit.prevent="reloadList()">
      <fieldset :disabled="pending" class="filters">
        <label class="filter-search">Search deals<input v-model="filters.search" name="search" type="search" autocomplete="off" class="form-control" maxlength="100" placeholder="Title or description…" /></label>
        <label>Source<select v-model="filters.origin" name="origin" class="form-select"><option value="">All sources</option><option value="IMPORTED">Imported</option><option value="USER_SUBMITTED">Community</option></select></label>
        <label>Review<select v-model="filters.reviewStatus" name="reviewStatus" class="form-select"><option value="">All states</option><option value="PENDING">Needs review</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="HIDDEN">Hidden</option></select></label>
        <label>Visibility<select v-model="filters.publication" name="publication" class="form-select"><option value="">Any visibility</option><option value="PUBLISHED">Published</option><option value="UNPUBLISHED">Unpublished</option><option value="EXPIRED">Expired</option></select></label>
        <div class="filter-actions"><button type="submit" data-testid="reload-list" class="btn btn-primary" :disabled="loading">{{ loading ? 'Loading…' : 'Apply filters' }}</button><button type="button" data-testid="clear-deal-filters" class="btn btn-outline-secondary" :disabled="loading || pending" @click="reloadList(true)">Clear</button></div>
      </fieldset>
      <details class="advanced-filters"><summary>Advanced filters<span v-if="filters.merchantId || filters.includeDeleted" class="filter-active"> · active</span></summary><div class="advanced-filter-fields"><label>Merchant ID<input v-model="filters.merchantId" name="merchantId" class="form-control" maxlength="24" spellcheck="false" autocomplete="off" autocapitalize="none" translate="no" :disabled="pending" /></label><label class="check"><input v-model="filters.includeDeleted" name="includeDeleted" type="checkbox" :disabled="pending" /> Include deleted records for investigation</label></div></details>
    </form>
    <p v-if="message" role="status" class="notice">{{ message }}</p>
    <AdminWorkspace :selected="detailOpen && (Boolean(selected) || reading)" label="Deal records" detail-label="Selected deal" :disabled="pending" @close="closeDetails">
      <template #list>
        <header class="queue-heading"><h2>Deals</h2><span v-if="!loading && status === 'ready'" class="small text-secondary">{{ items.length }} loaded</span></header>
        <TicketLoading v-if="loading" label="Loading deals…" />
        <div v-else-if="status === 'ready' && !items.length" class="queue-empty" role="status"><h3>No matching deals</h3><p>Try another search or clear the filters to see more deals.</p><button class="btn btn-outline-secondary" type="button" @click="reloadList(true)">Clear filters</button></div>
        <ol ref="recordsRoot" class="records"><li v-for="item in items" :key="item.id"><button type="button" :data-deal-id="item.id" data-testid="select-deal" :disabled="pending" :aria-current="selected?.id === item.id ? 'true' : undefined" @click="pick(item.id)"><strong>{{ item.title }}</strong><span class="record-statuses"><AdminStatusBadge :status="item.reviewStatus" :label="item.reviewStatus === 'PENDING' ? 'Needs review' : undefined" /><AdminStatusBadge :status="item.publication" /></span><small>{{ item.origin === 'IMPORTED' ? 'Imported source' : 'Community submission' }}<span v-if="item.validUntil"> · Ends {{ formatDateTime(item.validUntil) }}</span></small></button></li></ol>
        <footer v-if="cursor" class="queue-footer"><button type="button" class="btn btn-outline-secondary" :disabled="loading || pending" @click="state.load(true)">Load more deals</button></footer>
      </template>
      <template #detail>
        <TicketLoading v-if="reading" label="Loading full deal evidence…" />
        <div v-else-if="!selected" class="empty-detail"><span class="empty-detail-mark" aria-hidden="true">↗</span><h2>Select a deal</h2><p>Choose a record to review its offer, outlets and supporting evidence.</p></div>
        <article v-if="selected" :aria-busy="pending">
          <header class="deal-heading"><div><p class="eyebrow">{{ selected.origin === 'IMPORTED' ? 'Imported deal' : 'Community submission' }}</p><h2 ref="detailHeading" tabindex="-1">{{ selected.title }}</h2><div class="record-statuses"><AdminStatusBadge :status="selected.reviewStatus" :label="selected.reviewStatus === 'PENDING' ? 'Needs review' : undefined" /><AdminStatusBadge :status="selected.publication" /></div></div><button type="button" class="btn btn-outline-secondary" data-testid="refresh-deal" :disabled="reading || pending" @click="state.select(selected.id)">Refresh deal</button></header>
          <div class="deal-preview"><img v-if="previewImage" :src="previewImage" :alt="selected.title" referrerpolicy="no-referrer" @error="imageFailed = true" /><div><p class="offer-summary">{{ formatOfferType(selected.offerType) }} · {{ amount(selected.priceMinor, selected.currency) }}<span v-if="selected.discountPercent !== null"> · {{ selected.discountPercent }}% off</span></p><p class="copy">{{ selected.description }}</p><p class="validity-summary"><strong>Validity (SGT)</strong><span><time v-if="selected.validFrom" :datetime="selected.validFrom">{{ formatDateTime(selected.validFrom) }}</time><template v-else>No known start</template> → <time v-if="selected.validUntil" :datetime="selected.validUntil">{{ formatDateTime(selected.validUntil) }}</time><template v-else>No known end</template></span></p></div></div>
          <div v-if="selected.blockers.length" class="blockers"><h3>What needs attention</h3><ul><li v-for="blocker in selected.blockers" :key="blocker">{{ readable(blocker) }}</li></ul></div>
          <p v-if="selected.deletedAt" role="alert">This deal was deleted. You can inspect its evidence, but cannot change it.</p>
          <details class="technical-details"><summary>Record details</summary><dl class="facts"><dt>Deal ID</dt><dd translate="no">{{ selected.id }}</dd><dt>Content / operation version</dt><dd>{{ selected.contentVersion }} / {{ selected.operationVersion }}</dd><dt>Publication code</dt><dd>{{ selected.publication }}</dd><dt>Published at</dt><dd>{{ selected.publishedAt ? formatDateTime(selected.publishedAt) : 'Not published' }}</dd><dt>Last review note</dt><dd>{{ selected.reviewNote || 'No review note' }}</dd><dt>Original validity text</dt><dd>{{ selected.rawValidityText || 'Not supplied' }}</dd></dl></details>
          <AdminWorkspaceTabs :model-value="section" :tabs="editorTabs" id-prefix="deal-editor" label="Deal workspace" :disabled="pending" @update:model-value="chooseSection" />
          <form novalidate @submit.prevent="action === 'content' ? saveContent() : submitAction()">
            <fieldset :disabled="blocked">
              <legend class="visually-hidden">{{ actionLabels[action] }}</legend>
              <section id="deal-editor-panel-content" role="tabpanel" aria-labelledby="deal-editor-tab-content" :hidden="section !== 'content'">
                <h3>Content correction</h3><p class="section-description">Correct the offer as it should appear to customers. Saving changes can require a new review.</p>
                <div class="editor">
                  <label class="editor-wide">Title <small>Up to 40 characters</small><input v-model="editor.title" name="edit-title" type="text" class="form-control" maxlength="40" /></label>
                  <label class="editor-wide">Description <small>Up to 120 characters</small><textarea v-model="editor.description" name="edit-description" class="form-control" rows="2" maxlength="120" /></label>
                  <label class="editor-wide">Terms<textarea v-model="editor.terms" name="edit-terms" class="form-control" rows="3" maxlength="1000" /></label>
                  <label>Category<select v-model="editor.category" name="edit-category" class="form-select"><option v-for="value in DEAL_CATEGORIES" :key="value" :value="value">{{ readable(value) }}</option></select></label>
                  <label>Cuisine<select v-model="editor.cuisine" name="edit-cuisine" class="form-select"><option value="">No cuisine</option><option v-for="value in DEAL_CUISINES" :key="value" :value="value">{{ readable(value) }}</option></select></label>
                  <label>Offer type<select v-model="editor.offerType" name="edit-offerType" class="form-select"><option value="FIXED_PRICE">Fixed price</option><option value="PERCENT_OFF">Percentage off</option><option value="BUY_ONE_GET_ONE">Buy one, get one</option><option value="OTHER">Other</option></select></label>
                  <label>Price ({{ editor.currency || 'SGD' }})<input v-model="editor.priceMinor" name="edit-priceMinor" class="form-control" type="text" inputmode="decimal" placeholder="12.90" /><small>Use dollars and cents. Leave blank if unknown.</small></label>
                  <label>Currency<select v-model="editor.currency" name="edit-currency" class="form-select"><option v-if="selected.currency !== 'SGD'" :value="selected.currency">{{ selected.currency }} (stored)</option><option value="SGD">SGD · Singapore dollar</option></select></label>
                  <label>Discount (%)<input v-model="editor.discountPercent" name="edit-discountPercent" type="text" inputmode="numeric" class="form-control" placeholder="Leave blank if unknown" /></label>
                  <label>Starts (SGT)<input v-model="editor.validFrom" name="edit-validFrom" type="datetime-local" step="0.001" class="form-control" /><small>Singapore time, UTC+8</small></label>
                  <label>Ends, exclusive (SGT)<input v-model="editor.validUntil" name="edit-validUntil" type="datetime-local" step="0.001" class="form-control" /><small>The offer stops being valid at this time.</small></label>
                  <label class="editor-wide">Original validity wording<textarea v-model="editor.rawValidityText" name="edit-rawValidityText" class="form-control" rows="2" maxlength="2000" /></label>
                </div>
              </section>
              <section id="deal-editor-panel-scope" role="tabpanel" aria-labelledby="deal-editor-tab-scope" :hidden="section !== 'scope'">
                <h3>Outlets & scope</h3><p class="section-description">Choose where this offer applies. Replacing the scope clears its approval and supporting scope evidence.</p>
                <p v-if="selected.merchantId"><AdminTaskLink :to="adminCatalogueHref({ kind: 'venues', merchantId: selected.merchantId, returnTo: currentHref('scope') })" :disabled="pending">Manage this merchant’s outlets ↗</AdminTaskLink></p>
                <label>Where is the offer available?<select v-model="scope.applicability" class="form-select"><option value="SELECTED_OUTLETS">Selected outlets</option><option value="ALL_MERCHANT_OUTLETS">All merchant outlets</option><option value="ONLINE">Online</option><option value="NO_FIXED_LOCATION">No fixed location</option></select></label>
                <p v-if="!selected.scopeEditable" class="notice">This record has more than 100 outlet links and is read only here. The complete set will not be truncated.</p>
                <DealScopePicker v-if="section === 'scope'" v-model:merchant-id="scope.merchantId" :venue-ids="completeVenueIds" :outlets="selected.outlets" :disabled="blocked || !selected.scopeEditable" @update:venue-ids="scope.venueIds = $event.join('\n')" @denied="lookupDenied" />
                <details class="technical-details"><summary>Advanced: edit exact IDs</summary><label>Merchant ID (blank means none)<input v-model="scope.merchantId" class="form-control" spellcheck="false" autocomplete="off" /></label><label>Complete outlet IDs, one per line<textarea v-model="scope.venueIds" class="form-control" rows="5" :disabled="!selected.scopeEditable" spellcheck="false" /></label><p class="small text-secondary">This replaces the full selection, including outlets not shown on the current page.</p></details>
                <details><summary>Current outlets ({{ selected.outletCount }})</summary><ul class="outlet-list"><li v-for="venue in selected.outlets" :key="venue.id"><strong>{{ venue.name }}</strong><span>{{ venue.address }}</span><AdminTaskLink :to="adminCatalogueHref({ kind: 'venues', merchantId: selected.merchantId ?? undefined, recordId: venue.id, returnTo: currentHref('scope') })" :disabled="pending">Inspect outlet ↗</AdminTaskLink><small>{{ venue.deletedAt ? 'Deleted' : 'Active' }} · Geography {{ venue.geographyReady ? 'verified' : 'unverified' }} · Occupancy {{ venue.occupancyReady ? 'verified' : 'unverified' }}</small></li></ul><button v-if="selected.nextOutletCursor" type="button" class="btn btn-outline-secondary" @click="state.select(selected.id, selected.nextOutletCursor ?? undefined)">Next outlet page</button><p class="small text-secondary">Showing a page of the {{ selected.outletCount }} associated outlets. Eligibility checks use the full set.</p></details>
              </section>
              <section id="deal-editor-panel-evidence" role="tabpanel" aria-labelledby="deal-editor-tab-evidence" :hidden="section !== 'evidence'">
                <h3>Supporting evidence</h3><p class="section-description">Inspect an original source before recording what it confirms. Evidence alone does not publish a deal.</p>
                <details open><summary>Original sources & images</summary><p v-if="!selected.sources.length">This community submission has no imported source snapshot.</p><div v-for="source in selected.sources" :key="source.citationId" class="source-record"><a v-if="safeUrl(source.sourceUrl)" :href="safeUrl(source.sourceUrl)" target="_blank" rel="noopener noreferrer">Open original source ↗</a><p class="small">{{ source.current ? 'Current source snapshot' : 'Source has changed' }}</p><details><summary>Read source snapshot</summary><pre>{{ source.sourceContentSnapshot }}</pre><p class="small" translate="no">{{ source.citationId }} · {{ source.sourceContentHash }}</p></details></div><a v-for="(image, index) in selected.images" :key="index" class="source-image-link" :href="safeUrl(image.url)" target="_blank" rel="noopener noreferrer">{{ safeUrl(image.url) ? `Open image ${index + 1} ↗` : 'Unsafe image link omitted' }}</a></details>
                <template v-if="section === 'evidence'"><label>Supporting URL or source reference<input v-model="evidence.reference" name="reference" class="form-control" maxlength="2048" /></label><label>What did the source confirm?<textarea v-model="evidence.statement" name="statement" class="form-control" rows="3" maxlength="2000" /></label><label v-if="selected.origin === 'IMPORTED'">Reviewed source snapshot<select v-model="evidence.citationId" class="form-select"><option value="">Choose the source you reviewed</option><option v-for="source in selected.sources" :key="source.citationId" :value="source.citationId">{{ source.sourceUrl || source.citationId }}</option></select></label><label class="check"><input v-model="evidence.staffConfirmed" type="checkbox" /> I reviewed this supporting source and confirmed the complete stated scope.</label></template>
              </section>
              <section id="deal-editor-panel-review" role="tabpanel" aria-labelledby="deal-editor-tab-review" :hidden="section !== 'review'">
                <h3>Review decision</h3><p class="section-description">Approval publishes the deal when current scope evidence is present. Check the result below before confirming. Reopening always requires a new review.</p>
                <label class="action-picker">Decision<select v-model="action" class="form-select"><template v-if="selected.reviewStatus === 'PENDING'"><option value="APPROVE">Approve review</option><option value="REJECT">Reject review</option></template><option v-if="selected.reviewStatus === 'APPROVED'" value="unpublish">Unpublish deal</option><option v-if="['HIDDEN', 'REJECTED'].includes(selected.reviewStatus) || (selected.reviewStatus === 'APPROVED' && !selected.publishedAt)" value="reopen">Reopen for new review</option></select></label>
                <p v-if="action === 'APPROVE'" class="notice">{{ !selected.approvalReady ? 'Approval is blocked. Complete the content, outlet checks and supporting evidence first.' : selected.publicationReady ? 'This approval will publish the deal.' : 'This approval will leave the deal unpublished. Record current scope evidence before approval to publish it.' }}</p>
                <p v-if="action === 'unpublish'" class="notice">This removes the entire promotion from public view across every associated outlet.</p>
                <p v-if="selected.reviewNote"><strong>Previous review:</strong> {{ selected.reviewNote }}</p>
              </section>
              <footer class="decision-panel">
                <label>Required reason<textarea v-model="consent.note" name="note" class="form-control" rows="2" maxlength="500" placeholder="Explain the change or decision…" /></label>
                <label class="check"><input v-model="consent.confirmed" name="confirm" type="checkbox" /> I confirm {{ actionLabels[action]?.toLowerCase() }} for {{ selected.title }} ({{ selected.id }}), content {{ selected.contentVersion }} / operation {{ selected.operationVersion }}, scope {{ readable(selected.applicability) }} / {{ selected.outletCount }} outlets, and the complete changes entered above.</label>
                <p v-if="validation" role="alert">{{ validation }}</p>
                <button type="submit" :class="['btn', ['REJECT', 'unpublish'].includes(action) ? 'btn-outline-danger' : 'btn-primary']" :data-testid="action === 'content' ? 'save-content' : 'save-operation'" :disabled="blocked || decisionUnavailable || !consent.note.trim() || !consent.confirmed || (action === 'scope' && !selected.scopeEditable)">{{ pending ? 'Saving…' : actionLabels[action] }}</button>
              </footer>
            </fieldset>
          </form>
          <section v-if="selected.origin === 'IMPORTED' && evidenceVisited" v-show="section === 'evidence'" class="imported-evidence" aria-label="Imported source investigation"><DraftEvidence :key="`${selected.id}-${selected.contentVersion}`" :deal-id="selected.id" :content-version="selected.contentVersion" @denied="lookupDenied" @investigate="investigate" /></section>
        </article>
      </template>
    </AdminWorkspace>
  </section>
</template>

<style scoped>
summary { cursor: pointer; font-weight: 600; }
.deals-directory { min-width: 0; color: var(--admin-text); }
.deals-directory :deep(.admin-record-workspace-detail) { scroll-margin-top: 88px; }
.directory-intro { margin: 0 0 20px; color: var(--admin-muted); }
.deal-filters { padding: 18px; margin-bottom: 24px; border: 1px solid var(--admin-border); border-radius: 20px; background: var(--admin-surface); }
.filters { display: grid; grid-template-columns: minmax(180px, 1.6fr) repeat(3, minmax(110px, 1fr)) auto; align-items: end; gap: 12px; margin: 0; min-width: 0; }
label { display: grid; gap: 6px; min-width: 0; font-size: 13px; font-weight: 600; }
.form-control, .form-select { min-width: 0; width: 100%; max-width: 100%; }
.task-return { display: inline-block; margin-bottom: 16px; }
.imported-evidence { margin-top: 24px; }
label small { color: var(--admin-muted); font-size: 12px; font-weight: 400; }
.filter-actions { display: flex; align-items: center; gap: 8px; }
.advanced-filters { margin: 14px 0 0; padding: 12px 0 0; border-top: 1px solid var(--admin-line); }
.advanced-filters summary { color: var(--admin-muted); font-size: 12px; }
.advanced-filter-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; margin-top: 12px; }
.filter-active { color: var(--admin-accent-ink); font-weight: 600; }
.queue-heading { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px; border-bottom: 1px solid var(--admin-border); background: var(--admin-surface); }
.queue-heading h2 { margin: 0; }
.queue-empty, .queue-footer { padding: 24px 18px; }
.queue-empty p { color: var(--admin-muted); }
.records { list-style: none; padding: 8px; margin: 0; }
.records button { display: grid; gap: 12px; width: 100%; padding: 16px; text-align: left; color: inherit; background: transparent; border: 1px solid transparent; border-radius: 14px; overflow-wrap: anywhere; transition: background-color 150ms ease, border-color 150ms ease; }
.records li + li { margin-top: 4px; }
.records button:hover { background: var(--admin-hover); }
.records button[aria-current='true'] { background: var(--admin-selected-bg); border-color: var(--admin-selected-border); }
.records button:disabled { cursor: wait; opacity: .65; }
.records strong { font-size: 14px; line-height: 1.5; }
.records small { color: var(--admin-muted); font-size: 12px; }
.record-statuses { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.empty-detail { display: grid; justify-items: center; gap: 12px; padding: 48px 24px; text-align: center; }
.empty-detail h2, .empty-detail p { margin: 0; }
.empty-detail p { max-width: 320px; color: var(--admin-muted); }
.empty-detail-mark { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 18px; font-size: 26px; background: var(--admin-accent-soft); color: var(--admin-accent-ink); }
.deal-heading { display: flex; align-items: start; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
.deal-heading > div { min-width: 0; }
.deal-heading h2 { margin: 0 0 12px; font-size: 22px; line-height: 1.35; overflow-wrap: anywhere; }
.deal-heading .btn { flex: 0 0 auto; }
.eyebrow { margin: 0 0 8px; color: var(--admin-muted); font-size: 12px; font-weight: 600; }
.deal-preview { display: grid; gap: 16px; padding: 20px; margin-bottom: 20px; border: 1px solid var(--admin-tile-border); border-radius: 16px; background: var(--admin-subtle-bg); }
.deal-preview img { width: 100%; max-height: 220px; object-fit: contain; border-radius: 12px; background: var(--admin-surface); }
.offer-summary { margin: 0 0 8px; font-weight: 700; }
.copy, pre { white-space: pre-wrap; overflow-wrap: anywhere; }
.copy { color: var(--admin-secondary-text); }
.validity-summary { display: grid; gap: 5px; margin: 0; font-size: 13px; }
.validity-summary strong { font-size: 12px; color: var(--admin-muted); }
.blockers, .notice { padding: 16px; margin: 0 0 20px; border: 1px solid var(--admin-accent-border); border-radius: 14px; background: var(--admin-accent-wash); color: var(--admin-notice-ink); }
.blockers h3 { font-size: 14px; }
.blockers ul { padding-left: 20px; margin-bottom: 0; }
.technical-details { font-size: 12px; color: var(--admin-muted); }
.facts { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 16px; margin: 16px 0 0; }
.facts dt { font-weight: 600; }
.facts dd { margin: 0; overflow-wrap: anywhere; }
section[role='tabpanel'] > h3 { margin: 0 0 8px; }
.section-description { margin-bottom: 20px; color: var(--admin-muted); font-size: 13px; }
.editor { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.editor-wide { grid-column: 1 / -1; }
fieldset { min-width: 0; }
.decision-panel label { margin: 0; }
section[role='tabpanel'] > label { margin-bottom: 16px; }
.check { display: flex; align-items: start; gap: 10px; font-size: 13px; font-weight: 400; }
.check input { flex: 0 0 auto; margin-top: 4px; }
.decision-panel { display: grid; gap: 16px; margin-top: 24px; padding: 20px; border: 1px solid var(--admin-border); border-radius: 16px; background: var(--admin-subtle-bg); }
.decision-panel .btn { justify-self: start; }
.source-record { padding: 12px 0; }
.source-record + .source-record { border-top: 1px solid var(--admin-border); }
.source-image-link { display: block; margin-top: 8px; }
.outlet-list { display: grid; gap: 12px; padding-left: 18px; }
.outlet-list span, .outlet-list small { display: block; color: var(--admin-muted); }
details { margin-bottom: 20px; }
details[open] > summary { margin-bottom: 16px; }
a { overflow-wrap: anywhere; }
:focus-visible { outline: 2px solid var(--admin-focus); outline-offset: 3px; }
@media (max-width: 1199.98px) { .filters { grid-template-columns: repeat(3, minmax(0, 1fr)); } .filter-search { grid-column: span 2; } .filter-actions { justify-content: flex-end; } }
@media (max-width: 991.98px) { .deal-detail-open .deal-filters, .deal-detail-open .directory-intro { display: none; } }
@media (max-width: 575.98px) { .filters { grid-template-columns: repeat(2, minmax(0, 1fr)); } .advanced-filter-fields, .editor { grid-template-columns: minmax(0, 1fr); } .filter-search, .filter-actions { grid-column: 1 / -1; } .filter-actions { justify-content: flex-start; } .deal-filters { padding: 16px; } .deal-heading { flex-wrap: wrap; } .facts { grid-template-columns: minmax(0, 1fr); gap: 4px; } .facts dd { margin-bottom: 8px; } .deal-preview, .decision-panel { padding: 16px; } }
@media (prefers-reduced-motion: reduce) { .records button { transition: none; } }
</style>
