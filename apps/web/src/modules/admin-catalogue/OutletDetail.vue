<script setup lang="ts">
import type { CatalogueVenueDetail } from '@broke-oclock/contracts/admin-catalogue'
import AdminIcon from '@web/components/admin/AdminIcon.vue'
import { formatDateTime } from '@web/lib/format'
import CatalogueConfirm from '@web/modules/admin-catalogue/CatalogueConfirm.vue'
import {
  checkName,
  countLabel,
  type EvidenceKind,
  latestReceipt,
  providerLabel,
  readiness,
} from '@web/modules/admin-catalogue/catalogue-labels'
import EvidenceEditor from '@web/modules/admin-catalogue/EvidenceEditor.vue'
import VenueEditor from '@web/modules/admin-catalogue/VenueEditor.vue'
import { computed, ref } from 'vue'

type Panel = 'none' | 'edit' | 'archive' | `verify-${EvidenceKind}` | `withdraw-${EvidenceKind}`
const props = defineProps<{ venue: CatalogueVenueDetail; disabled: boolean; pending: boolean }>()
const emit = defineEmits<{
  save: [body: Record<string, unknown>]
  archive: [body: Record<string, unknown>]
  record: [body: Record<string, unknown>]
  withdraw: [body: Record<string, unknown>]
  denied: [code: 'UNAUTHORIZED' | 'FORBIDDEN']
}>()
const panel = ref<Panel>('none')
const status = computed(() => readiness(props.venue))
const checks = computed(() =>
  (['OCCUPANCY', 'GEOGRAPHY'] as const).map((kind) => {
    const verified = kind === 'OCCUPANCY' ? props.venue.occupancyVerified : props.venue.geographyVerified
    const state = kind === 'OCCUPANCY' ? props.venue.occupancyState : props.venue.geographyState
    return {
      kind,
      verified,
      title: kind === 'OCCUPANCY' ? 'Occupancy' : 'Location',
      purpose:
        kind === 'OCCUPANCY'
          ? `${props.venue.merchantName} really trades here. Needed before deals can pick this outlet.`
          : 'The address and pin are right. Needed for deals to show on the map.',
      state: verified ? 'Verified' : state === 'LEGACY_RETAINED' ? 'Imported, not checked' : 'Not verified',
      receipt: latestReceipt(props.venue, kind),
      // A retained imported proof can be withdrawn too, so it stops counting for old deals.
      withdrawable: verified || state === 'LEGACY_RETAINED',
    }
  }),
)
// The first missing check gets the one primary button, so the next step is obvious.
const nextCheck = computed(() => checks.value.find((check) => !check.verified)?.kind)
const mapUrl = computed(
  () => `https://www.google.com/maps/search/?api=1&query=${props.venue.latitude},${props.venue.longitude}`,
)
const precision = computed(() =>
  props.venue.geographyPrecision === 'OUTLET'
    ? 'the outlet itself'
    : props.venue.geographyPrecision === 'PROPERTY'
      ? 'the building'
      : 'not set',
)
const open = (next: Panel) => {
  panel.value = panel.value === next ? 'none' : next
}
</script>

