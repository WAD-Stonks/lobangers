<script setup lang="ts">
import AdminStatusBadge from '@web/components/admin/AdminStatusBadge.vue'
import AdminWorkspace from '@web/components/admin/AdminWorkspace.vue'
import TicketLoading from '@web/components/TicketLoading.vue'
import { api } from '@web/lib/api-client'
import EvidenceEditor from '@web/modules/admin-catalogue/EvidenceEditor.vue'
import MerchantEditor from '@web/modules/admin-catalogue/MerchantEditor.vue'
import { useCatalogue } from '@web/modules/admin-catalogue/use-catalogue'
import VenueEditor from '@web/modules/admin-catalogue/VenueEditor.vue'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const emit = defineEmits<{ denied: [code: 'UNAUTHORIZED' | 'FORBIDDEN'] }>()
const state = useCatalogue(api.adminCatalogue, (code) => emit('denied', code))
const {
  kind, search, status, merchantId, items, selected, creating, nextCursor,
  loading, detailLoading, pending, locked, message, listError,
} = state
const heading = ref<HTMLElement | null>(null)
const directory = ref<HTMLElement | null>(null)
const newMerchant = ref<HTMLButtonElement | null>(null)
const hasDetail = computed(() => Boolean(selected.value || creating.value || detailLoading.value))
const detailTitle = computed(() => selected.value?.row.name ?? (creating.value === 'merchant' ? 'New merchant' : 'New outlet'))
watch(() => [selected.value?.row.id, creating.value], async () => {
  if (!selected.value && !creating.value) return
  await nextTick()
  heading.value?.focus()
})
const closeDetail = async () => {
  if (pending.value) return
  const id = selected.value?.row.id
  state.clearSelection()
  await nextTick()
  const button = id ? directory.value?.querySelector<HTMLButtonElement>(`[data-open-id="${id}"]`) : newMerchant.value
  button?.focus()
}
onMounted(() => state.load())
onUnmounted(state.dispose)
</script>

