<script setup lang="ts">
import type { CatalogueMerchant, CatalogueVenue } from '@broke-oclock/contracts/admin-catalogue'
import AdminIcon from '@web/components/admin/AdminIcon.vue'
import AdminStatusBadge from '@web/components/admin/AdminStatusBadge.vue'
import { api } from '@web/lib/api-client'
import CatalogueConfirm from '@web/modules/admin-catalogue/CatalogueConfirm.vue'
import { countLabel } from '@web/modules/admin-catalogue/catalogue-labels'
import MerchantEditor from '@web/modules/admin-catalogue/MerchantEditor.vue'
import { onMounted, onUnmounted, ref, shallowRef } from 'vue'

const OUTLET_LIMIT = 100
const props = defineProps<{ merchant: CatalogueMerchant; disabled: boolean; pending: boolean }>()
const emit = defineEmits<{
  save: [body: { name: string; note: string; confirmed: boolean }]
  archive: [body: { note: string; confirmed: boolean }]
  addOutlet: []
  viewOutlets: []
  openOutlet: [id: string]
  denied: [code: 'UNAUTHORIZED' | 'FORBIDDEN']
}>()
const panel = ref<'none' | 'edit' | 'archive'>('none')
const outlets = shallowRef<CatalogueVenue[]>([])
const more = ref(false)
const state = ref<'loading' | 'ready' | 'error'>('loading')
let alive = true
// A read-only preview of this merchant's outlets. Writes always reopen the outlet itself.
const loadOutlets = async () => {
  state.value = 'loading'
  try {
    const page = await api.adminCatalogue.venues({
      merchantId: props.merchant.id,
      status: 'all',
      limit: OUTLET_LIMIT,
    })
    if (!alive) return
    outlets.value = page.items
    more.value = page.nextCursor !== null
    state.value = 'ready'
  } catch (error) {
    if (!alive) return
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
    if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') emit('denied', code)
    state.value = 'error'
  }
}
onMounted(loadOutlets)
onUnmounted(() => {
  alive = false
})
</script>

<template>
  <div class="catalogue-detail-body">
    <div class="catalogue-actions">
      <button type="button" class="btn btn-outline-primary btn-sm" :disabled="disabled || panel === 'edit'" @click="panel = 'edit'">Edit name</button>
      <button type="button" class="btn btn-outline-primary btn-sm" :disabled="disabled" @click="emit('addOutlet')">Add outlet</button>
    </div>
    <MerchantEditor v-if="panel === 'edit'" :merchant="merchant" :disabled="disabled" @save="emit('save', $event)" @cancel="panel = 'none'" />

    <section class="catalogue-section" aria-labelledby="merchant-outlets-title">
      <header class="catalogue-section-heading">
        <h3 id="merchant-outlets-title">Outlets</h3>
        <span class="catalogue-figures catalogue-muted">{{ countLabel(merchant.venueCount, 'outlet') }}</span>
      </header>
      <p v-if="state === 'loading'" role="status" class="catalogue-muted">Loading outlets…</p>
      <p v-else-if="state === 'error'" role="alert" class="catalogue-muted">Couldn’t load the outlets. <button type="button" class="btn btn-link btn-sm p-0" @click="loadOutlets">Try again</button></p>
      <p v-else-if="!outlets.length" class="catalogue-muted">No outlets yet. Add one so deals can use this merchant.</p>
      <template v-else>
        <div class="catalogue-outlet-columns" aria-hidden="true"><span>Outlet</span><span>Location</span><span>Occupancy</span><span>Deals</span></div>
        <ul class="catalogue-outlets">
          <li v-for="outlet in outlets" :key="outlet.id">
            <button type="button" class="catalogue-outlet" :disabled="pending" :data-outlet-id="outlet.id" @click="emit('openOutlet', outlet.id)">
              <span class="catalogue-outlet-name"><strong>{{ outlet.name }}</strong><span class="catalogue-muted">{{ outlet.address }}</span><AdminStatusBadge v-if="outlet.archived" status="ARCHIVED" /></span>
              <span class="catalogue-check-cell" :data-done="outlet.geographyVerified"><AdminIcon :name="outlet.geographyVerified ? 'check' : 'open'" /><span>{{ outlet.geographyVerified ? 'Verified' : 'Needed' }}</span><span class="visually-hidden"> location</span></span>
              <span class="catalogue-check-cell" :data-done="outlet.occupancyVerified"><AdminIcon :name="outlet.occupancyVerified ? 'check' : 'open'" /><span>{{ outlet.occupancyVerified ? 'Verified' : 'Needed' }}</span><span class="visually-hidden"> occupancy</span></span>
              <span class="catalogue-figures">{{ outlet.dealCount }}<span class="visually-hidden"> deals</span></span>
            </button>
          </li>
        </ul>
        <p v-if="more" class="catalogue-muted">Showing the first {{ OUTLET_LIMIT }}.</p>
      </template>
      <button type="button" class="btn btn-link btn-sm catalogue-inline-link" :disabled="pending" @click="emit('viewOutlets')">View outlets for this merchant</button>
    </section>

    <section class="catalogue-section catalogue-danger-zone" aria-label="Archive merchant">
      <CatalogueConfirm
        v-if="panel === 'archive'"
        id="merchant-archive"
        title="Archive this merchant"
        :consequence="`Its ${countLabel(merchant.venueCount, 'outlet')} can no longer be picked for new deals or shown as eligible. Deals, grants, requests and proof are kept. There is no restore.`"
        :confirmation="`I want to archive ${merchant.name}`"
        action="Archive merchant"
        :disabled="disabled"
        @submit="emit('archive', $event)"
        @cancel="panel = 'none'"
      />
      <button v-else type="button" class="btn btn-outline-danger btn-sm" :disabled="disabled" @click="panel = 'archive'">Archive merchant</button>
    </section>
    <p class="catalogue-record-meta"><span translate="no">{{ merchant.id }}</span> · version {{ merchant.version }}</p>
  </div>
</template>

<style scoped src="@web/modules/admin-catalogue/catalogue-editor.css"></style>