<template>
  <div class="catalogue-detail-body">
    <div class="catalogue-readiness" :data-tone="status.tone" role="status">
      <AdminIcon :name="status.tone === 'ready' ? 'check' : 'open'" />
      <p><strong>{{ status.title }}</strong> <span>{{ status.detail }}</span></p>
    </div>

    <section class="catalogue-section" aria-labelledby="outlet-checks-title">
      <h3 id="outlet-checks-title">Verification</h3>
      <ul class="catalogue-checks">
        <li v-for="check in checks" :key="check.kind" :data-done="check.verified">
          <div class="catalogue-check">
            <AdminIcon :name="check.verified ? 'check' : 'open'" />
            <div class="catalogue-check-text">
              <p><strong>{{ check.title }}</strong> <span class="catalogue-check-state">{{ check.state }}</span></p>
              <p class="catalogue-muted">{{ check.receipt || check.purpose }}</p>
            </div>
            <button v-if="!check.verified" type="button" class="btn btn-sm" :class="check.kind === nextCheck ? 'btn-primary' : 'btn-outline-primary'" :disabled="disabled || venue.archived" :aria-expanded="panel === `verify-${check.kind}`" @click="open(`verify-${check.kind}`)">Verify {{ checkName[check.kind] }}</button>
            <button v-if="check.withdrawable" type="button" class="btn btn-link btn-sm catalogue-quiet-link" :disabled="disabled" :aria-expanded="panel === `withdraw-${check.kind}`" @click="open(`withdraw-${check.kind}`)">Withdraw</button>
          </div>
          <EvidenceEditor v-if="panel === `verify-${check.kind}`" :venue="venue" :kind="check.kind" :disabled="disabled" @record="emit('record', $event)" @cancel="panel = 'none'" />
          <CatalogueConfirm
            v-if="panel === `withdraw-${check.kind}`"
            :id="`withdraw-${check.kind}`"
            :title="`Withdraw the ${checkName[check.kind]} check`"
            :consequence="check.kind === 'OCCUPANCY' ? 'This outlet can’t be picked for new deals until occupancy is verified again. History is kept.' : 'Deals at this outlet stop showing on the map until the location is verified again. History is kept.'"
            :confirmation="`I want to withdraw the ${checkName[check.kind]} check for ${venue.name}`"
            action="Withdraw check"
            :disabled="disabled"
            @submit="emit('withdraw', { kind: check.kind, ...$event })"
            @cancel="panel = 'none'"
          />
        </li>
      </ul>
    </section>

    <section class="catalogue-section" aria-labelledby="outlet-details-title">
      <header class="catalogue-section-heading">
        <h3 id="outlet-details-title">Details</h3>
        <button v-if="panel !== 'edit'" type="button" class="btn btn-outline-primary btn-sm" :disabled="disabled" @click="panel = 'edit'">Edit details</button>
      </header>
      <VenueEditor v-if="panel === 'edit'" :venue="venue" :disabled="disabled" :pending="pending" @save="emit('save', $event)" @cancel="panel = 'none'" @denied="emit('denied', $event)" />
      <dl v-else class="catalogue-facts">
        <div><dt>Street and unit</dt><dd>{{ venue.address }}</dd></div>
        <div><dt>Postal code</dt><dd class="catalogue-figures">{{ venue.postalCode ?? '—' }}</dd></div>
        <div><dt>Area</dt><dd>{{ venue.area ?? '—' }}</dd></div>
        <div><dt>Point</dt><dd><span class="catalogue-figures">{{ venue.latitude }}, {{ venue.longitude }}</span> · marks {{ precision }} · <a :href="mapUrl" target="_blank" rel="noopener noreferrer">Open map<span class="visually-hidden"> in a new tab</span></a></dd></div>
        <div v-if="venue.imageUrl"><dt>Image</dt><dd><a :href="venue.imageUrl" target="_blank" rel="noopener noreferrer">Open image<span class="visually-hidden"> in a new tab</span></a></dd></div>
      </dl>
      <p class="catalogue-muted catalogue-usage">Used by {{ countLabel(venue.dealCount, 'deal') }}, {{ countLabel(venue.grantCount, 'merchant access grant') }} and {{ countLabel(venue.requestCount, 'access request') }}.</p>
    </section>

    <details class="catalogue-section catalogue-history">
      <summary>History <span class="catalogue-muted catalogue-figures">({{ venue.evidence.length }}{{ venue.evidenceTruncated ? '+' : '' }})</span></summary>
      <p v-if="!venue.evidence.length" class="catalogue-muted">No checks recorded by an admin yet.</p>
      <p v-if="venue.evidenceTruncated" class="catalogue-muted">Showing the newest 100. Older checks are kept.</p>
      <ol class="catalogue-receipts">
        <li v-for="receipt in venue.evidence" :key="receipt.id">
          <p><strong>{{ checkName[receipt.kind as 'GEOGRAPHY' | 'OCCUPANCY'] ?? receipt.kind }} · {{ providerLabel(receipt.provider) }}</strong> <span class="catalogue-muted">{{ receipt.actorName }} · <time :datetime="receipt.recordedAt">{{ formatDateTime(receipt.recordedAt) }}</time> · version {{ receipt.catalogueVersion ?? 'legacy' }}</span></p>
          <p>{{ receipt.reference }}</p>
          <p class="catalogue-muted">{{ receipt.statement }}</p>
          <a v-if="receipt.sourceUrl && /^https?:\/\//.test(receipt.sourceUrl)" :href="receipt.sourceUrl" target="_blank" rel="noopener noreferrer">Open source<span class="visually-hidden"> in a new tab</span></a>
          <details><summary>Fingerprint</summary><code class="catalogue-hash">{{ receipt.subjectHash }}</code></details>
        </li>
      </ol>
    </details>

    <section class="catalogue-section catalogue-danger-zone" aria-label="Archive outlet">
      <CatalogueConfirm
        v-if="panel === 'archive'"
        id="outlet-archive"
        title="Archive this outlet"
        :consequence="`It can no longer be picked for new deals. ${countLabel(venue.dealCount, 'deal')}, ${countLabel(venue.grantCount, 'grant')} and ${countLabel(venue.requestCount, 'request')} keep their history. Grants are not revoked. There is no restore.`"
        :confirmation="`I want to archive ${venue.name}`"
        action="Archive outlet"
        :disabled="disabled"
        @submit="emit('archive', $event)"
        @cancel="panel = 'none'"
      />
      <button v-else type="button" class="btn btn-outline-danger btn-sm" :disabled="disabled" @click="panel = 'archive'">Archive outlet</button>
    </section>
    <p class="catalogue-record-meta"><span translate="no">{{ venue.id }}</span> · version {{ venue.version }} · key <span translate="no">{{ venue.catalogueKey ?? '—' }}</span></p>
  </div>
</template>

<style scoped src="@web/modules/admin-catalogue/catalogue-editor.css"></style>
