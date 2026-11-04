<script setup lang="ts">
import type { CatalogueVenueDetail } from '@broke-oclock/contracts/admin-catalogue'
import { checkName, type EvidenceKind } from '@web/modules/admin-catalogue/catalogue-labels'
import { computed, ref } from 'vue'

type Source = 'ONEMAP' | 'OFFICIAL_MERCHANT' | 'OFFICIAL_PROPERTY' | 'ADMIN_VERIFIED'
const props = defineProps<{ venue: CatalogueVenueDetail; kind: EvidenceKind; disabled: boolean }>()
const emit = defineEmits<{ record: [body: Record<string, unknown>]; cancel: [] }>()

// OneMap proves where a building is, never who trades in it, so it is offered for location only.
const SOURCES: Record<EvidenceKind, { value: Source; label: string; hint: string }[]> = {
  GEOGRAPHY: [
    { value: 'ONEMAP', label: 'OneMap', hint: 'A OneMap search for the postal code or address lands on this pin.' },
    { value: 'OFFICIAL_PROPERTY', label: 'Mall or property website', hint: 'The property’s own site gives this address.' },
    { value: 'OFFICIAL_MERCHANT', label: 'Merchant website or app', hint: 'The merchant’s store locator gives this address.' },
    { value: 'ADMIN_VERIFIED', label: 'Another source I checked', hint: 'Describe it below, for example a visit or a call.' },
  ],
  OCCUPANCY: [
    { value: 'OFFICIAL_MERCHANT', label: 'Merchant website or app', hint: 'The merchant lists this outlet as one of theirs.' },
    { value: 'OFFICIAL_PROPERTY', label: 'Mall or property directory', hint: 'The property lists this merchant at this unit.' },
    { value: 'ADMIN_VERIFIED', label: 'Another source I checked', hint: 'Describe it below, for example a visit or a call.' },
  ],
}
const sources = computed(() => SOURCES[props.kind])
const sourceType = ref<Source>(SOURCES[props.kind][0]?.value ?? 'ADMIN_VERIFIED')
const reference = ref('')
const sourceUrl = ref('')
const observedAt = ref('')
const statement = ref('')
const note = ref('')
const confirmed = ref(false)
const name = computed(() => checkName[props.kind])
const referenceHint = computed(() =>
  sourceType.value === 'ONEMAP'
    ? `OneMap search for ${props.venue.postalCode ?? 'the postal code'}`
    : sourceType.value === 'ADMIN_VERIFIED'
      ? 'Phone call to the outlet, 3 Nov'
      : 'Store locator page',
)
const statementHint = computed(() =>
  props.kind === 'GEOGRAPHY'
    ? `${props.venue.address} matches the pin`
    : `Lists ${props.venue.name} as an outlet of ${props.venue.merchantName}`,
)
const record = () =>
  // One checkbox covers both attestations the API asks for: the source was reviewed by this
  // admin, and this exact outlet is the target.
  emit('record', {
    kind: props.kind,
    sourceType: sourceType.value,
    reference: reference.value,
    ...(sourceUrl.value ? { sourceUrl: sourceUrl.value } : {}),
    ...(observedAt.value ? { observedAt: new Date(observedAt.value).toISOString() } : {}),
    statement: statement.value,
    note: note.value,
    reviewedSource: confirmed.value,
    confirmed: confirmed.value,
  })
</script>

<template>
  <section class="catalogue-editor catalogue-decision" :aria-labelledby="`verify-${kind}-title`">
    <h4 :id="`verify-${kind}-title`">Verify {{ name }}</h4>
    <form @submit.prevent="record">
      <fieldset :disabled="disabled">
        <legend class="form-label">Where did you check?</legend>
        <div class="catalogue-sources">
          <label v-for="source in sources" :key="source.value" class="catalogue-source">
            <input v-model="sourceType" type="radio" :name="`proof-source-${kind}`" :value="source.value" class="form-check-input" />
            <span><strong>{{ source.label }}</strong><span class="catalogue-muted">{{ source.hint }}</span></span>
          </label>
        </div>
        <label :for="`proof-reference-${kind}`" class="form-label mt-3">Source</label>
        <input :id="`proof-reference-${kind}`" v-model="reference" name="reference" class="form-control" maxlength="2048" :placeholder="referenceHint" required />
        <label :for="`proof-url-${kind}`" class="form-label mt-3">Link<span v-if="sourceType !== 'ONEMAP'" class="catalogue-muted"> (optional)</span></label>
        <input :id="`proof-url-${kind}`" v-model="sourceUrl" name="sourceUrl" type="url" class="form-control" maxlength="2048" :placeholder="sourceType === 'ONEMAP' ? 'https://www.onemap.gov.sg/…' : 'https://'" :required="sourceType === 'ONEMAP'" />
        <label :for="`proof-statement-${kind}`" class="form-label mt-3">What it shows</label>
        <textarea :id="`proof-statement-${kind}`" v-model="statement" name="statement" class="form-control" maxlength="4000" rows="2" :placeholder="statementHint" required />
        <details class="catalogue-more">
          <summary>When you checked (optional)</summary>
          <label :for="`proof-observed-${kind}`" class="form-label mt-2">Date and time</label>
          <input :id="`proof-observed-${kind}`" v-model="observedAt" name="observed-at" type="datetime-local" class="form-control" />
        </details>
        <label :for="`proof-note-${kind}`" class="form-label mt-3">Reason</label>
        <input :id="`proof-note-${kind}`" v-model="note" name="note" class="form-control" maxlength="500" placeholder="New outlet, first check" required />
        <label class="form-check mt-3"><input v-model="confirmed" name="confirmed" type="checkbox" class="form-check-input" required /><span class="form-check-label">I checked this source myself and it is about {{ venue.name }}</span></label>
      </fieldset>
      <div class="catalogue-form-actions">
        <button class="btn btn-primary" type="submit" :disabled="disabled">Record {{ name }} check</button>
        <button class="btn btn-outline-secondary" type="button" @click="emit('cancel')">Cancel</button>
      </div>
    </form>
  </section>
</template>

<style scoped src="@web/modules/admin-catalogue/catalogue-editor.css"></style>
