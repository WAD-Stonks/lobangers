<script setup lang="ts">
import { api } from '@web/lib/api-client'
import EvidenceEditor from '@web/modules/admin-catalogue/EvidenceEditor.vue'
import MerchantEditor from '@web/modules/admin-catalogue/MerchantEditor.vue'
import { useCatalogue } from '@web/modules/admin-catalogue/use-catalogue'
import VenueEditor from '@web/modules/admin-catalogue/VenueEditor.vue'
import { onMounted, onUnmounted } from 'vue'

const emit = defineEmits<{ denied: [code: 'UNAUTHORIZED' | 'FORBIDDEN'] }>()
const state = useCatalogue(api.adminCatalogue, (code) => emit('denied', code))
const {
  kind,
  search,
  status,
  merchantId,
  items,
  selected,
  creating,
  nextCursor,
  loading,
  detailLoading,
  pending,
  locked,
  message,
  listError,
} = state
onMounted(() => state.load())
onUnmounted(state.dispose)
</script>
<template>
  <section class="catalogue-panel" :aria-busy="loading || pending">
    <p class="admin-eyebrow">Canonical catalogue</p>
    <p>Maintain merchant identities and resolved outlets. Unverified rows are visible here only; maintenance does not grant selection authority.</p>
    <form class="row g-3 align-items-end" @submit.prevent="state.load()">
      <div class="col-12 col-md-3"><label for="catalogue-kind" class="form-label">Directory</label><select id="catalogue-kind" v-model="kind" :disabled="pending" class="form-select" @change="state.load()"><option value="merchants">Merchants</option><option value="venues">Outlets</option></select></div>
      <div class="col-12 col-md-4"><label for="catalogue-search" class="form-label">Search name / outlet address</label><input id="catalogue-search" v-model="search" :disabled="pending" type="search" class="form-control" maxlength="100" /></div>
      <div class="col-12 col-md-3"><label for="catalogue-status" class="form-label">Status</label><select id="catalogue-status" v-model="status" :disabled="pending" class="form-select"><option value="active">Active</option><option value="archived">Archived</option><option value="all">All</option></select></div>
      <div class="col-12 col-md-2"><button class="btn btn-outline-primary w-100" :disabled="loading || pending" type="submit">Apply filters</button></div>
      <div v-if="kind === 'venues'" class="col-12 col-md-6"><label for="catalogue-merchant" class="form-label">Filter merchant ID (optional)</label><input id="catalogue-merchant" v-model="merchantId" :disabled="pending" class="form-control" pattern="[a-f0-9]{24}" /></div>
    </form>
    <div class="d-flex justify-content-between flex-wrap gap-2 my-4"><h2>{{ kind === 'merchants' ? 'Merchants directory' : 'Outlets directory' }}</h2><button v-if="kind === 'merchants'" class="btn btn-primary" :disabled="pending" type="button" @click="state.start()">New merchant</button><p v-else class="small">To create an outlet, open its active merchant and choose “Add outlet”.</p></div>
    <p v-if="loading" role="status">Loading catalogue…</p>
    <div v-if="listError" role="alert" class="alert alert-danger">Could not load the directory. <button class="btn btn-outline-primary" type="button" @click="state.load()">Retry directory</button></div>
    <p v-else-if="!loading && !items.length" role="status">No catalogue rows to show. Apply filters to load or refresh the directory.</p>
    <ul class="list-group catalogue-directory">
      <li v-for="row in items" :key="row.id" class="list-group-item d-flex justify-content-between align-items-start gap-3">
        <div><strong>{{ row.name }}</strong><p class="mb-1 small">{{ row.archived ? 'Archived' : 'Active' }} · version {{ row.version }} <span v-if="'selectable' in row">· {{ row.selectable ? 'Selectable' : 'Unselectable — maintenance only' }}</span></p><p v-if="'address' in row" class="mb-0">{{ row.merchantName }} · {{ row.address }}</p></div>
        <button class="btn btn-outline-primary btn-sm flex-shrink-0" :disabled="pending" type="button" :aria-label="`Open ${row.name}`" @click="state.select(kind, row.id)">Open detail</button>
      </li>
    </ul>
    <button v-if="nextCursor" class="btn btn-outline-primary mt-3" type="button" :disabled="loading || pending" @click="state.load(true)">Load next page</button>
    <p v-if="detailLoading" role="status">Loading target detail…</p>
    <p v-if="pending" role="status" class="alert alert-info mt-3">Saving the captured target and version…</p>
    <div v-if="message" role="alert" class="alert alert-warning mt-3">{{ message }} <button v-if="selected" class="btn btn-outline-primary" type="button" :disabled="pending" @click="state.select(selected.kind, selected.row.id)">Reload target detail</button></div>
    <p v-if="selected && locked && !message" class="alert alert-secondary mt-4">Archived target or parent — writes are unavailable. No restore or reactivation is offered.</p>
    <MerchantEditor v-if="selected?.kind === 'merchants'" :key="`${selected.row.id}:${selected.row.version}`" :merchant="selected.row" :disabled="pending || locked" @save="state.write('patch', $event)" @archive="state.write('archive', $event)" @add-outlet="state.start(selected.row)" />
    <template v-if="selected?.kind === 'venues'"><VenueEditor :key="`venue:${selected.row.id}:${selected.row.version}`" :venue="selected.row" :disabled="pending || locked" @save="state.write('patch', $event)" @archive="state.write('archive', $event)" /><EvidenceEditor :key="`proof:${selected.row.id}:${selected.row.version}`" :venue="selected.row" :disabled="pending || locked" @record="state.write('record', $event)" @withdraw="state.write('withdraw', $event)" /></template>
    <MerchantEditor v-if="creating === 'merchant'" key="new-merchant" :disabled="pending || locked" @save="state.write('create', $event)" />
    <VenueEditor v-else-if="creating" :key="`new-venue:${creating.id}:${creating.version}`" :parent="creating" :disabled="pending || locked" @save="state.write('create', $event)" />
  </section>
</template>
<style scoped>
.catalogue-panel, .catalogue-editor { min-width: 0; }
.catalogue-panel :deep(.row) { margin-inline: 0; }
.catalogue-panel :deep(p), .catalogue-panel :deep(code), .catalogue-panel :deep(.list-group-item) { overflow-wrap: anywhere; }
.catalogue-panel :deep(.catalogue-hash) { display: block; white-space: normal; }
.catalogue-editor { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--bs-border-color); }
.catalogue-directory p, .catalogue-editor p, .catalogue-hash, .list-group-item { overflow-wrap: anywhere; }
.catalogue-directory .list-group-item > div { min-width: 0; }
.catalogue-hash { display: block; white-space: normal; }
fieldset { min-width: 0; }
</style>
