<script setup lang="ts">
import type { CatalogueVenue } from '@broke-oclock/contracts/admin-catalogue'
import AppSelect from '@web/components/AppSelect.vue'
import AdminStatusBadge from '@web/components/admin/AdminStatusBadge.vue'
import AdminTaskLink from '@web/components/admin/AdminTaskLink.vue'
import AdminWorkspace from '@web/components/admin/AdminWorkspace.vue'
import AdminWorkspaceTabs from '@web/components/admin/AdminWorkspaceTabs.vue'
import type { SelectOption } from '@web/components/select-options'
import TicketLoading from '@web/components/TicketLoading.vue'
import { api } from '@web/lib/api-client'
import { countLabel, missingSummary } from '@web/modules/admin-catalogue/catalogue-labels'
import MerchantDetail from '@web/modules/admin-catalogue/MerchantDetail.vue'
import MerchantEditor from '@web/modules/admin-catalogue/MerchantEditor.vue'
import OutletDetail from '@web/modules/admin-catalogue/OutletDetail.vue'
import { useCatalogue } from '@web/modules/admin-catalogue/use-catalogue'
import { type CatalogueView, useCatalogueNavigation } from '@web/modules/admin-catalogue/use-catalogue-navigation'
import VenueEditor from '@web/modules/admin-catalogue/VenueEditor.vue'
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'

const STATUS_OPTIONS: readonly SelectOption[] = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
]
const SEARCH_DELAY = 300

const emit = defineEmits<{ denied: [code: 'UNAUTHORIZED' | 'FORBIDDEN'] }>()
const denied = (code: 'UNAUTHORIZED' | 'FORBIDDEN') => emit('denied', code)
const state = useCatalogue(api.adminCatalogue, denied)
const navigation = useCatalogueNavigation(state)
const { notice: navigationNotice, returnTo, merchantName } = navigation
const {
  search, status, merchantId, items, selected, creating, nextCursor, summary,
  loading, detailLoading, pending, locked, message, listError,
} = state
const heading = ref<HTMLElement | null>(null)
const directory = ref<HTMLElement | null>(null)
const newMerchant = ref<HTMLButtonElement | null>(null)

const view = computed<CatalogueView>({
  get: () => navigation.view.value,
  set: (next) => void navigation.changeView(next),
})
const tabs = computed(() => [
  { id: 'queue', label: summary.value ? `To verify (${summary.value.needsVerification})` : 'To verify' },
  { id: 'merchants', label: 'Merchants' },
  { id: 'venues', label: 'Outlets' },
])
const listTitle = computed(() =>
  view.value === 'queue' ? 'Needs verification' : view.value === 'merchants' ? 'Merchants' : 'Outlets',
)
const introduction = computed(() => {
  if (view.value !== 'queue') return 'Merchants and their outlets. Deals can only use outlets that are verified.'
  if (!summary.value) return 'Outlets deals can’t use yet, until someone checks them.'
  const { needsVerification: total, needsVerificationWithDeals: blocked } = summary.value
  if (!total) return 'Every active outlet is verified.'
  return `${countLabel(total, 'outlet')} can’t be picked for deals yet${blocked ? `. ${blocked} already ${blocked === 1 ? 'has' : 'have'} deals waiting` : ''}.`
})
const searchPlaceholder = computed(() => (view.value === 'merchants' ? 'Search merchants' : 'Search outlets by name, address or postal code'))
const emptyText = computed(() =>
  search.value.trim()
    ? `Nothing matches “${search.value.trim()}”.`
    : view.value === 'queue'
      ? 'Nothing to verify. Every active outlet is ready for deals.'
      : 'Nothing here yet.',
)

let searchTimer: ReturnType<typeof setTimeout> | undefined
const searchSoon = () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => void navigation.applyFilters(), SEARCH_DELAY)
}
const searchNow = () => {
  clearTimeout(searchTimer)
  void navigation.applyFilters()
}

