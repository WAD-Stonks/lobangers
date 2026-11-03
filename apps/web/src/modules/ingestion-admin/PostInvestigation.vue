<script setup lang="ts">
import { BButton } from '@broke-oclock/ui'
import AppSelect from '@web/components/AppSelect.vue'
import type { SelectOption } from '@web/components/select-options'
import TicketLoading from '@web/components/TicketLoading.vue'
import { formatDateTime } from '@web/lib/format'
import { usePostInvestigation } from '@web/modules/ingestion-admin/use-post-investigation'
import { toRef } from 'vue'

const props = defineProps<{ postId: string }>()
const emit = defineEmits<{ denied: [code: string] }>()
const { detail, pending, busy, error, note, confirmed, mode, result, unknown, canRecover, load, recover, recoveryId, reconcile } = usePostInvestigation(toRef(props, 'postId'), code => emit('denied', code))
const MODE_OPTIONS: readonly SelectOption[] = [
  { value: 'REPROCESS_STORED', label: 'Reprocess exact stored envelope (one target)' },
  { value: 'REFRESH_SOURCE_WINDOW', label: 'Refresh this source window (at most 2 pages × 20; target may not appear)' },
]
</script>

<template>
 <section aria-label="Post investigation" class="card p-3 my-3 text-break" :aria-busy="pending || busy">
  <h3 class="h5">Post investigation</h3>
  <TicketLoading v-if="pending" label="Loading current post evidence…" /><p v-if="error" role="alert">{{ error }}</p>
  <BButton :disabled="pending || busy" @click="load()">Reload captured post evidence</BButton>
  <template v-if="detail">
   <h4 class="h6">{{ detail.post.source.name }} / <span translate="no">{{ detail.post.externalId }}</span></h4>
   <p>Post <span translate="no">{{ detail.post.id }}</span> · {{ detail.post.status }} · {{ detail.post.errorCode ?? 'No error' }} · Stage {{ detail.post.failureStage ?? 'Not recorded' }}</p>
   <p>Source <span translate="no">{{ detail.post.source.id }}</span> · {{ detail.post.source.enabled ? 'Enabled' : 'Disabled' }} · {{ detail.post.source.provider }} / <span translate="no">{{ detail.post.source.externalId }}</span></p>
   <p>Captured target time <time :datetime="detail.post.updatedAt">{{ formatDateTime(detail.post.updatedAt) }}</time><br>Captured target hash <span translate="no">{{ detail.post.contentHash }}</span><br>Latest envelope <span translate="no">{{ detail.post.latestSnapshotHash ?? 'Missing' }}</span> · {{ detail.post.snapshotFormat ?? 'Legacy missing' }}<br>{{ detail.post.snapshotAvailable ? 'Validated exact envelope available' : 'No validated exact envelope. rawContent will not be reconstructed.' }}</p>
   <ul><li v-for="citation in detail.citations" :key="citation.id">Citation <span translate="no">{{ citation.id }}</span> · Draft <span translate="no">{{ citation.dealId }}</span> · {{ citation.reviewStatus }} v{{ citation.contentVersion }} · Pinned <span translate="no">{{ citation.pinnedHash }}</span></li></ul>
   <BButton v-if="detail.nextCitationCursor" :disabled="pending || busy" @click="load(detail.nextCitationCursor)">More linked citations</BButton>
   <form @submit.prevent="recover">
    <label :for="`recovery-mode-${postId}`">Bounded recovery mode</label>
    <AppSelect :id="`recovery-mode-${postId}`" v-model="mode" class="form-select" :options="MODE_OPTIONS" :disabled="busy || pending || unknown" />
    <p>No source enabling, reset, purge, cursor rewind or global run. Protected canonical content and immutable citations remain protected.</p>
    <ul><li v-for="cap in detail.capabilities" :key="cap.mode">{{ cap.mode }}: {{ cap.allowed ? 'Available at read time; rechecked on submit' : 'Blocked' }}<ul><li v-for="blocker in cap.blockers" :key="blocker">{{ blocker }}</li></ul></li></ul>
    <label :for="`recovery-note-${postId}`">Reason (required)</label><textarea :id="`recovery-note-${postId}`" v-model="note" name="recovery-note" maxlength="500" :disabled="pending || busy || unknown" />
    <label><input v-model="confirmed" type="checkbox" :disabled="pending || busy || unknown">I reviewed this exact post hash/time and the bounded recovery mode.</label>
    <p v-if="unknown" role="status">Recovery result must be reconciled. Read the exact recovery ID and reload current post evidence. REQUESTED, RUNNING or UNKNOWN remain locked. An interrupted UNKNOWN does not prove that nothing committed; no automatic retry is allowed.</p>
    <BButton type="submit" data-testid="recover-post" :disabled="!canRecover">{{ busy ? 'Recovery pending…' : 'Confirm bounded recovery' }}</BButton>
   </form>
  </template>
  <p v-if="result" role="status">Recovery {{ result.id }}: operation {{ result.status }}; target outcome {{ result.targetOutcome }}. {{ result.errorCode ?? '' }}</p>
  <form @submit.prevent="reconcile"><label :for="`recovery-id-${postId}`">Reconcile by recovery ID (read only)</label><input :id="`recovery-id-${postId}`" v-model="recoveryId" name="recovery-id" maxlength="24" spellcheck="false" autocomplete="off" autocapitalize="none" translate="no"><BButton type="submit" :disabled="pending || busy">Read recovery outcome</BButton></form>
 </section>
</template>

<style scoped>
section { min-width: 0; overflow-wrap: anywhere; }
form { display: grid; gap: .65rem; margin-block: 1rem; min-width: 0; }
label { display: block; min-width: 0; }
select, textarea, input:not([type="checkbox"]) { display: block; width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; }
button { max-width: 100%; white-space: normal; }
</style>
