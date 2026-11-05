<script setup lang="ts">
import type {
  CatalogueMerchant,
  CatalogueVenueDetail,
} from '@broke-oclock/contracts/admin-catalogue'
import AppSelect from '@web/components/AppSelect.vue'
import type { SelectOption } from '@web/components/select-options'
import AddressLookup, { type AddressCandidate } from '@web/modules/admin-catalogue/AddressLookup.vue'
import { computed, reactive, ref } from 'vue'

const PRECISION_OPTIONS: readonly SelectOption[] = [
  { value: 'PROPERTY', label: 'Building' },
  { value: 'OUTLET', label: 'The outlet itself' },
]
const LABELS: Record<string, string> = {
  name: 'Outlet name',
  address: 'Street and unit',
  postalCode: 'Postal code',
  area: 'Area',
  latitude: 'Latitude',
  longitude: 'Longitude',
  geographyPrecision: 'Point precision',
  catalogueKey: 'Catalogue key',
  imageUrl: 'Image URL',
}
const PROOF_FIELDS = new Set([
  'name',
  'address',
  'postalCode',
  'latitude',
  'longitude',
  'catalogueKey',
  'geographyPrecision',
])

const props = defineProps<{
  venue?: CatalogueVenueDetail
  parent?: CatalogueMerchant
  disabled: boolean
  pending?: boolean
}>()
const emit = defineEmits<{
  save: [body: Record<string, unknown>]
  cancel: []
  denied: [code: 'UNAUTHORIZED' | 'FORBIDDEN']
}>()
const merchantName = props.venue?.merchantName ?? props.parent?.name ?? ''
const fields = reactive({
  name: props.venue?.name ?? '',
  address: props.venue?.address ?? '',
  postalCode: props.venue?.postalCode ?? '',
  area: props.venue?.area ?? '',
  latitude: props.venue?.latitude?.toString() ?? '',
  longitude: props.venue?.longitude?.toString() ?? '',
  geographyPrecision: props.venue?.geographyPrecision === 'OUTLET' ? 'OUTLET' : 'PROPERTY',
  catalogueKey: props.venue?.catalogueKey ?? '',
  imageUrl: props.venue?.imageUrl ?? '',
})
const note = ref('')
const confirmed = ref(false)
const lookupOpen = ref(!props.venue)

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
const titleCase = (value: string) =>
  value.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_, gap: string, letter: string) => gap + letter.toUpperCase())
const tidyAddress = (address: string) =>
  titleCase(address.replace(/\s+SINGAPORE\s+\d{6}\s*$/i, '').trim())
const pick = (candidate: AddressCandidate) => {
  fields.address = tidyAddress(candidate.address)
  if (candidate.postalCode) fields.postalCode = candidate.postalCode
  fields.latitude = candidate.latitude.toString()
  fields.longitude = candidate.longitude.toString()
  fields.geographyPrecision = 'PROPERTY'
  if (!props.venue && !fields.name.trim())
    fields.name = `${merchantName}, ${titleCase(candidate.searchValue)}`
}
const values = () => ({
  ...fields,
  latitude: fields.latitude.trim() === '' ? undefined : Number(fields.latitude),
  longitude: fields.longitude.trim() === '' ? undefined : Number(fields.longitude),
  imageUrl: fields.imageUrl || null,
  catalogueKey:
    fields.catalogueKey.trim() ||
    (props.venue ? '' : `admin:${slug(merchantName)}-${fields.postalCode.trim() || slug(fields.name)}`),
})
const same = (before: unknown, after: unknown) =>
  before === after || ((before === null || before === undefined) && after === '')
const corrections = computed(() => {
  const all = values()
  if (!props.venue) return all
  const venue = props.venue
  return Object.fromEntries(
    Object.entries(all).filter(
      ([key, value]) => !same(venue[key as keyof CatalogueVenueDetail], value),
    ),
  )
})
const changes = computed(() =>
  props.venue
    ? Object.entries(corrections.value).map(([key, value]) => ({
        key,
        label: LABELS[key] ?? key,
        before: String(props.venue?.[key as keyof CatalogueVenueDetail] ?? '—'),
        after: value === null || value === undefined || value === '' ? '—' : String(value),
      }))
    : [],
)
const resetsProof = computed(
  () =>
    !!props.venue &&
    (props.venue.geographyVerified || props.venue.occupancyVerified) &&
    Object.keys(corrections.value).some((key) => PROOF_FIELDS.has(key)),
)
const reviewing = computed(() => !props.venue || changes.value.length > 0)
const save = () => emit('save', { ...corrections.value, note: note.value, confirmed: confirmed.value })
</script>

