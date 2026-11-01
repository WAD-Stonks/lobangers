<script setup lang="ts">
import type {
  CatalogueMerchant,
  CatalogueVenueDetail,
} from '@broke-oclock/contracts/admin-catalogue'
import { reactive, ref } from 'vue'

const props = defineProps<{
  venue?: CatalogueVenueDetail
  parent?: CatalogueMerchant
  disabled: boolean
}>()
const emit = defineEmits<{
  save: [body: Record<string, unknown>]
  archive: [body: Record<string, unknown>]
}>()
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
const save = () => {
  const all = {
    ...fields,
    latitude: fields.latitude.trim() === '' ? undefined : Number(fields.latitude),
    longitude: fields.longitude.trim() === '' ? undefined : Number(fields.longitude),
    imageUrl: fields.imageUrl || null,
  }
  const corrections = props.venue
    ? Object.fromEntries(
        Object.entries(all).filter(
          ([key, value]) => value !== props.venue?.[key as keyof CatalogueVenueDetail],
        ),
      )
    : all
  emit('save', { ...corrections, note: note.value, confirmed: confirmed.value })
}
</script>
<template>
  <section class="catalogue-editor">
    <h2>{{ venue?.name ?? 'Create outlet' }}</h2>
    <p>Merchant: {{ venue?.merchantName ?? parent?.name }} · immutable association</p>
    <p v-if="venue" class="text-secondary">{{ venue.id }} · version {{ venue.version }} · {{ venue.archived ? 'Archived' : 'Active' }}</p>
    <p class="alert alert-warning">Tuple corrections withdraw both geography and occupancy authority. Old receipts remain historical, never recertified. Archiving preserves all relationships and history; it does not revoke or reactivate grants.</p>
    <p v-if="venue">Dependencies: {{ venue.dealCount }} deal links · {{ venue.grantCount }} retained grants · {{ venue.requestCount }} retained requests.</p>
    <form @submit.prevent="save">
      <fieldset :disabled="disabled">
        <div class="row g-3">
          <div v-for="field in ([['name','Outlet name'],['address','Resolved street / unit address'],['postalCode','Postal code (6 digits)'],['area','Area'],['latitude','Resolved latitude'],['longitude','Resolved longitude'],['catalogueKey','Canonical catalogue key'],['imageUrl','Optional image URL (HTTP/S, no credentials)']] as const)" :key="field[0]" class="col-12 col-md-6">
            <label :for="`venue-${field[0]}`" class="form-label">{{ field[1] }}</label>
            <input :id="`venue-${field[0]}`" v-model="fields[field[0]]" :name="field[0]" class="form-control" :required="field[0] !== 'imageUrl'" :maxlength="field[0] === 'imageUrl' ? 2048 : 500" />
          </div>
          <div class="col-12"><label for="venue-precision" class="form-label">Resolved point precision</label><select id="venue-precision" v-model="fields.geographyPrecision" class="form-select"><option value="PROPERTY">Property</option><option value="OUTLET">Outlet</option></select></div>
        </div>
        <p class="form-text">No coordinate lookup, image fetching or upload is performed. Supply a genuinely resolved point, not 0,0.</p>
        <label for="venue-note" class="form-label">Reason for this operation</label><textarea id="venue-note" v-model="note" name="note" class="form-control" maxlength="500" required />
        <label class="form-check mt-3"><input v-model="confirmed" type="checkbox" name="confirmed" class="form-check-input" required /><span class="form-check-label">I confirm the exact target {{ venue?.name ?? fields.name }} and its dependency / proof consequences.</span></label>
        <div class="d-flex flex-wrap gap-2 mt-3"><button class="btn btn-primary" type="submit">{{ venue ? 'Save outlet correction' : 'Create unverified outlet' }}</button><button v-if="venue" class="btn btn-outline-danger" type="button" :disabled="!confirmed || !note.trim()" @click="emit('archive', { note, confirmed })">Archive outlet</button></div>
      </fieldset>
    </form>
  </section>
</template>
