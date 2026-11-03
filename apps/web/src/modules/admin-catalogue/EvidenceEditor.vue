<script setup lang="ts">
import type { CatalogueVenueDetail } from '@broke-oclock/contracts/admin-catalogue'
import AppSelect from '@web/components/AppSelect.vue'
import AdminStatusBadge from '@web/components/admin/AdminStatusBadge.vue'
import type { SelectOption } from '@web/components/select-options'
import { formatDateTime } from '@web/lib/format'
import { computed, ref } from 'vue'

defineProps<{ venue: CatalogueVenueDetail; disabled: boolean }>()
const emit = defineEmits<{
  record: [body: Record<string, unknown>]
  withdraw: [body: Record<string, unknown>]
}>()
const kind = ref<'GEOGRAPHY' | 'OCCUPANCY'>('GEOGRAPHY')
const KIND_OPTIONS: readonly SelectOption[] = [
  { value: 'GEOGRAPHY', label: 'Geography' },
  { value: 'OCCUPANCY', label: 'Occupancy' },
]
const sourceOptions = computed<readonly SelectOption[]>(() => [
  { value: 'ADMIN_VERIFIED', label: 'Explicit administrator source verification' },
  { value: 'OFFICIAL_MERCHANT', label: 'Official merchant' },
  { value: 'OFFICIAL_PROPERTY', label: 'Official property' },
  ...(kind.value === 'GEOGRAPHY' ? [{ value: 'ONEMAP', label: 'OneMap — geography only' }] : []),
])
const sourceType = ref('ADMIN_VERIFIED')
const reference = ref('')
const sourceUrl = ref('')
const observedAt = ref('')
const statement = ref('')
const note = ref('')
const reviewedSource = ref(false)
const confirmed = ref(false)
const record = () =>
  emit('record', {
    kind: kind.value,
    sourceType: sourceType.value,
    reference: reference.value,
    ...(sourceUrl.value ? { sourceUrl: sourceUrl.value } : {}),
    ...(observedAt.value ? { observedAt: new Date(observedAt.value).toISOString() } : {}),
    statement: statement.value,
    note: note.value,
    reviewedSource: reviewedSource.value,
    confirmed: confirmed.value,
  })
</script>
<template>
  <section class="catalogue-editor mt-4">
    <h3>Location &amp; occupancy verification</h3>
    <dl class="catalogue-verification"><div><dt>Geography</dt><dd><AdminStatusBadge :status="venue.geographyVerified ? 'VERIFIED' : venue.geographyState" :label="venue.geographyVerified ? 'Verified' : 'Verification needed'" :tone="venue.geographyVerified ? 'success' : 'warning'" /></dd></div><div><dt>Occupancy</dt><dd><AdminStatusBadge :status="venue.occupancyVerified ? 'VERIFIED' : venue.occupancyState" :label="venue.occupancyVerified ? 'Verified' : 'Verification needed'" :tone="venue.occupancyVerified ? 'success' : 'warning'" /></dd></div><div><dt>Selection</dt><dd><AdminStatusBadge :status="venue.selectable ? 'ACTIVE' : 'UNVERIFIED'" :label="venue.selectable ? 'Ready for selection' : 'Maintenance only'" :tone="venue.selectable ? 'success' : 'neutral'" /></dd></div></dl>
    <details class="catalogue-record-details"><summary>What counts as supporting evidence?</summary><p>Manual verification is an administrator attestation of a reviewed real supporting source, not an automated provider lookup. OneMap establishes geography only, never merchant occupancy. Occupancy needs an official merchant/property source or explicit administrator source verification. A picker selection is not proof.</p><p>Stored verification states: geography {{ venue.geographyState }} · occupancy {{ venue.occupancyState }}.</p></details>
    <form @submit.prevent="record">
      <fieldset :disabled="disabled">
        <label for="proof-kind" class="form-label">Evidence kind</label><AppSelect id="proof-kind" v-model="kind" :options="KIND_OPTIONS" class="form-select" />
        <label for="proof-source" class="form-label mt-3">Reviewed source type</label><AppSelect id="proof-source" v-model="sourceType" :options="sourceOptions" class="form-select" />
        <label for="proof-reference" class="form-label mt-3">Supporting-source reference</label><input id="proof-reference" v-model="reference" class="form-control" maxlength="2048" required />
        <label for="proof-url" class="form-label mt-3">Source URL (optional, required for OneMap)</label><input id="proof-url" v-model="sourceUrl" type="url" class="form-control" maxlength="2048" />
        <label for="proof-observed" class="form-label mt-3">Observed at (optional, local time)</label><input id="proof-observed" v-model="observedAt" name="observed-at" type="datetime-local" class="form-control" />
        <label for="proof-statement" class="form-label mt-3">What does this source establish about this exact outlet?</label><textarea id="proof-statement" v-model="statement" class="form-control" maxlength="4000" required />
        <div class="catalogue-decision">
        <h4>Confirm the reviewed source</h4>
        <label for="proof-note" class="form-label">Reason for recording / withdrawing</label><textarea id="proof-note" v-model="note" class="form-control" maxlength="500" required />
        <label class="form-check mt-3"><input v-model="reviewedSource" type="checkbox" class="form-check-input" required /><span class="form-check-label">I personally reviewed a real supporting source for this exact merchant and outlet tuple. This is not inferred from selection.</span></label>
        <label class="form-check mt-3"><input v-model="confirmed" type="checkbox" class="form-check-input" required /><span class="form-check-label">I confirm {{ venue.name }} (version {{ venue.version }}) is the exact target. Authority affects dependent deals and selection.</span></label>
        <div class="d-flex flex-wrap gap-2 mt-3"><button class="btn btn-primary" type="submit">Record manual verification</button><button class="btn btn-outline-danger" type="button" :disabled="!confirmed || !note.trim()" @click="emit('withdraw', { kind, note, confirmed })">Withdraw selected authority</button></div>
        </div>
      </fieldset>
    </form>
    <details class="catalogue-record-details catalogue-receipts"><summary>Retained verification history ({{ venue.evidence.length }})</summary>
    <p v-if="!venue.evidence.length">No administrator receipts recorded. Legacy proof is shown above, never inferred from this empty history.</p>
    <p v-if="venue.evidenceTruncated" class="alert alert-info">Showing the newest 100 receipts. Older evidence remains retained in history.</p>
    <ol class="list-group list-group-numbered">
      <li v-for="receipt in venue.evidence" :key="receipt.id" class="list-group-item">
        <strong>{{ receipt.kind }} · {{ receipt.provider === 'ADMIN' ? 'Manual verification / historical receipt' : receipt.provider }}</strong>
        <p>{{ receipt.reference }}</p><p>{{ receipt.statement }}</p>
        <p class="small">{{ receipt.actorName }} · <time :datetime="receipt.recordedAt">{{ formatDateTime(receipt.recordedAt) }}</time> · tuple version {{ receipt.catalogueVersion ?? 'legacy' }}</p>
        <details><summary>Receipt fingerprint</summary><code class="catalogue-hash">{{ receipt.subjectHash }}</code></details>
        <a v-if="receipt.sourceUrl && /^https?:\/\//.test(receipt.sourceUrl)" :href="receipt.sourceUrl" target="_blank" rel="noopener noreferrer">Open supporting source</a>
      </li>
    </ol>
    </details>
  </section>
</template>
<style scoped src="@web/modules/admin-catalogue/catalogue-editor.css"></style>
