<script setup lang="ts">
import type { CatalogueMerchant, CatalogueVenue } from '@broke-oclock/contracts/admin-catalogue'
import type { AdminDealDetail } from '@broke-oclock/contracts/admin-deals'
import { api } from '@web/lib/api-client'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { computed, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{
  merchantId: string
  venueIds: readonly string[]
  outlets: AdminDealDetail['outlets']
  disabled: boolean
}>()
const emit = defineEmits<{
  'update:merchantId': [string]
  'update:venueIds': [string[]]
  denied: [code: 'UNAUTHORIZED' | 'FORBIDDEN']
}>()
const merchantQuery = ref('')
const outletQuery = ref('')
const merchants = ref<CatalogueMerchant[]>([])
const matchingOutlets = ref<CatalogueVenue[]>([])
const merchantName = ref('')
const rememberedOutlets = ref(new Map<string, string>())
const merchantLoading = ref(false)
const outletLoading = ref(false)
const merchantSearched = ref(false)
const outletSearched = ref(false)
const error = ref('')
let merchantRequest = 0
let outletRequest = 0
let alive = true
const selectedOutlets = computed(() => props.venueIds.map((id) => ({
  id,
  name: props.outlets.find((outlet) => outlet.id === id)?.name ?? rememberedOutlets.value.get(id) ?? 'Selected outlet',
})))
const failed = (failure: unknown) => {
  const code = errorCode(failure)
  if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') emit('denied', code)
  else error.value = 'The directory could not be loaded. Try searching again; your current selection is unchanged.'
}
watch(() => props.merchantId, async (id) => {
  const request = ++merchantRequest
  outletRequest++
  merchantName.value = ''
  merchantLoading.value = false
  merchantSearched.value = false
  outletSearched.value = false
  merchants.value = []
  matchingOutlets.value = []
  outletLoading.value = false
  error.value = ''
  if (!/^[a-f0-9]{24}$/u.test(id)) return
  try {
    const merchant = await api.adminCatalogue.merchant(id)
    if (alive && request === merchantRequest) merchantName.value = merchant.name
  } catch (failure) {
    if (alive && request === merchantRequest) failed(failure)
  }
}, { immediate: true })
const searchMerchants = async () => {
  if (props.disabled || merchantLoading.value) return
  const request = ++merchantRequest
  merchantLoading.value = true
  merchantSearched.value = false
  merchants.value = []
  error.value = ''
  try {
    const page = await api.adminCatalogue.merchants({
      status: 'active', limit: 10, ...(merchantQuery.value.trim() ? { search: merchantQuery.value.trim() } : {}),
    })
    if (alive && request === merchantRequest) {
      merchants.value = page.items
      merchantSearched.value = true
    }
  } catch (failure) {
    if (alive && request === merchantRequest) failed(failure)
  } finally {
    if (alive && request === merchantRequest) merchantLoading.value = false
  }
}
const searchOutlets = async () => {
  if (props.disabled || outletLoading.value || !/^[a-f0-9]{24}$/u.test(props.merchantId)) return
  const request = ++outletRequest
  outletLoading.value = true
  outletSearched.value = false
  matchingOutlets.value = []
  error.value = ''
  try {
    const page = await api.adminCatalogue.venues({
      status: 'active', merchantId: props.merchantId, limit: 10,
      ...(outletQuery.value.trim() ? { search: outletQuery.value.trim() } : {}),
    })
    if (!alive || request !== outletRequest) return
    matchingOutlets.value = page.items
    outletSearched.value = true
    rememberedOutlets.value = new Map([...rememberedOutlets.value, ...page.items.map((outlet) => [outlet.id, outlet.name] as const)])
  } catch (failure) {
    if (alive && request === outletRequest) failed(failure)
  } finally {
    if (alive && request === outletRequest) outletLoading.value = false
  }
}
const chooseMerchant = (merchant: CatalogueMerchant) => {
  if (props.disabled) return
  merchantName.value = merchant.name
  emit('update:merchantId', merchant.id)
}
const toggleOutlet = (id: string) => {
  if (props.disabled) return
  if (props.venueIds.includes(id)) emit('update:venueIds', props.venueIds.filter((value) => value !== id))
  else if (props.venueIds.length < 100) emit('update:venueIds', [...props.venueIds, id])
}
onUnmounted(() => { alive = false; merchantRequest++; outletRequest++ })
</script>

<template>
  <div class="scope-picker">
    <fieldset :disabled="disabled">
      <legend class="h6">Choose a merchant</legend>
      <p v-if="merchantId" class="scope-selection"><strong>{{ merchantName || 'Current merchant' }}</strong><span class="small text-secondary" translate="no">{{ merchantId }}</span></p>
      <div class="scope-search"><label for="deal-merchant-search">Merchant name<input id="deal-merchant-search" v-model="merchantQuery" class="form-control" type="search" maxlength="100" autocomplete="off" @keydown.enter.prevent="searchMerchants" /></label><button class="btn btn-outline-secondary" type="button" data-testid="deal-scope-find-merchants" :disabled="merchantLoading" @click="searchMerchants">{{ merchantLoading ? 'Searching…' : 'Find merchant' }}</button></div>
      <ul v-if="merchants.length" class="scope-options" aria-label="Merchant search results"><li v-for="merchant in merchants" :key="merchant.id"><button type="button" class="btn btn-outline-secondary" :aria-pressed="merchantId === merchant.id" @click="chooseMerchant(merchant)">{{ merchant.name }}<span v-if="merchantId === merchant.id"> · Selected</span></button></li></ul>
      <p v-else-if="merchantSearched" role="status" class="small text-secondary">No active merchants match this search. Try a different name.</p>
      <p class="small text-secondary">Changing the merchant keeps your outlet selection until you explicitly remove outlets. Only the complete set you confirm will be saved.</p>
      <h3 class="h6">Selected outlets ({{ venueIds.length }}/100)</h3>
      <ul v-if="selectedOutlets.length" class="scope-chosen" aria-label="Complete selected outlet set"><li v-for="outlet in selectedOutlets" :key="outlet.id"><span><strong>{{ outlet.name }}</strong><small translate="no">{{ outlet.id }}</small></span><button type="button" class="btn btn-outline-secondary" :aria-label="`Remove ${outlet.name} (${outlet.id})`" @click="toggleOutlet(outlet.id)">Remove</button></li></ul>
      <p v-else class="small text-secondary">No specific outlets selected. Online and all-outlet scopes must keep this set empty.</p>
      <div class="scope-search"><label for="deal-outlet-search">Outlet name or address<input id="deal-outlet-search" v-model="outletQuery" class="form-control" type="search" maxlength="100" autocomplete="off" :disabled="!merchantId" @keydown.enter.prevent="searchOutlets" /></label><button type="button" class="btn btn-outline-secondary" data-testid="deal-scope-find-outlets" :disabled="!merchantId || outletLoading" @click="searchOutlets">{{ outletLoading ? 'Searching…' : 'Find outlets' }}</button></div>
      <ul v-if="matchingOutlets.length" class="scope-options" aria-label="Outlet search results"><li v-for="outlet in matchingOutlets" :key="outlet.id"><label class="scope-option"><input type="checkbox" :data-testid="`deal-scope-outlet-${outlet.id}`" :checked="venueIds.includes(outlet.id)" :disabled="!venueIds.includes(outlet.id) && venueIds.length >= 100" @change="toggleOutlet(outlet.id)" /><span><strong>{{ outlet.name }}</strong><span>{{ outlet.address }}</span><small v-if="!outlet.selectable">Verification incomplete; selecting this outlet does not make the deal publishable.</small></span></label></li></ul>
      <p v-else-if="outletSearched" role="status" class="small text-secondary">No active outlets match this search for the selected merchant. Try another name or address.</p>
      <p class="small text-secondary">Search shows up to 10 matches. Refine the name or address to find another outlet; existing selections are always retained.</p>
    </fieldset>
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.scope-picker { display: grid; gap: 16px; }
fieldset { display: grid; gap: 12px; min-width: 0; }
legend { float: none; width: auto; margin: 0; }
label { display: grid; gap: 6px; min-width: 0; }
.scope-search { display: flex; align-items: end; gap: 10px; }
.scope-search label { flex: 1; }
.scope-search .btn { flex: 0 0 auto; }
.scope-options, .scope-chosen { display: grid; gap: 8px; list-style: none; padding: 0; margin: 0; }
.scope-options .btn { width: 100%; justify-content: flex-start; text-align: left; }
.scope-option { display: flex; align-items: start; gap: 10px; padding: 12px; border: 1px solid var(--admin-border); border-radius: 12px; cursor: pointer; }
.scope-option input { margin-top: 5px; }
.scope-option :where(span > span), .scope-option small, .scope-chosen small, .scope-selection span { display: block; color: var(--admin-muted); font-size: 12px; overflow-wrap: anywhere; }
.scope-chosen li, .scope-selection { display: flex; align-items: center; flex-wrap: wrap; justify-content: space-between; gap: 8px; padding: 12px; margin: 0; border-radius: 12px; background: var(--admin-neutral-bg); }
.scope-chosen li > span { min-width: 0; }
@media (max-width: 575.98px) { .scope-search { flex-direction: column; align-items: stretch; } }
</style>