<template>
  <section class="catalogue-editor">
    <p v-if="!venue" class="catalogue-editor-intro">Adding an outlet to {{ merchantName }}. Search OneMap to fill in the address, or type it.</p>
    <AddressLookup v-if="lookupOpen" :disabled="disabled" @pick="pick" @denied="emit('denied', $event)" />
    <button v-else type="button" class="btn btn-link btn-sm catalogue-inline-link" :disabled="disabled" @click="lookupOpen = true">Look up the address on OneMap</button>
    <form @submit.prevent="save">
      <fieldset :disabled="disabled">
        <div class="row g-3">
          <div class="col-12"><label for="venue-name" class="form-label">Outlet name</label><input id="venue-name" v-model="fields.name" name="name" class="form-control" maxlength="160" autocomplete="off" :placeholder="`${merchantName}, Tampines Mall`" required /></div>
          <div class="col-12 col-md-8"><label for="venue-address" class="form-label">Street and unit</label><input id="venue-address" v-model="fields.address" name="address" class="form-control" maxlength="500" autocomplete="off" required /></div>
          <div class="col-12 col-md-4"><label for="venue-postalCode" class="form-label">Postal code</label><input id="venue-postalCode" v-model="fields.postalCode" name="postalCode" class="form-control" inputmode="numeric" pattern="\d{6}" maxlength="6" autocomplete="off" :required="!venue" /></div>
          <div class="col-12 col-md-4"><label for="venue-area" class="form-label">Area</label><input id="venue-area" v-model="fields.area" name="area" class="form-control" maxlength="100" :required="!venue" /></div>
          <div class="col-6 col-md-4"><label for="venue-latitude" class="form-label">Latitude</label><input id="venue-latitude" v-model="fields.latitude" name="latitude" class="form-control" inputmode="decimal" maxlength="32" autocomplete="off" required /></div>
          <div class="col-6 col-md-4"><label for="venue-longitude" class="form-label">Longitude</label><input id="venue-longitude" v-model="fields.longitude" name="longitude" class="form-control" inputmode="decimal" maxlength="32" autocomplete="off" required /></div>
          <div class="col-12 col-md-6"><label for="venue-precision" class="form-label">The point marks</label><AppSelect id="venue-precision" v-model="fields.geographyPrecision" name="geographyPrecision" :options="PRECISION_OPTIONS" class="form-select" /></div>
          <div class="col-12 col-md-6"><label for="venue-imageUrl" class="form-label">Image URL <span class="catalogue-muted">(optional)</span></label><input id="venue-imageUrl" v-model="fields.imageUrl" name="imageUrl" type="url" class="form-control" maxlength="2048" placeholder="https://" /></div>
        </div>
        <details class="catalogue-more">
          <summary>Catalogue key</summary>
          <p class="catalogue-muted mt-2 mb-2">A stable ID for this outlet across imports.<template v-if="!venue"> Leave it blank to use one made from the merchant and postal code.</template></p>
          <label for="venue-catalogueKey" class="visually-hidden">Catalogue key</label>
          <input id="venue-catalogueKey" v-model="fields.catalogueKey" name="catalogueKey" class="form-control" maxlength="250" autocomplete="off" spellcheck="false" />
        </details>
        <div v-if="reviewing" class="catalogue-decision">
          <h4>Review</h4>
          <ul v-if="changes.length" class="catalogue-changes">
            <li v-for="change in changes" :key="change.key"><span class="catalogue-muted">{{ change.label }}</span> <s>{{ change.before }}</s> → {{ change.after }}</li>
          </ul>
          <p v-if="resetsProof" class="catalogue-warning">Saving resets this outlet’s verification. Verify it again before deals can use it.</p>
          <p v-if="!venue" class="catalogue-consequence">The new outlet starts unverified. You can verify it right after.</p>
          <label for="venue-note" class="form-label">Reason</label>
          <textarea id="venue-note" v-model="note" name="note" class="form-control" maxlength="500" rows="2" required />
          <label class="form-check mt-3"><input v-model="confirmed" type="checkbox" name="confirmed" class="form-check-input" required /><span class="form-check-label">{{ venue ? 'I checked these corrections against a reliable source' : `I checked ${merchantName} has an outlet at this address` }}</span></label>
        </div>
      </fieldset>
      <div class="catalogue-form-actions">
        <button v-if="reviewing" class="btn btn-primary" type="submit" :disabled="disabled">{{ pending ? 'Saving…' : venue ? 'Save changes' : 'Create outlet' }}</button>
        <button class="btn btn-outline-secondary" type="button" @click="emit('cancel')">Cancel</button>
      </div>
    </form>
  </section>
</template>

<style scoped src="@web/modules/admin-catalogue/catalogue-editor.css"></style>
