<script setup lang="ts">
import type { AdminDealsClient } from '@broke-oclock/api-client/admin-deals'
import {
  type AdminDealContentRequest,
  adminDealContentChangesSchema,
} from '@broke-oclock/contracts/admin-deals'
import { DEAL_CATEGORIES } from '@broke-oclock/contracts/deal-categories'
import { DEAL_CUISINES } from '@broke-oclock/contracts/deal-cuisines'
import { api } from '@web/lib/api-client'
import { useAdminDeals } from '@web/modules/admin-deals/use-admin-deals'
import { onMounted, onUnmounted, reactive, ref, watch } from 'vue'

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
const editor = reactive<Record<string, string>>({})
const scope = reactive({ applicability: 'ONLINE', merchantId: '', venueIds: '' })
const evidence = reactive({ reference: '', statement: '', citationId: '', staffConfirmed: false })
const fieldLabels: Record<string, string> = {
  title: 'Title (40 characters)',
  description: 'Description (120 characters)',
  terms: 'Terms (plain text)',
  category: 'Category',
  cuisine: 'Cuisine',
  offerType: 'Offer type',
  priceMinor: 'Price (minor units; SGD cents)',
  currency: 'Currency (SGD)',
  discountPercent: 'Discount percent',
  validFrom: 'Valid from (ISO UTC)',
  validUntil: 'Valid until, exclusive (ISO UTC)',
  rawValidityText: 'Original validity text',
}
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
  if (!row) return
  for (const key of fields) editor[key] = row[key] == null ? '' : String(row[key])
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
  for (const key of fields) {
    const raw = editor[key] ?? ''
    const value = ['priceMinor', 'discountPercent'].includes(key)
      ? raw === ''
        ? null
        : Number(raw)
      : ['terms', 'cuisine', 'validFrom', 'validUntil', 'rawValidityText'].includes(key) &&
          raw === ''
        ? null
        : raw
    if (value !== row[key]) changes[key] = value
  }
  const parsed = adminDealContentChangesSchema.safeParse(changes)
  if (!parsed.success) {
    validation.value =
      'Enter at least one valid correction. Title 40 characters, description 120; amounts use minor units, dates use ISO UTC.'
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
  if (!row) return
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
const amount = (minor: number | null, currency: string) =>
  minor == null ? 'Not recorded' : `${currency} ${(minor / 100).toFixed(2)}`
onMounted(() => state.load())
onUnmounted(state.dispose)
</script>
<template>
 <section class="deals-directory" aria-label="Deals operations">
  <header><p class="eyebrow">Catalogue / deals</p><h2>Deals directory</h2><p>All origins. Correct the record, inspect the source, then make a separate review decision.</p></header>
  <form class="filters" @submit.prevent="state.load()">
   <label>Search<input v-model="filters.search" name="search" class="form-control" maxlength="100" /></label>
   <label>Origin<select v-model="filters.origin" class="form-select"><option value="">All origins</option><option>IMPORTED</option><option>USER_SUBMITTED</option></select></label>
   <label>Review<select v-model="filters.reviewStatus" class="form-select"><option value="">All states</option><option>PENDING</option><option>APPROVED</option><option>REJECTED</option><option>HIDDEN</option></select></label>
   <label>Publication<select v-model="filters.publication" class="form-select"><option value="">Any publication</option><option>PUBLISHED</option><option>UNPUBLISHED</option><option>EXPIRED</option></select></label>
   <label>Merchant ID<input v-model="filters.merchantId" class="form-control" maxlength="24" /></label>
   <label class="check"><input v-model="filters.includeDeleted" type="checkbox" /> Include deleted, investigation only</label>
   <button type="submit" data-testid="reload-list" class="btn btn-outline-primary" :disabled="loading">Apply / reload directory</button>
   <button type="button" data-testid="clear-deal-filters" class="btn btn-outline-secondary" :disabled="loading || pending" @click="state.clearFilters()">Clear filters</button>
  </form>
  <p class="small text-secondary">Applied filters are remembered until you reload or sign out.</p>
  <p v-if="loading" role="status">Loading deals…</p><p v-if="status === 'ready' && !items.length" role="status">No deals match these filters.</p>
  <p v-if="message" role="status" class="notice">{{ message }}</p>
  <div class="operations-grid">
   <nav aria-label="Deal records"><ol class="records"><li v-for="item in items" :key="item.id"><button type="button" data-testid="select-deal" :aria-current="selected?.id === item.id ? 'true' : undefined" @click="state.select(item.id)"><strong>{{ item.title }}</strong><span>{{ item.origin }} · {{ item.reviewStatus }} · {{ item.publication }}</span><small>{{ item.id }} · content {{ item.contentVersion }} / operation {{ item.operationVersion }}</small></button></li></ol><button v-if="cursor" type="button" class="btn btn-outline-primary" :disabled="loading" @click="state.load(true)">Load more deals</button></nav>
   <div class="detail"><p v-if="reading" role="status">Loading full deal evidence…</p><p v-else-if="!selected">Select a deal to inspect its complete content and current blockers.</p>
    <article v-if="selected" :aria-busy="pending">
     <header><p class="eyebrow">{{ selected.origin }} / {{ selected.publication }}</p><h3>{{ selected.title }}</h3><p class="identity">{{ selected.id }} · content {{ selected.contentVersion }} / operation {{ selected.operationVersion }}</p><button type="button" class="btn btn-outline-primary" data-testid="refresh-deal" :disabled="reading || pending" @click="state.select(selected.id)">Refresh exact deal</button></header>
     <p class="copy">{{ selected.description }}</p><p class="copy">{{ selected.terms }}</p>
     <dl class="facts"><dt>Offer</dt><dd>{{ selected.offerType }} · {{ amount(selected.priceMinor, selected.currency) }} · {{ selected.discountPercent == null ? 'No percentage recorded' : `${selected.discountPercent}%` }}</dd><dt>Validity (UTC)</dt><dd>{{ selected.validFrom ?? 'No known start' }} → {{ selected.validUntil ?? 'Open ended / no known end' }}<br />{{ selected.rawValidityText }}</dd><dt>Review / publication</dt><dd>{{ selected.reviewStatus }} / {{ selected.publication }}. Published at {{ selected.publishedAt ?? 'not published' }}. {{ selected.reviewNote }}</dd><dt>Scope</dt><dd>{{ selected.applicability }} · merchant {{ selected.merchantId ?? 'none' }} · {{ selected.outletCount }} outlets. {{ selected.scopeEvidenceLabel ?? 'No current scope evidence' }}</dd></dl>
     <ul v-if="selected.blockers.length" class="blockers"><li v-for="blocker in selected.blockers" :key="blocker">{{ blocker.replaceAll('_',' ') }}</li></ul>
     <details><summary>Original pinned sources and images (read only)</summary><p v-if="!selected.sources.length">User submission - no scraped citation is fabricated.</p><div v-for="source in selected.sources" :key="source.citationId"><a v-if="source.sourceUrl" :href="source.sourceUrl" target="_blank" rel="noopener noreferrer">{{ source.sourceUrl }}</a><p>{{ source.citationId }} · {{ source.sourceContentHash }} · {{ source.current ? 'current' : 'changed source' }}</p><pre>{{ source.sourceContentSnapshot }}</pre></div><a v-for="(image, index) in selected.images" :key="index" :href="image.url ?? undefined" target="_blank" rel="noopener noreferrer">{{ image.url ?? 'Unsafe image link omitted' }}</a></details>
     <details><summary>Outlets: {{ selected.outletCount }} total - display is paginated, readiness uses every edge</summary><ol><li v-for="venue in selected.outlets" :key="venue.id">{{ venue.name }} - {{ venue.address }} · {{ venue.id }} · {{ venue.deletedAt ? 'deleted' : 'active' }} · geography {{ venue.geographyReady ? 'verified' : 'unverified' }} / occupancy {{ venue.occupancyReady ? 'verified' : 'unverified' }}</li></ol><button v-if="selected.nextOutletCursor" type="button" class="btn btn-outline-primary" @click="state.select(selected.id, selected.nextOutletCursor ?? undefined)">Next outlet page</button></details>
     <p v-if="selected.deletedAt" role="alert">Deleted record: investigation only. All writes are disabled.</p>
     <label class="action-picker">Operation<select v-model="action" class="form-select" :disabled="pending"><option value="content">Correct content</option><option value="scope">Replace complete scope</option><option value="evidence">Record reviewed scope evidence</option><option value="APPROVE">Approve review</option><option value="REJECT">Reject review</option><option value="unpublish">Unpublish</option><option value="reopen">Reopen for new review</option></select></label>
     <form @submit.prevent="action === 'content' ? saveContent() : submitAction()">
      <fieldset :disabled="blocked"><legend>{{ action === 'content' ? 'Content correction' : 'Explicit administrative operation' }}</legend>
       <div v-if="action === 'content'" class="editor"><label v-for="field in fields" :key="field">{{ fieldLabels[field] }}<select v-if="field === 'category'" v-model="editor[field]" :name="`edit-${field}`" class="form-select"><option v-for="value in DEAL_CATEGORIES" :key="value">{{ value }}</option></select><select v-else-if="field === 'cuisine'" v-model="editor[field]" :name="`edit-${field}`" class="form-select"><option value="">No cuisine</option><option v-for="value in DEAL_CUISINES" :key="value">{{ value }}</option></select><select v-else-if="field === 'offerType'" v-model="editor[field]" :name="`edit-${field}`" class="form-select"><option>FIXED_PRICE</option><option>PERCENT_OFF</option><option>BUY_ONE_GET_ONE</option><option>OTHER</option></select><textarea v-else v-model="editor[field]" :name="`edit-${field}`" class="form-control" rows="2" /></label></div>
       <div v-else-if="action === 'scope'"><p>Replace the complete selected set, not just the displayed page. This clears approval and scope proof.</p><p v-if="!selected.scopeEditable">Existing set exceeds 100 edges and is read only. Do not truncate it.</p><label>Applicability<select v-model="scope.applicability" class="form-select"><option>SELECTED_OUTLETS</option><option>ALL_MERCHANT_OUTLETS</option><option>ONLINE</option><option>NO_FIXED_LOCATION</option></select></label><label>Merchant ID (blank means none)<input v-model="scope.merchantId" class="form-control" /></label><label>Complete venue IDs, one per line<textarea v-model="scope.venueIds" class="form-control" rows="5" :disabled="!selected.scopeEditable" /></label></div>
       <div v-else-if="action === 'evidence'"><p>This receipt does not publish. Review an actual merchant/campaign reference; the server never fetches it or infers a location.</p><label>Supporting URL or source reference<input v-model="evidence.reference" name="reference" class="form-control" /></label><label>Reviewed scope statement<textarea v-model="evidence.statement" name="statement" class="form-control" rows="3" /></label><label v-if="selected.origin === 'IMPORTED'">Exact pinned citation<select v-model="evidence.citationId" class="form-select"><option value="">Choose reviewed citation</option><option v-for="source in selected.sources" :key="source.citationId" :value="source.citationId">{{ source.citationId }} · {{ source.sourceUrl }}</option></select></label><label class="check"><input v-model="evidence.staffConfirmed" type="checkbox" /> I reviewed this supporting source and confirmed the complete stated scope.</label></div>
       <p v-else>Review and publication are distinct. Approval without current evidence stays unpublished. Reopen always requires a new review; it never restores publication.</p>
       <label>Required reason<textarea v-model="consent.note" name="note" class="form-control" rows="2" maxlength="500" /></label>
       <label class="check"><input v-model="consent.confirmed" name="confirm" type="checkbox" /> I confirm {{ action }} for {{ selected.title }} ({{ selected.id }}), content {{ selected.contentVersion }} / operation {{ selected.operationVersion }}, scope {{ selected.applicability }} / {{ selected.outletCount }} outlets, and the complete changes entered above.</label>
       <p v-if="validation" role="alert">{{ validation }}</p>
       <button type="submit" class="btn btn-primary" :data-testid="action === 'content' ? 'save-content' : 'save-operation'" :disabled="blocked || !consent.note.trim() || !consent.confirmed || (action === 'scope' && !selected.scopeEditable)">{{ pending ? 'Saving…' : action === 'content' ? 'Save content correction' : 'Confirm operation' }}</button>
      </fieldset>
     </form>
    </article>
   </div>
  </div>
 </section>
</template>
<style scoped>
.deals-directory{color:var(--bs-body-color,#302d28);background:var(--bs-body-bg,#faf7f0);padding:1.5rem;border:1px solid var(--bs-border-color,#d7d0c5)}h2,h3{font-family:Georgia,serif}.eyebrow{font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;color:var(--bs-secondary-color,#665f53)}.filters,.editor{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;margin:1.5rem 0}label{display:block}.filters label,.editor label{min-width:0}.operations-grid{display:grid;grid-template-columns:minmax(16rem,1fr) minmax(0,2fr);gap:1.5rem;border-top:1px solid var(--bs-border-color,#d7d0c5);padding-top:1.5rem}.records{list-style:none;padding:0}.records button{display:grid;gap:.5rem;text-align:left;background:transparent;color:inherit;border:0;border-bottom:1px solid var(--bs-border-color,#d7d0c5);padding:1rem;width:100%;overflow-wrap:anywhere}.records button[aria-current=true]{background:#ece5d7;border-left:3px solid #795a2e}.records span,.records small,.identity{font-size:.75rem}.detail{min-width:0}.copy,pre{white-space:pre-wrap;overflow-wrap:anywhere}.facts dd{margin-bottom:1rem}.notice,.blockers{padding:1rem;background:#eee7d9;color:#443a28}.check{display:flex;align-items:start;gap:.5rem;margin:1rem 0}.action-picker{display:block;margin:1.5rem 0}details{border-top:1px solid var(--bs-border-color,#d7d0c5);padding:1rem 0}fieldset{min-width:0}a{overflow-wrap:anywhere}:focus-visible{outline:3px solid #775822;outline-offset:3px}@media(max-width:800px){.operations-grid,.filters,.editor{grid-template-columns:minmax(0,1fr)}.deals-directory{padding:1rem}}
</style>