const venueRow = (row: unknown) => row as CatalogueVenue
const hasDetail = computed(() => Boolean(selected.value || creating.value || detailLoading.value))
const detailTitle = computed(() => selected.value?.row.name ?? (creating.value === 'merchant' ? 'New merchant' : 'New outlet'))
const creatingOutlet = computed(() => (creating.value && creating.value !== 'merchant' ? creating.value : null))
watch(() => [selected.value?.row.id, creating.value], async () => {
  if (!selected.value && !creating.value) return
  await nextTick()
  heading.value?.focus()
})
const closeDetail = async () => {
  if (pending.value) return
  const id = selected.value?.row.id
  await navigation.closeRecord()
  await nextTick()
  const button = id ? directory.value?.querySelector<HTMLButtonElement>(`[data-open-id="${id}"]`) : newMerchant.value
  button?.focus()
}
onUnmounted(() => {
  clearTimeout(searchTimer)
  state.dispose()
})
</script>

<template>
  <section class="catalogue-panel" :aria-busy="loading || pending">
    <div v-if="returnTo" class="catalogue-return"><AdminTaskLink :to="returnTo" class="btn btn-outline-secondary btn-sm" :disabled="pending">← Back to previous task</AdminTaskLink></div>
    <div class="catalogue-introduction">
      <p>{{ introduction }}</p>
      <button ref="newMerchant" class="btn btn-primary" :disabled="pending" type="button" @click="navigation.startMerchant">New merchant</button>
    </div>
    <AdminWorkspaceTabs v-model="view" :tabs="tabs" id-prefix="catalogue" label="Merchants and outlets views" :disabled="pending" class="catalogue-tabs" />
    <form class="catalogue-toolbar" @submit.prevent="searchNow">
      <label for="catalogue-search" class="visually-hidden">Search</label>
      <input id="catalogue-search" v-model="search" :disabled="pending" type="search" class="form-control" maxlength="100" autocomplete="off" :placeholder="searchPlaceholder" @input="searchSoon" />
      <template v-if="view !== 'queue'">
        <label for="catalogue-status" class="visually-hidden">Status</label>
        <AppSelect id="catalogue-status" v-model="status" :options="STATUS_OPTIONS" :disabled="pending" class="form-select" @change="searchNow" />
      </template>
    </form>
    <section v-if="view === 'venues' && merchantId" class="catalogue-merchant-context" aria-label="Merchant outlet context"><p>Outlets of <strong>{{ merchantName }}</strong></p><div class="catalogue-context-actions"><button type="button" class="btn btn-outline-primary btn-sm" :disabled="pending" @click="navigation.viewMerchant">View merchant</button><button type="button" class="btn btn-outline-secondary btn-sm" :disabled="pending" @click="navigation.clearMerchant">Show all outlets</button></div></section>
    <p v-if="navigationNotice" role="alert">{{ navigationNotice }}</p>
    <p v-if="message && !hasDetail" role="alert">{{ message }}</p>
    <AdminWorkspace :id="`catalogue-panel-${view}`" role="tabpanel" :aria-labelledby="`catalogue-tab-${view}`" :selected="hasDetail" :disabled="pending" label="Catalogue directory" detail-label="Catalogue details" @close="closeDetail">
      <template #list>
        <div ref="directory">
          <header class="catalogue-list-heading"><h2>{{ listTitle }}</h2><span v-if="!loading && !listError" class="catalogue-count">{{ items.length }}{{ nextCursor ? '+' : '' }} shown</span></header>
          <TicketLoading v-if="loading" label="Loading…" />
          <div v-if="listError" role="alert" class="catalogue-list-message">Couldn’t load this list. <button class="btn btn-outline-primary btn-sm" type="button" @click="searchNow">Try again</button></div>
          <p v-else-if="!loading && !items.length" role="status" class="catalogue-list-message">{{ emptyText }}</p>
          <ul class="catalogue-directory">
            <li v-for="row in items" :key="row.id">
              <button class="catalogue-row" :class="{ 'is-selected': selected?.row.id === row.id }" :disabled="pending" :aria-current="selected?.row.id === row.id ? 'true' : undefined" type="button" :data-open-row="row.name" :data-open-id="row.id" @click="navigation.openRecord('address' in row ? 'venues' : 'merchants', row.id)">
                <span class="catalogue-row-heading"><strong>{{ row.name }}</strong><AdminStatusBadge v-if="row.archived" status="ARCHIVED" /><AdminStatusBadge v-else-if="'address' in row && view !== 'queue' && !venueRow(row).selectable" status="UNVERIFIED" label="Not ready" tone="warning" /></span>
                <template v-if="'address' in row">
                  <span class="catalogue-row-meta">{{ venueRow(row).merchantName }} · {{ venueRow(row).address }}</span>
                  <span v-if="view === 'queue'" class="catalogue-row-meta catalogue-row-needs">{{ missingSummary(venueRow(row)) }}<template v-if="venueRow(row).dealCount"> · <span class="catalogue-row-waiting">{{ countLabel(venueRow(row).dealCount, 'deal') }} waiting</span></template></span>
                </template>
                <span v-else class="catalogue-row-meta catalogue-figures">{{ countLabel(row.venueCount, 'outlet') }} · {{ countLabel(row.dealCount, 'deal') }}</span>
              </button>
            </li>
          </ul>
          <div v-if="nextCursor" class="catalogue-pagination"><button class="btn btn-outline-primary btn-sm" type="button" :disabled="loading || pending" @click="navigation.loadMore">Show more</button></div>
        </div>
      </template>
      <template #detail>
        <TicketLoading v-if="detailLoading" label="Loading…" />
        <template v-else-if="selected || creating">
          <header class="catalogue-detail-heading">
            <div class="catalogue-detail-title">
              <p class="catalogue-eyebrow">
                <template v-if="selected?.kind === 'venues'">Outlet of <button type="button" class="btn btn-link p-0 catalogue-eyebrow-link" :disabled="pending" @click="navigation.viewMerchant">{{ selected.row.merchantName }}</button></template>
                <template v-else-if="creatingOutlet">New outlet of {{ creatingOutlet.name }}</template>
                <template v-else>Merchant</template>
              </p>
              <h2 ref="heading" data-testid="catalogue-detail-heading" tabindex="-1">{{ detailTitle }}</h2>
              <p v-if="selected?.kind === 'merchants'" class="catalogue-detail-meta catalogue-figures">{{ countLabel(selected.row.venueCount, 'outlet') }} · {{ countLabel(selected.row.dealCount, 'deal') }}</p>
              <p v-else-if="selected?.kind === 'venues'" class="catalogue-detail-meta">{{ selected.row.address }}</p>
            </div>
            <AdminStatusBadge v-if="selected?.row.archived" status="ARCHIVED" />
          </header>
          <p v-if="pending" role="status" class="catalogue-muted">Saving…</p>
          <div v-if="message" role="alert" class="alert alert-warning">{{ message }} <button v-if="selected" class="btn btn-outline-primary btn-sm" type="button" :disabled="pending" @click="state.select(selected.kind, selected.row.id)">Reload target detail</button></div>
          <p v-if="selected && locked && !message" class="catalogue-muted">{{ selected.kind === 'venues' && selected.row.parentArchived ? 'Its merchant is archived' : 'Archived' }}, so it can’t be changed. There is no restore.</p>
          <MerchantDetail v-if="selected?.kind === 'merchants'" :key="`${selected.row.id}:${selected.row.version}`" :merchant="selected.row" :disabled="pending || locked" :pending="pending" @save="navigation.write('patch', $event)" @archive="navigation.write('archive', $event)" @add-outlet="state.start(selected.row)" @view-outlets="navigation.viewOutlets(selected.row)" @open-outlet="navigation.openOutlet(selected.row, $event)" @denied="denied" />
          <OutletDetail v-if="selected?.kind === 'venues'" :key="`venue:${selected.row.id}:${selected.row.version}`" :venue="selected.row" :disabled="pending || locked" :pending="pending" @save="navigation.write('patch', $event)" @archive="navigation.write('archive', $event)" @record="navigation.write('record', $event)" @withdraw="navigation.write('withdraw', $event)" @denied="denied" />
          <MerchantEditor v-if="creating === 'merchant'" key="new-merchant" :disabled="pending || locked" @save="navigation.write('create', $event)" @cancel="closeDetail" />
          <VenueEditor v-else-if="creatingOutlet" :key="`new-venue:${creatingOutlet.id}:${creatingOutlet.version}`" :parent="creatingOutlet" :disabled="pending || locked" :pending="pending" @save="navigation.write('create', $event)" @cancel="state.select('merchants', creatingOutlet.id)" @denied="denied" />
        </template>
        <div v-else class="catalogue-empty-detail">
          <h2>{{ view === 'queue' ? 'Pick an outlet to verify' : 'Pick a merchant or outlet' }}</h2>
          <p v-if="view === 'queue'">Each outlet needs two checks before deals can fully use it: that the merchant trades there, and that the address and pin are right.</p>
          <p v-else>Open a record to see its outlets, fix its details or verify it.</p>
        </div>
      </template>
    </AdminWorkspace>
  </section>