<template>
  <section class="catalogue-panel" :aria-busy="loading || pending">
    <div class="catalogue-introduction">
      <p>Keep merchant names, outlet details and verification up to date.</p>
      <button v-if="kind === 'merchants'" ref="newMerchant" class="btn btn-primary" :disabled="pending" type="button" @click="state.start()">New merchant</button>
    </div>
    <form class="row catalogue-filters" @submit.prevent="state.load()">
      <div><label for="catalogue-kind" class="form-label">Directory</label><select id="catalogue-kind" v-model="kind" :disabled="pending" class="form-select" @change="state.load()"><option value="merchants">Merchants</option><option value="venues">Outlets</option></select></div>
      <div class="catalogue-search"><label for="catalogue-search" class="form-label">Search name / outlet address</label><input id="catalogue-search" v-model="search" :disabled="pending" type="search" class="form-control" maxlength="100" placeholder="Merchant name or outlet address…" /></div>
      <div><label for="catalogue-status" class="form-label">Status</label><select id="catalogue-status" v-model="status" :disabled="pending" class="form-select"><option value="active">Active</option><option value="archived">Archived</option><option value="all">All</option></select></div>
      <button class="btn btn-outline-primary" :disabled="loading || pending" type="submit">Apply filters</button>
      <details v-if="kind === 'venues'" class="catalogue-advanced"><summary>Advanced filters</summary><label for="catalogue-merchant" class="form-label">Merchant ID (optional)</label><input id="catalogue-merchant" v-model="merchantId" :disabled="pending" class="form-control" pattern="[a-f0-9]{24}" autocomplete="off" spellcheck="false" /></details>
    </form>
    <p v-if="message && !hasDetail" role="alert">{{ message }}</p>
    <AdminWorkspace :selected="hasDetail" :disabled="pending" label="Catalogue directory" detail-label="Catalogue details" @close="closeDetail">
      <template #list>
        <div ref="directory">
          <header class="catalogue-list-heading"><h2>{{ kind === 'merchants' ? 'Merchants directory' : 'Outlets directory' }}</h2><span v-if="!loading && !listError" class="catalogue-count">{{ items.length }} loaded</span></header>
          <TicketLoading v-if="loading" label="Loading catalogue…" />
          <div v-if="listError" role="alert" class="catalogue-list-message">Could not load the directory. <button class="btn btn-outline-primary" type="button" @click="state.load()">Retry directory</button></div>
          <p v-else-if="!loading && !items.length" role="status" class="catalogue-list-message">No catalogue rows to show. Apply filters to load or refresh the directory.</p>
          <ul class="catalogue-directory">
            <li v-for="row in items" :key="row.id" :class="{ 'is-selected': selected?.row.id === row.id }">
              <div><strong>{{ row.name }}</strong><p v-if="'address' in row" class="catalogue-address">{{ row.merchantName }} · {{ row.address }}</p><div class="catalogue-statuses"><AdminStatusBadge :status="row.archived ? 'ARCHIVED' : 'ACTIVE'" /><AdminStatusBadge v-if="'selectable' in row" :status="row.selectable ? 'VERIFIED' : 'UNVERIFIED'" :label="row.selectable ? 'Ready for selection' : 'Verification needed'" :tone="row.selectable ? 'success' : 'warning'" /></div></div>
              <button class="btn btn-outline-primary btn-sm" :disabled="pending" :aria-current="selected?.row.id === row.id ? 'true' : undefined" type="button" :data-open-row="row.name" :data-open-id="row.id" @click="state.select(kind, row.id)">Open detail<span class="visually-hidden"> for {{ row.name }}</span></button>
            </li>
          </ul>
          <div v-if="nextCursor" class="catalogue-pagination"><button class="btn btn-outline-primary" type="button" :disabled="loading || pending" @click="state.load(true)">Load next page</button></div>
        </div>
      </template>
      <template #detail>
        <TicketLoading v-if="detailLoading" label="Loading target detail…" />
        <template v-else-if="selected || creating">
          <header class="catalogue-detail-heading"><p class="catalogue-eyebrow">{{ selected?.kind === 'venues' || (creating && creating !== 'merchant') ? 'Outlet details' : 'Merchant details' }}</p><h2 ref="heading" data-testid="catalogue-detail-heading" tabindex="-1">{{ detailTitle }}</h2></header>
          <p v-if="pending" role="status">Saving the captured target and version…</p>
          <div v-if="message" role="alert" class="alert alert-warning">{{ message }} <button v-if="selected" class="btn btn-outline-primary" type="button" :disabled="pending" @click="state.select(selected.kind, selected.row.id)">Reload target detail</button></div>
          <p v-if="selected && locked && !message" class="alert alert-secondary">Archived target or parent — writes are unavailable. No restore or reactivation is offered.</p>
          <MerchantEditor v-if="selected?.kind === 'merchants'" :key="`${selected.row.id}:${selected.row.version}`" :merchant="selected.row" :disabled="pending || locked" @save="state.write('patch', $event)" @archive="state.write('archive', $event)" @add-outlet="state.start(selected.row)" />
          <template v-if="selected?.kind === 'venues'"><VenueEditor :key="`venue:${selected.row.id}:${selected.row.version}`" :venue="selected.row" :disabled="pending || locked" :pending="pending" @save="state.write('patch', $event)" @archive="state.write('archive', $event)" /><EvidenceEditor :key="`proof:${selected.row.id}:${selected.row.version}`" :venue="selected.row" :disabled="pending || locked" @record="state.write('record', $event)" @withdraw="state.write('withdraw', $event)" /></template>
          <MerchantEditor v-if="creating === 'merchant'" key="new-merchant" :disabled="pending || locked" @save="state.write('create', $event)" />
          <VenueEditor v-else-if="creating" :key="`new-venue:${creating.id}:${creating.version}`" :parent="creating" :disabled="pending || locked" :pending="pending" @save="state.write('create', $event)" />
        </template>
        <div v-else class="catalogue-empty-detail"><h2>Select a merchant or outlet</h2><p>Choose a record to review its details, make a correction or check its verification.</p><p v-if="kind === 'venues'">To create an outlet, open its active merchant and choose “Add outlet”.</p><details><summary>How catalogue verification works</summary><p>Unverified rows are visible here only; maintenance does not grant selection authority.</p></details></div>
      </template>
    </AdminWorkspace>
  </section>
