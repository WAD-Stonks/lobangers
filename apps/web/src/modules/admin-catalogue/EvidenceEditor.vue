<script setup lang="ts">
import type { CatalogueVenueDetail } from '@broke-oclock/contracts/admin-catalogue'
import { ref } from 'vue'

defineProps<{ venue: CatalogueVenueDetail; disabled: boolean }>()
const emit = defineEmits<{
  record: [body: Record<string, unknown>]
  withdraw: [body: Record<string, unknown>]
}>()
const kind = ref<'GEOGRAPHY' | 'OCCUPANCY'>('GEOGRAPHY')
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
    <h2>Outlet proof &amp; manual sources</h2>
    <dl class="row"><dt class="col-sm-4">Geography</dt><dd class="col-sm-8">{{ venue.geographyVerified ? 'Verified — current tuple' : `Not verified (${venue.geographyState})` }}</dd><dt class="col-sm-4">Occupancy</dt><dd class="col-sm-8">{{ venue.occupancyVerified ? 'Verified — current tuple' : `Not verified (${venue.occupancyState})` }}</dd><dt class="col-sm-4">Selection</dt><dd class="col-sm-8">{{ venue.selectable ? 'Selectable under existing outlet policy' : 'Unselectable — maintenance only' }}</dd></dl>
    <p>Manual verification is an administrator attestation of a reviewed real supporting source, not an automated provider lookup. OneMap establishes geography only, never merchant occupancy. Occupancy needs an official merchant/property source or explicit administrator source verification. A picker selection is not proof.</p>
    <form @submit.prevent="record">
      <fieldset :disabled="disabled">
        <label for="proof-kind" class="form-label">Evidence kind</label><select id="proof-kind" v-model="kind" class="form-select"><option value="GEOGRAPHY">Geography</option><option value="OCCUPANCY">Occupancy</option></select>
        <label for="proof-source" class="form-label mt-3">Reviewed source type</label><select id="proof-source" v-model="sourceType" class="form-select"><option value="ADMIN_VERIFIED">Explicit administrator source verification</option><option value="OFFICIAL_MERCHANT">Official merchant</option><option value="OFFICIAL_PROPERTY">Official property</option><option v-if="kind === 'GEOGRAPHY'" value="ONEMAP">OneMap — geography only</option></select>
        <label for="proof-reference" class="form-label mt-3">Supporting-source reference</label><input id="proof-reference" v-model="reference" class="form-control" maxlength="2048" required />
        <label for="proof-url" class="form-label mt-3">Source URL (optional, required for OneMap)</label><input id="proof-url" v-model="sourceUrl" type="url" class="form-control" maxlength="2048" />
        <label for="proof-observed" class="form-label mt-3">Observed at (optional, local time)</label><input id="proof-observed" v-model="observedAt" type="datetime-local" class="form-control" />
        <label for="proof-statement" class="form-label mt-3">What does this source establish about this exact outlet?</label><textarea id="proof-statement" v-model="statement" class="form-control" maxlength="4000" required />
        <label for="proof-note" class="form-label mt-3">Reason for recording / withdrawing</label><textarea id="proof-note" v-model="note" class="form-control" maxlength="500" required />
        <label class="form-check mt-3"><input v-model="reviewedSource" type="checkbox" class="form-check-input" required /><span class="form-check-label">I personally reviewed a real supporting source for this exact merchant and outlet tuple. This is not inferred from selection.</span></label>
        <label class="form-check mt-3"><input v-model="confirmed" type="checkbox" class="form-check-input" required /><span class="form-check-label">I confirm {{ venue.name }} (version {{ venue.version }}) is the exact target. Authority affects dependent deals and selection.</span></label>
        <div class="d-flex flex-wrap gap-2 mt-3"><button class="btn btn-primary" type="submit">Record manual verification</button><button class="btn btn-outline-danger" type="button" :disabled="!confirmed || !note.trim()" @click="emit('withdraw', { kind, note, confirmed })">Withdraw selected authority</button></div>
      </fieldset>
    </form>
    <h3 class="mt-4">Retained attestation receipts</h3>
    <p v-if="!venue.evidence.length">No administrator receipts recorded. Legacy proof is shown above, never inferred from this empty history.</p>
    <p v-if="venue.evidenceTruncated" class="alert alert-info">Showing the newest 100 receipts. Older evidence remains retained in history.</p>
    <ol class="list-group list-group-numbered">
      <li v-for="receipt in venue.evidence" :key="receipt.id" class="list-group-item">
        <strong>{{ receipt.kind }} · {{ receipt.provider === 'ADMIN' ? 'Manual verification / historical receipt' : receipt.provider }}</strong>
        <p>{{ receipt.reference }}</p><p>{{ receipt.statement }}</p>
        <p class="small">{{ receipt.actorName }} · {{ receipt.recordedAt }} · tuple version {{ receipt.catalogueVersion ?? 'legacy' }}</p>
        <code class="catalogue-hash">{{ receipt.subjectHash }}</code>
        <a v-if="receipt.sourceUrl && /^https?:\/\//.test(receipt.sourceUrl)" :href="receipt.sourceUrl" target="_blank" rel="noopener noreferrer">Open supporting source</a>
      </li>
    </ol>
  </section>
</template>