</template>

<style scoped>
.catalogue-panel { display: grid; gap: 16px; min-width: 0; }
.catalogue-introduction { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; }
.catalogue-introduction p { margin: 0; color: var(--admin-muted); }
.catalogue-tabs { margin-bottom: 0; width: fit-content; }
.catalogue-toolbar { display: flex; flex-wrap: wrap; gap: 12px; margin: 0; }
.catalogue-toolbar .form-control { flex: 1 1 320px; min-width: 0; }
.catalogue-toolbar :deep(.form-select), .catalogue-toolbar > .form-select { flex: 0 0 160px; }
.catalogue-merchant-context { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border: 1px solid var(--admin-border); border-radius: 16px; background: var(--admin-surface); }
.catalogue-merchant-context p { margin: 0; }
.catalogue-context-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.catalogue-list-heading { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; padding: 16px 20px; border-bottom: 1px solid var(--admin-border); }
.catalogue-list-heading h2 { margin: 0; font-size: 18px; }
.catalogue-count { color: var(--admin-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.catalogue-directory { list-style: none; margin: 0; padding: 0; }
.catalogue-row { display: grid; gap: 4px; width: 100%; padding: 12px 20px; border: 0; border-bottom: 1px solid var(--admin-line); background: transparent; color: var(--admin-text); text-align: left; font: inherit; cursor: pointer; transition: background-color 120ms ease-out; }
.catalogue-row:hover { background: var(--admin-hover); }
.catalogue-row.is-selected { background: var(--admin-selected-bg); box-shadow: inset 3px 0 var(--admin-accent); }
.catalogue-row:disabled { opacity: .6; cursor: not-allowed; }
.catalogue-row-heading { display: flex; align-items: start; justify-content: space-between; gap: 8px; min-width: 0; }
.catalogue-row-heading strong { min-width: 0; font-size: 15px; font-weight: 500; line-height: 1.5; }
.catalogue-row-meta { color: var(--admin-muted); font-size: 13px; line-height: 1.5; }
.catalogue-row-needs { color: var(--admin-text); }
.catalogue-row-waiting { color: var(--admin-warning-ink); font-weight: 500; }
.catalogue-figures { font-variant-numeric: tabular-nums; }
.catalogue-muted { color: var(--admin-muted); }
.catalogue-pagination, .catalogue-list-message { padding: 16px 20px; }
.catalogue-detail-heading { display: flex; align-items: start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
.catalogue-detail-title { min-width: 0; }
.catalogue-detail-heading h2 { margin: 0; font-size: 24px; line-height: 1.25; }
.catalogue-detail-heading h2:focus { outline: none; }
.catalogue-detail-meta { margin: 4px 0 0; color: var(--admin-muted); font-size: 14px; }
.catalogue-eyebrow { margin: 0 0 4px; color: var(--admin-muted); font-size: 13px; }
.catalogue-eyebrow-link { font-size: inherit; vertical-align: baseline; }
.catalogue-empty-detail { padding: 32px 8px; color: var(--admin-muted); text-align: center; }
.catalogue-empty-detail h2 { color: var(--admin-text); font-size: 18px; }
.catalogue-empty-detail p { max-width: 440px; margin-inline: auto; }
.catalogue-panel :deep(p), .catalogue-panel :deep(code) { overflow-wrap: anywhere; }
@media (max-width: 575.98px) { .catalogue-tabs { width: auto; } .catalogue-row, .catalogue-list-heading, .catalogue-pagination, .catalogue-list-message { padding-inline: 16px; } }
</style>