</template>

<style scoped>
.catalogue-panel { display: grid; gap: 20px; min-width: 0; }
.catalogue-introduction { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; }
.catalogue-introduction p { margin: 0; color: var(--admin-muted); }
.catalogue-filters { display: grid; grid-template-columns: minmax(130px, .7fr) minmax(200px, 2fr) minmax(120px, .7fr) auto; align-items: end; gap: 12px; margin: 0; padding: 16px; border: 1px solid var(--admin-border); border-radius: 20px; background: var(--admin-surface); }
.catalogue-filters > * { min-width: 0; padding: 0; }
.catalogue-filters > button { padding: 8px 16px; }
.catalogue-advanced { grid-column: 1 / -1; }
.catalogue-advanced summary { color: var(--admin-muted); font-size: 13px; cursor: pointer; }
.catalogue-advanced[open] .form-label { margin-top: 12px; }
.catalogue-advanced .form-control { max-width: 400px; }
.catalogue-list-heading { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; padding: 18px; border-bottom: 1px solid var(--admin-border); }
.catalogue-list-heading h2 { margin: 0; }
.catalogue-count { color: var(--admin-muted); font-size: 12px; }
.catalogue-directory { list-style: none; margin: 0; padding: 0; }
.catalogue-directory li { display: flex; align-items: start; justify-content: space-between; gap: 12px; padding: 18px; border-bottom: 1px solid var(--admin-line); }
.catalogue-directory li > div { min-width: 0; }
.catalogue-directory li.is-selected { background: var(--admin-selected-bg); box-shadow: inset 3px 0 var(--admin-accent); }
.catalogue-directory li > .btn { flex-shrink: 0; }
.catalogue-directory strong { display: block; margin-bottom: 8px; }
.catalogue-address { margin: 0 0 10px; color: var(--admin-muted); font-size: 13px; }
.catalogue-statuses { display: flex; flex-wrap: wrap; gap: 6px; }
.catalogue-pagination, .catalogue-list-message { padding: 18px; }
.catalogue-detail-heading { margin-bottom: 20px; }
.catalogue-detail-heading h2 { margin: 0; font-size: 23px; }
.catalogue-detail-heading h2:focus { outline: none; }
.catalogue-eyebrow { margin: 0 0 6px; color: var(--admin-muted); font-size: 12px; }
.catalogue-empty-detail { padding: 32px 8px; color: var(--admin-muted); text-align: center; }
.catalogue-empty-detail h2 { color: var(--admin-text); }
.catalogue-empty-detail details { margin-top: 24px; text-align: left; }
.catalogue-panel :deep(.catalogue-editor + .catalogue-editor) { margin-top: 28px; padding-top: 24px; border-top: 1px solid var(--admin-border); }
.catalogue-panel :deep(p), .catalogue-panel :deep(code), .catalogue-panel :deep(.catalogue-hash) { overflow-wrap: anywhere; }
.catalogue-panel :deep(.catalogue-hash) { display: block; white-space: normal; }
@media (max-width: 1199.98px) { .catalogue-filters { grid-template-columns: minmax(120px, 1fr) minmax(0, 2fr); } }
@media (max-width: 575.98px) { .catalogue-filters { grid-template-columns: minmax(0, 1fr); } .catalogue-directory li { flex-wrap: wrap; } .catalogue-directory li > div { flex: 1 1 100%; } }
</style>
